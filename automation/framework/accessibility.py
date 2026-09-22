"""Lightweight accessibility checks executed on the existing Playwright page.

Phase 1 uses a curated set of high-signal WCAG rules evaluated in the browser,
so no extra runtime dependency or network download is required.
"""

from playwright.sync_api import Page

MAX_REPORTED_VIOLATIONS = 15

# Returns a structured list of violations; nothing is interpolated into this script.
_AUDIT_JS = """
() => {
  const violations = [];

  const describe = (el) => {
    if (!el || !el.tagName) return 'unknown element';
    let text = el.tagName.toLowerCase();
    if (el.id) text += '#' + el.id;
    else if (el.getAttribute && el.getAttribute('name')) text += '[name="' + el.getAttribute('name') + '"]';
    else if (el.className && typeof el.className === 'string' && el.className.trim()) {
      text += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
    }
    const src = el.getAttribute && (el.getAttribute('src') || el.getAttribute('href'));
    if (src) text += ' (' + String(src).slice(0, 60) + ')';
    return text;
  };

  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  };

  const accessibleName = (el) => {
    const aria = (el.getAttribute('aria-label') || '').trim();
    if (aria) return aria;
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => (node.textContent || '').trim());
      if (parts.join(' ').trim()) return parts.join(' ').trim();
    }
    if ((el.textContent || '').trim()) return el.textContent.trim();
    const title = (el.getAttribute('title') || '').trim();
    if (title) return title;
    const img = el.querySelector && el.querySelector('img[alt]');
    if (img && (img.getAttribute('alt') || '').trim()) return img.getAttribute('alt').trim();
    return '';
  };

  const add = (rule, message, el) => {
    violations.push({ rule: rule, message: message, target: describe(el) });
  };

  // 1. Document language
  const lang = (document.documentElement.getAttribute('lang') || '').trim();
  if (!lang) {
    violations.push({
      rule: 'html-has-lang',
      message: 'The <html> element is missing a lang attribute, so screen readers cannot pick a pronunciation.',
      target: 'html',
    });
  }

  // 2. Page title
  if (!(document.title || '').trim()) {
    violations.push({
      rule: 'document-title',
      message: 'The page has no <title>, so users cannot identify it from the tab or history.',
      target: 'head > title',
    });
  }

  // 3. Images need alternative text
  for (const img of Array.from(document.querySelectorAll('img'))) {
    if (!isVisible(img)) continue;
    if (!img.hasAttribute('alt')) {
      add('image-alt', 'Image is missing an alt attribute.', img);
    }
  }

  // 4. Form controls need an accessible label
  for (const field of Array.from(document.querySelectorAll('input, select, textarea'))) {
    if (!isVisible(field)) continue;
    const type = (field.getAttribute('type') || '').toLowerCase();
    if (type === 'hidden' || type === 'submit' || type === 'button' || type === 'reset') continue;
    const hasWrappingLabel = !!field.closest('label');
    const hasLinkedLabel = field.id && !!document.querySelector('label[for="' + CSS.escape(field.id) + '"]');
    const hasAria = !!(field.getAttribute('aria-label') || field.getAttribute('aria-labelledby'));
    if (!hasWrappingLabel && !hasLinkedLabel && !hasAria) {
      add('form-field-label', 'Form field has no associated label or aria-label.', field);
    }
  }

  // 5. Buttons and links need a discernible name
  for (const control of Array.from(document.querySelectorAll('button, a[href], [role="button"]'))) {
    if (!isVisible(control)) continue;
    if (!accessibleName(control)) {
      const rule = control.tagName.toLowerCase() === 'a' ? 'link-name' : 'button-name';
      add(rule, 'Control has no readable text or accessible name.', control);
    }
  }

  // 6. Frames need a title
  for (const frame of Array.from(document.querySelectorAll('iframe'))) {
    if (!(frame.getAttribute('title') || '').trim()) {
      add('frame-title', 'iframe is missing a title attribute.', frame);
    }
  }

  // 7. Duplicate ids break label/aria references
  const seen = {};
  for (const el of Array.from(document.querySelectorAll('[id]'))) {
    const id = el.id;
    if (!id) continue;
    if (seen[id]) {
      violations.push({
        rule: 'duplicate-id',
        message: 'Duplicate element id "' + id + '" breaks label and aria references.',
        target: describe(el),
      });
    }
    seen[id] = true;
  }

  return violations;
}
"""


def run_accessibility_audit(page: Page) -> list[dict]:
    """Return a de-duplicated list of {rule, message, target} violations."""
    raw = page.evaluate(_AUDIT_JS) or []
    unique: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        rule = str(item.get("rule") or "accessibility")
        target = str(item.get("target") or "unknown element")
        signature = (rule, target)
        if signature in seen:
            continue
        seen.add(signature)
        unique.append(
            {"rule": rule, "message": str(item.get("message") or ""), "target": target}
        )
    return unique


def format_violations(violations: list[dict]) -> str:
    shown = violations[:MAX_REPORTED_VIOLATIONS]
    lines = [
        f"Accessibility check failed with {len(violations)} issue(s):",
    ]
    for position, violation in enumerate(shown, start=1):
        lines.append(
            f"{position}. [{violation['rule']}] {violation['message']} — {violation['target']}"
        )
    remaining = len(violations) - len(shown)
    if remaining > 0:
        lines.append(f"...and {remaining} more issue(s).")
    return "\n".join(lines)


def assert_accessibility(page: Page) -> None:
    """Fail the test when accessibility issues are found on the current page."""
    violations = run_accessibility_audit(page)
    if violations:
        raise AssertionError(format_violations(violations))
