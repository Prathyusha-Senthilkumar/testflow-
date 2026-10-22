import assert from "node:assert/strict";
import test from "node:test";
import { bindControl, contentName, isPlaceholder, openDiscoveredPage } from "./agentRecord.js";

test("a placeholder search value is not a real item name", () => {
  assert.equal(isPlaceholder("word"), true);
  assert.equal(isPlaceholder("Algebra"), false);
});

test("a new link on the opened page is the search text", () => {
  const name = contentName(
    [
      { name: "Content Lake", path: "/admin/content" },
      { name: "Algebra", path: "/admin/content/algebra" },
    ],
    [{ name: "Content Lake", path: "/admin/content" }],
    "/admin/content"
  );
  assert.equal(name, "Algebra");
});

test("a child item is the search text even when discovery already stored it", () => {
  const name = contentName(
    [
      { name: "Content Lake", path: "/admin/content" },
      { name: "Algebra", path: "/admin/content/algebra" },
    ],
    [
      { name: "Content Lake", path: "/admin/content" },
      { name: "Algebra", path: "/admin/content/algebra" },
    ],
    "/admin/content"
  );
  assert.equal(name, "Algebra");
});

test("a visible row title is used when the page has no item link", () => {
  const name = contentName([{ name: "Content Lake", path: "/admin/content" }], [{ name: "Content Lake", path: "/admin/content" }], "/admin/content", [
    "Content Lake",
    "Algebra",
  ]);
  assert.equal(name, "Algebra");
});

test("a missing field is rejected with the fields that exist", () => {
  const bound = bindControl({ action: "fill", target: "Search", value: "Algebra" }, [
    { role: "link", name: "Content Lake" },
    { role: "textbox", name: "Filter by title" },
  ]);
  assert.equal(bound.step.target, "Filter by title");
  assert.equal(bound.error, "");
});

test("a repeated page name opens the link on the current page", () => {
  const step = openDiscoveredPage(
    { action: "click", target: "Content Lake", value: "" },
    [
      {
        name: "Admin Dashboard",
        path: "/admin",
        controls: [{ role: "link", name: "Content Lake", path: "/admin/content" }],
      },
      { name: "Content Lake", path: "/admin/content" },
      { name: "Content Lake", path: "/admin/content-factory/library" },
    ],
    "/admin"
  );
  assert.deepEqual(step, { action: "goto", target: "/admin/content", value: "/admin/content" });
});

test("a click on a page found after navigation opens that path", () => {
  const step = openDiscoveredPage({ action: "click", target: "Algebra", value: "" }, [
    { name: "Algebra", path: "/admin/content/algebra" },
  ]);
  assert.deepEqual(step, { action: "goto", target: "/admin/content/algebra", value: "/admin/content/algebra" });
});
