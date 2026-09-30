/** Play a recorded TestFlow script. Accepts the existing Python files and new JavaScript recordings. */

/** Keep the recorded path and query, and point the host at the selected environment. */
export function retargetUrl(url: string, baseUrl: string): string {
  const base = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
  const current = new URL(url.includes("://") ? url : baseUrl, base);
  return new URL(`${current.pathname}${current.search}${current.hash}`, base).toString();
}

export function applyEnvironment(source: string, baseUrl: string): string {
  return source.replace(
    /(page\.goto\(\s*)(["'])(https?:\/\/[^"']+)\2/g,
    (full, prefix: string, quote: string, raw: string) => {
      try {
        return `${prefix}${quote}${retargetUrl(raw, baseUrl)}${quote}`;
      } catch {
        return full;
      }
    }
  );
}

export function scriptBody(source: string): string {
  if (/from playwright|def test_/.test(source)) return translatePython(source);
  return translateJavaScript(source);
}

function translatePython(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("#") || line.startsWith("import ") || line.startsWith("from ") || line.startsWith("@") || line.startsWith("def ") || line.startsWith("return ")) {
      continue;
    }
    if (line.startsWith("with page.expect_popup()")) {
      index += 1;
      while (index < lines.length && !lines[index].trim()) index += 1;
      const action = toJavaScriptCall(lines[index]?.trim() ?? "");
      out.push(`await Promise.all([page.waitForEvent("popup"), (async () => { ${action} })()]);`);
      continue;
    }
    if (/^page\d+/.test(line) || line.includes("_info")) continue;
    out.push(toJavaScriptCall(line));
  }
  return out.join("\n");
}

function translateJavaScript(source: string): string {
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  const body = start >= 0 && end > start ? source.slice(start + 1, end) : source;
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("import ") && !line.startsWith("//"))
    .join("\n");
}

function toJavaScriptCall(line: string): string {
  let converted = line
    .replace(/\.get_by_role\(/g, ".getByRole(")
    .replace(/\.get_by_text\(/g, ".getByText(")
    .replace(/\.get_by_label\(/g, ".getByLabel(")
    .replace(/\.get_by_placeholder\(/g, ".getByPlaceholder(")
    .replace(/\.to_have_title\(/g, ".toHaveTitle(")
    .replace(/\bTrue\b/g, "true")
    .replace(/\bFalse\b/g, "false")
    .replace(/\bNone\b/g, "null");
  converted = keywordArguments(converted);
  if (!converted.endsWith(";")) converted += ";";
  if (!converted.startsWith("await ")) converted = `await ${converted}`;
  return converted;
}

function keywordArguments(value: string): string {
  return value.replace(
    /\(([^()]*)\)/g,
    (full, inner: string) => {
      if (!/=/.test(inner)) return full;
      const parts = splitArgs(inner);
      const positional: string[] = [];
      const named: string[] = [];
      for (const part of parts) {
        const match = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]+)$/);
        if (match) named.push(`${match[1]}: ${match[2]}`);
        else positional.push(part);
      }
      if (named.length === 0) return full;
      return `(${[...positional, `{ ${named.join(", ")} }`].join(", ")})`;
    }
  );
}

function splitArgs(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const character of value) {
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === ",") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
