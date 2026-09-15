import asyncio
import re
from typing import List, Set, Optional, Dict, Any
from urllib.parse import urljoin, urlparse
from playwright.async_api import async_playwright, Browser, BrowserContext, Page

from app.schemas.crawler import AuthConfig, DiscoveredPage, FormInfo, FormInputInfo


class CrawlerService:
    def __init__(self):
        pass

    def _is_same_domain(self, url1: str, url2: str) -> bool:
        parsed1 = urlparse(url1)
        parsed2 = urlparse(url2)
        return parsed1.netloc == parsed2.netloc

    def _normalize_url(self, url: str) -> str:
        # Strip fragment (#) and trailing slash
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")
        normalized = f"{parsed.scheme}://{parsed.netloc}{path}"
        if parsed.query:
            normalized = f"{normalized}?{parsed.query}"
        return normalized

    async def authenticate_approach_a(self, page: Page, auth: AuthConfig) -> Optional[Dict[str, Any]]:
        """
        Executes Approach A: Navigates to login_url, auto-detects or uses specific
        selectors for username/password and submit button, submits, and waits for redirect.
        Returns the captured storage state (cookies, tokens, storage).
        """
        try:
            print(f"[CrawlerService] Authenticating via Approach A at: {auth.login_url}")
            await page.goto(auth.login_url, wait_until="networkidle", timeout=30000)

            # 1. Username / Email field locator
            if auth.username_selector:
                user_loc = page.locator(auth.username_selector)
            else:
                user_loc = (
                    page.locator("input[type='email']")
                    .or_(page.locator("input[name*='user' i]"))
                    .or_(page.locator("input[name*='email' i]"))
                    .or_(page.locator("input[id*='user' i]"))
                    .or_(page.locator("input[id*='email' i]"))
                    .or_(page.get_by_placeholder(re.compile(r"email|username|user", re.I)))
                    .first
                )

            await user_loc.wait_for(state="visible", timeout=10000)
            await user_loc.fill(auth.username)

            # 2. Password field locator
            if auth.password_selector:
                pwd_loc = page.locator(auth.password_selector)
            else:
                pwd_loc = (
                    page.locator("input[type='password']")
                    .or_(page.locator("input[name*='pass' i]"))
                    .or_(page.get_by_placeholder(re.compile(r"password|pass", re.I)))
                    .first
                )

            # Check if password field is visible (in case of two-step login)
            if not await pwd_loc.is_visible():
                # Attempt to click "Next" or submit first if two-step
                next_btn = page.get_by_role("button", name=re.compile(r"next|continue", re.I))
                if await next_btn.is_visible():
                    await next_btn.click()
                    await page.wait_for_timeout(1000)

            await pwd_loc.wait_for(state="visible", timeout=10000)
            await pwd_loc.fill(auth.password)

            # 3. Submit button locator
            if auth.submit_selector:
                submit_loc = page.locator(auth.submit_selector)
            else:
                submit_loc = (
                    page.locator("button[type='submit']")
                    .or_(page.locator("input[type='submit']"))
                    .or_(page.get_by_role("button", name=re.compile(r"log in|sign in|submit|login", re.I)))
                    .first
                )

            # Click and wait for navigation away from login
            login_url_parsed = urlparse(auth.login_url)
            async with page.expect_navigation(timeout=15000, wait_until="networkidle"):
                await submit_loc.click()

            # Wait briefly for client-side cookies/tokens to settle
            await page.wait_for_timeout(1500)

            # Extract storage state
            storage_state = await page.context.storage_state()
            print("[CrawlerService] Authentication successful, storage state captured.")
            return storage_state

        except Exception as e:
            print(f"[CrawlerService] Authentication failed or timed out: {e}")
            # Try capturing storage state anyway in case login still succeeded
            try:
                return await page.context.storage_state()
            except Exception:
                raise RuntimeError(f"Failed to authenticate at {auth.login_url}: {str(e)}")

    async def crawl(
        self,
        base_url: str,
        max_depth: int = 2,
        max_pages: int = 10,
        auth: Optional[AuthConfig] = None,
        progress_callback = None
    ) -> List[DiscoveredPage]:
        """
        Crawls base_url up to max_depth and max_pages.
        Visits internal pages, gathers forms, action elements, and metadata.
        """
        discovered_pages: List[DiscoveredPage] = []
        visited: Set[str] = set()
        queue: List[Dict[str, Any]] = [{"url": base_url, "depth": 0}]

        async with async_playwright() as p:
            browser: Browser = await p.chromium.launch(headless=True)
            context: BrowserContext = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) TestFlow-Crawler/1.0"
            )
            page: Page = await context.new_page()

            # Execute authentication if requested (Approach A)
            if auth and auth.login_url and auth.username:
                if progress_callback:
                    await progress_callback("authenticating", 10, f"Logging in to {auth.login_url}...")
                storage_state = await self.authenticate_approach_a(page, auth)
                if storage_state:
                    await context.close()
                    # Recreate context with authenticated storage state
                    context = await browser.new_context(storage_state=storage_state)
                    page = await context.new_page()

            while queue and len(discovered_pages) < max_pages:
                current_item = queue.pop(0)
                curr_url = current_item["url"]
                curr_depth = current_item["depth"]

                normalized = self._normalize_url(curr_url)
                if normalized in visited:
                    continue
                visited.add(normalized)

                if progress_callback:
                    pct = int(15 + (len(discovered_pages) / max_pages) * 60)
                    await progress_callback(
                        "crawling",
                        pct,
                        f"Visiting page ({len(discovered_pages) + 1}/{max_pages}): {curr_url}"
                    )

                page_record = await self._analyze_page(page, curr_url, curr_depth)
                discovered_pages.append(page_record)

                # Find new links if depth allows
                if curr_depth < max_depth and len(discovered_pages) < max_pages:
                    for link in page_record.links:
                        norm_link = self._normalize_url(link)
                        if (
                            norm_link not in visited
                            and self._is_same_domain(base_url, norm_link)
                            and not any(item["url"] == link for item in queue)
                        ):
                            # Avoid common static asset extensions or logouts
                            lower_link = norm_link.lower()
                            if not any(lower_link.endswith(ext) for ext in [".pdf", ".jpg", ".png", ".zip", ".css", ".js"]) and "logout" not in lower_link:
                                queue.append({"url": link, "depth": curr_depth + 1})

            await browser.close()

        return discovered_pages

    async def _analyze_page(self, page: Page, url: str, depth: int) -> DiscoveredPage:
        try:
            response = await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            status_code = response.status if response else 200
            # Brief pause for dynamic hydration
            await page.wait_for_timeout(500)

            title = await page.title() or url

            # 1. Extract Forms and their inputs
            forms_data = await page.eval_on_selector_all(
                "form",
                """forms => forms.map(f => {
                    const inputs = Array.from(f.querySelectorAll("input, select, textarea")).map(i => ({
                        name: i.getAttribute("name") || i.getAttribute("id") || "",
                        type: i.getAttribute("type") || "text",
                        placeholder: i.getAttribute("placeholder") || "",
                        required: i.hasAttribute("required")
                    }));
                    return {
                        action: f.getAttribute("action") || "",
                        method: (f.getAttribute("method") || "GET").toUpperCase(),
                        inputs: inputs,
                        has_submit: !!f.querySelector("button[type='submit'], input[type='submit'], button:not([type])")
                    };
                })"""
            )
            forms = [FormInfo(**f) for f in forms_data]

            # 2. Extract Buttons / Interactive elements
            buttons = await page.eval_on_selector_all(
                "button, a.btn, input[type='button'], input[type='submit']",
                """elements => elements.slice(0, 15).map(e => (e.innerText || e.value || '').trim()).filter(Boolean)"""
            )

            # 3. Extract internal hrefs
            raw_links = await page.eval_on_selector_all(
                "a[href]",
                "elements => elements.map(el => el.href)"
            )
            links = []
            for href in raw_links:
                if href and href.startswith("http"):
                    links.append(href)

            return DiscoveredPage(
                url=url,
                title=title,
                status_code=status_code,
                forms=forms,
                buttons=list(set(buttons))[:10],
                links=list(set(links))[:30],
                depth=depth
            )

        except Exception as e:
            return DiscoveredPage(
                url=url,
                title=url,
                status_code=500,
                depth=depth,
                error=str(e)
            )


crawler_service = CrawlerService()
