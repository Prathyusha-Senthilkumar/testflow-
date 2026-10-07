export function friendlyStepLabel(raw: string): string {
  const line = raw.replace(/^await\s+/, "").replace(/;$/, "").trim();
  if (!line || /^final screenshot$/i.test(line)) return "Final screenshot";

  const opened = line.match(/page\.goto\(\s*["']([^"']+)["']/);
  if (opened) {
    try {
      const url = new URL(opened[1]);
      const path = url.pathname === "/" ? "" : url.pathname;
      return `Open ${url.host}${path}`;
    } catch {
      return `Open ${opened[1]}`;
    }
  }

  const role = line.match(/getByRole\(\s*["']([^"']+)["']\s*,\s*\{\s*name:\s*["']([^"']+)["']/);
  const byText = line.match(/getByText\(\s*["']([^"']+)["']/);
  const byLabel = line.match(/getByLabel\(\s*["']([^"']+)["']/);
  const byPlaceholder = line.match(/getByPlaceholder\(\s*["']([^"']+)["']/);
  const byLocator = line.match(/locator\(\s*["']([^"']+)["']/);
  const target = role
    ? `the ${role[2]} ${role[1]}`
    : byText?.[1] || byLabel?.[1] || byPlaceholder?.[1] || byLocator?.[1];

  if (/\.click\(/.test(line) && target) return `Click ${target}`;
  if (/\.dblclick\(/.test(line) && target) return `Double-click ${target}`;
  if (/\.hover\(/.test(line) && target) return `Hover over ${target}`;
  if (/\.check\(/.test(line) && target) return `Check ${target}`;
  if (/\.uncheck\(/.test(line) && target) return `Uncheck ${target}`;
  if (/\.fill\(/.test(line)) {
    const value = line.match(/\.fill\(\s*["']([^"']*)["']/);
    if (target && value) return `Enter "${value[1]}" in ${target}`;
    if (target) return `Type into ${target}`;
  }
  if (/\.press\(/.test(line)) {
    const key = line.match(/\.press\(\s*["']([^"']+)["']/);
    return key && target ? `Press ${key[1]} in ${target}` : key ? `Press ${key[1]}` : "Press a key";
  }
  if (/\.selectOption\(/.test(line) && target) return `Choose an option in ${target}`;
  if (/toHaveTitle\(/.test(line)) {
    const title = line.match(/toHaveTitle\(\s*["']([^"']+)["']/);
    return title ? `Check the page title is "${title[1]}"` : "Check the page title";
  }
  if (line.length <= 90 && !/page\.|getBy|locator\(/.test(line)) return line;
  return "Complete the next action";
}
