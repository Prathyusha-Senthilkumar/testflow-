import assert from "node:assert/strict";
import { test } from "node:test";
import { exactText, listedTextPattern, scriptBody, textIsListed } from "./playback.js";

test("listed text matches an exact curriculum name and ignores longer names", () => {
  assert.equal(textIsListed("curr", "curr"), true);
  assert.equal(textIsListed("  CURR  ", "curr"), true);
  assert.equal(textIsListed("Curricula", "curr"), false);
  assert.equal(textIsListed("Author and manage cohort curricula.", "curr"), false);
  assert.equal(textIsListed("curr-1", "curr"), false);
  assert.equal(textIsListed("currr-1", "curr"), false);
  assert.equal(textIsListed("Gen AI Curricula by Shabbir", "curr"), false);
  assert.equal(textIsListed("curr-1", "curr-1"), true);
  assert.equal(textIsListed("currr-1", "curr-1"), false);
  assert.equal(textIsListed("java", "java"), true);
  assert.equal(textIsListed("JAVA_FSD_Test", "java"), true);
  assert.equal(textIsListed("javascript", "java"), false);
  const page = "Curricula\ncurrr-1\nJAVA_FSD_Test\ncurr\n";
  assert.equal(textIsListed(page, "curr"), true);
  assert.equal(textIsListed(page.replace("curr\n", ""), "curr"), false);
  assert.equal(listedTextPattern("curr").test("Curricula"), false);
  assert.equal(listedTextPattern("java").test("JAVA_FSD_Test"), true);
});

test("option-less text lookup becomes a listed-label match", () => {
  const source = [
    "def test_agent(page):",
    '    page.goto("https://example.test/admin/curricula")',
    '    expect(page.get_by_text("curr")).to_be_visible()',
    '    expect(page.get_by_text("curr-1")).to_be_visible()',
    '    expect(page.get_by_text("java")).to_be_visible()',
    '    expect(page.get_by_text("curr", exact=True)).to_be_visible()',
  ].join("\n");
  const body = scriptBody(source);
  assert.ok(body.includes("getByText(/(?:^|[^A-Za-z0-9-])curr(?![A-Za-z0-9-])/i)"));
  assert.ok(body.includes("getByText(/(?:^|[^A-Za-z0-9-])curr-1(?![A-Za-z0-9-])/i)"));
  assert.ok(body.includes("getByText(/(?:^|[^A-Za-z0-9-])java(?![A-Za-z0-9-])/i)"));
  assert.ok(body.includes('getByText("curr", { exact: true })'));
  assert.equal(exactText('page.getByText("curr", { exact: false })'), 'page.getByText("curr", { exact: false })');
});
