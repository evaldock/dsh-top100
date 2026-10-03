import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { normalizeSearchText, scoreSearchEntry } from "../public/search-engine.js";
import { CATEGORY_DEFINITIONS } from "../public/category-system.js";

const html = readFileSync(new URL("../public/skills.html", import.meta.url), "utf8");
const script = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/import\s+[\s\S]*?;\n/g, "")
  .replace("void loadSkills();", "globalThis.initialLoad = loadSkills();");

// Execute the actual page module and handlers with a small DOM and controlled
// data, so recovery is checked without browser packages.
class Element {
  constructor() {
    this.dataset = {};
    this.hidden = false;
    this.value = "";
    this.textContent = "";
    this.children = [];
    this.nodes = new Map();
    this.attributes = new Map();
    this.handlers = new Map();
  }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  emit(type, event = {}) { return this.handlers.get(type)?.(event); }
  focus() { this.focused = true; }
  appendChild(node) { this.children.push(node); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) {
    this.children = nodes.flatMap(node => node.fragment ? node.children : [node]);
  }
  cloneNode() { return new Element(); }
  get childElementCount() { return this.children.length; }
}

function createPage({ offline = false } = {}) {
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, new Element());
    return nodes.get(selector);
  };
  const categories = CATEGORY_DEFINITIONS.map(({ id }) => {
    const button = new Element();
    button.dataset.category = id;
    return button;
  });
  node("#skill-category-description").hidden = true;
  for (const selector of ["#skill-template", "#featured-skill-template"]) {
    node(selector).content = new Element();
  }
  const entries = Array.from({ length: 250 }, (_, index) => ({
    name: `skill-${index + 1}`, fullName: `example/skill-${index + 1}`,
    type: "skill", stars: 1000 - index,
    description: index === 149 ? "浏览器研究工具" : "代码工具",
    categories: [index % 2 === 0 ? "coding" : "knowledge"],
  }));
  const requests = [];
  const transport = { offline };
  const context = vm.createContext({
    CATEGORY_DEFINITIONS, normalizeSearchText, scoreSearchEntry, URLSearchParams,
    renderCategoryOptions() {}, enhanceDescriptions() {}, renderDataFreshness() {},
    descriptionFor: entry => entry.description,
    descriptionDisplayFor: entry => entry.description,
    console: { error() {}, warn() {} },
    document: {
      querySelector: node,
      querySelectorAll: () => categories,
      createElement: () => new Element(),
      createDocumentFragment: () => Object.assign(new Element(), { fragment: true }),
    },
    window: {
      location: { search: '' },
    },
    fetch: async url => {
      requests.push(url);
      if (transport.offline) throw new Error("offline");
      return { ok: true, json: async () => url.includes("manifest")
        ? { generatedAt: "2026-10-02T00:00:00Z", datasets: { skills: { url: "/data/snapshots/current/skills.json" } } }
        : { generatedAt: "2026-10-02T00:00:00Z", rankings: entries } };
    },
  });
  vm.runInContext(script + "\nglobalThis.getState = () => ({ loadState, pendingLoad, activeCategory });", context);
  return {
    context, node, categories, requests, transport,
    rankedRows: () => node("#skill-grid").children.filter(row => row.nodes.has(".skill-number")),
  };
}

test("Skills renders the whole directory with the original filter and result numbering", async () => {
  const page = createPage();
  await page.context.initialLoad;
  assert.equal(page.rankedRows().length, 250);
  page.categories.find(button => button.dataset.category === "knowledge").emit("click");
  assert.equal(page.rankedRows().length, 125);
  assert.equal(page.rankedRows()[0].querySelector("h3").textContent, "skill-2");
  assert.equal(page.rankedRows()[0].querySelector(".skill-number").textContent, "#001");
  page.node("#search").value = "浏览器";
  page.node("#search").emit("input");
  assert.equal(page.rankedRows().length, 1);
  assert.equal(page.rankedRows()[0].querySelector("h3").textContent, "skill-150");
});

test("Skills failure stays visible through filtering and retry preserves choices without duplicate requests", async () => {
  const page = createPage({ offline: true });
  await page.context.initialLoad;
  const failedRows = page.node("#skill-grid").children;
  const failedStatus = page.node("#status").textContent;
  page.node("#search").value = "浏览器";
  page.node("#search").emit("input");
  page.categories.find(button => button.dataset.category === "knowledge").emit("click");
  assert.equal(page.node("#skill-grid").children, failedRows);
  assert.equal(page.node("#status").textContent, failedStatus);
  assert.equal(page.context.getState().loadState, "error");
  page.transport.offline = false;
  const retry = failedRows[0].children.at(-1);
  retry.emit("click");
  retry.emit("click");
  await page.context.getState().pendingLoad;
  assert.equal(page.requests.length, 3, "one failed manifest, one retry manifest, one Skills dataset");
  assert.equal(page.context.getState().loadState, "ready");
  assert.equal(page.node("#search").value, "浏览器");
  assert.equal(page.context.getState().activeCategory, "knowledge");
  assert.equal(page.rankedRows().length, 1);
  assert.equal(page.rankedRows()[0].querySelector("h3").textContent, "skill-150");
  assert.equal(page.node("#skill-grid").attributes.has("aria-busy"), false);
});
