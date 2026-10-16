import type { Locator, Page } from "playwright";

const SCROLL_BUDGET_MS = 20_000;

/** Scroll the page and any column that can scroll until the locator is on screen. */
export async function revealLocator(page: Page, locator: Locator): Promise<boolean> {
  const deadline = Date.now() + SCROLL_BUDGET_MS;
  if (await shown(locator)) return true;

  const regions = await page.evaluate(() => {
    let count = 0;
    for (const node of document.querySelectorAll<HTMLElement>("*")) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.clientHeight > 80 && node.scrollHeight > node.clientHeight + 24) {
        node.setAttribute("data-tf-scroll", String(count));
        count += 1;
      }
    }
    return count;
  });

  try {
    for (let index = 0; index < regions && Date.now() < deadline; index += 1) {
      const region = page.locator(`[data-tf-scroll="${index}"]`);
      const metrics = await region.evaluate((el) => ({ height: el.clientHeight, total: el.scrollHeight }));
      const step = Math.max(metrics.height - 48, 80);
      for (let top = 0; top <= metrics.total && Date.now() < deadline; top += step) {
        await region.evaluate((el, y) => {
          el.scrollTop = y as number;
          el.dispatchEvent(new Event("scroll", { bubbles: true }));
        }, top);
        await page.waitForTimeout(150);
        if (await shown(locator)) return true;
      }
    }
  } finally {
    await page.evaluate(() => {
      document.querySelectorAll("[data-tf-scroll]").forEach((el) => el.removeAttribute("data-tf-scroll"));
    });
  }
  return shown(locator);
}

async function shown(locator: Locator): Promise<boolean> {
  const count = Math.min(await locator.count().catch(() => 0), 40);
  if (count === 0) return false;
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    try {
      await item.scrollIntoViewIfNeeded({ timeout: 800 });
    } catch {
      continue;
    }
    if (await item.isVisible().catch(() => false)) return true;
  }
  return false;
}

export async function anyVisible(locator: Locator): Promise<boolean> {
  const count = Math.min(await locator.count().catch(() => 0), 40);
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible().catch(() => false)) return true;
  }
  return false;
}
