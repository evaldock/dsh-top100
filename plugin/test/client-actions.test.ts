import { TaskStatus } from "../src/client/TaskStatus.js";
import { TaskDetails } from "../src/client/TaskDetails.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// Drive the real component handlers/effects without installing a DOM renderer.
const host = vi.hoisted(() => {
  let cursor = 0; let cells: any[] = []; let effects: Array<() => void> = [];
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  return {
    begin() { cursor = 0; }, flush() { const jobs = effects; effects = []; jobs.forEach((f) => f()); },
    reset() { cells.forEach((cell) => cell?.cleanup?.()); cells = []; effects = []; cursor = 0; },
    useState(initial: any) { const i = cursor++; if (!(i in cells)) cells[i] = { value: typeof initial === "function" ? initial() : initial }; const owned = cells; return [owned[i].value, (next: any) => { owned[i].value = typeof next === "function" ? next(owned[i].value) : next; }]; },
    useRef(initial: any) { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useMemo(fn: () => unknown, deps: unknown[]) { const i = cursor++; if (!(i in cells) || !same(cells[i].deps, deps)) cells[i] = { deps, value: fn() }; return cells[i].value; },
    useEffect(fn: () => void | (() => void), deps: unknown[]) { const i = cursor++; if (!(i in cells) || !same(cells[i].deps, deps)) { const old = cells[i]; cells[i] = { deps }; effects.push(() => { old?.cleanup?.(); cells[i].cleanup = fn(); }); } },
  };
});
vi.mock("react", async (original) => {
  const actual = await original<typeof import("react")>();
  vi.stubGlobal("React", actual);
  return { ...actual, useState: host.useState, useRef: host.useRef, useMemo: host.useMemo, useCallback: (fn: unknown, deps: unknown[]) => host.useMemo(() => fn, deps), useEffect: host.useEffect };
});
import * as React from "react";
import { DescriptionPreview } from "../src/client/DescriptionPreview.js";
import { RankingsPage } from "../src/client/RankingsPage.js";
import { ManagedPage } from "../src/client/ManagedPage.js";
import { useTaskTracker } from "../src/client/use-task-tracker.js";
import { UpdateReview } from "../src/client/UpdateReview.js";

const t = (key: string) => key;
function render(page: typeof RankingsPage | typeof ManagedPage = RankingsPage): ReactElement {
  host.begin();
  const tree = page === ManagedPage ? ManagedPage({ t, tracking: useTaskTracker() }) : RankingsPage({ t });
  host.flush(); return tree;
}
function elements(node: ReactNode): ReactElement<any>[] { if (Array.isArray(node)) return node.flatMap(elements); if (!node || typeof node !== "object" || !("props" in node)) return []; const e = node as ReactElement<any>; return [e, ...elements(e.props.children)]; }
function text(node: ReactNode): string { if (node && typeof node === "object" && "type" in node && node.type === TaskDetails) return text(TaskDetails(node.props as any)); if (Array.isArray(node)) return node.map(text).join(""); if (typeof node === "string" || typeof node === "number") return String(node); return node && typeof node === "object" && "props" in node ? text((node as ReactElement<any>).props.children) : ""; }
function button(tree: ReactNode, label: string) { const found = elements(tree).find((e) => e.type === "button" && text(e).startsWith(label)); expect(found, `button ${label}`).toBeTruthy(); return found!; }
const tick = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function deferred() { let resolve!: (value: Response) => void; let reject!: (reason: Error) => void; const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const item = { rank: 1, fullName: "acme/demo", name: "demo", owner: "acme", description: "Demo", descriptionZh: "演示", stars: 1, dailyStars: 0, weeklyStars: 0, hotScore: 1, forks: 0, openIssues: 0, language: "TypeScript", homepage: null, license: "MIT", topics: [], tags: [], type: "bundle", sources: [], url: "https://github.com/acme/demo", pushedAt: "2026-09-01", createdAt: "2026-08-01", updatedAt: "2026-09-01", installable: true, installed: false, installLocator: { snapshotId: "snapshot", totalRank: 1 }, installSpec: { kind: "npm", spec: "demo@1.0.0" }, evidence: { formFactor: "dsh-bundle", compatible: true, trustLevel: "install-source", signalCodes: [], caveatCode: "not-security-review", signals: [], caveat: "" } };
const catalog = { items: [item], generatedAt: "same", snapshotDate: "2026-09-07", total: 41, categories: [{ id: "tools", label: "Tools", description: "tools", count: 1 }], cache: { ageMs: null }, scopeCounts: { plugins: 1, skills: 1 } };
const preflight = (name = "demo", explicit = false) => ({ name, currentVersion: "1.0.0", preflight: { fullName: "acme/demo", kind: "bundle", approvalToken: `token-${name}`, requiresExplicitApproval: explicit, expiresAt: Date.now() + 600_000, provenance: { source: "npm", repositoryIdentity: "matched", requestedTarget: `${name}@latest`, resolvedTarget: `${name}@2.0.0` }, lifecycleScripts: [{ name: "postinstall", command: "node build.js" }], risks: [{ code: "lifecycle-scripts", severity: "warning", summary: "script", detail: "script" }] } });
let requests: Array<{ url: string; init?: RequestInit }>;
let preparedItems: unknown[] = [];
function updateSessionResponse(init?: RequestInit) {
  const body = JSON.parse(init?.body as string);
  return Promise.resolve(json(body.action === "start" ? { sessionToken: "test-session", expiresAt: Date.now() + 3_600_000 } : body.action === "finalize" ? { items: preparedItems } : { cancelled: true }));
}
beforeEach(() => { host.reset(); requests = []; preparedItems = []; vi.stubGlobal("React", React); const storage = new Map<string, string>(); vi.stubGlobal("window", { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) }, setInterval: () => 1, clearInterval: () => {}, confirm: () => true, addEventListener: () => {}, removeEventListener: () => {} }); vi.stubGlobal("document", { visibilityState: "visible", addEventListener: () => {}, removeEventListener: () => {} }); });
afterEach(() => { host.reset(); vi.unstubAllGlobals(); });

async function rankingSetup() {
  const pending = deferred(); const more = deferred();
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => { requests.push({ url, init }); if (url.includes("install-preflight")) return pending.promise; if (url.includes("offset=1&")) return more.promise; return Promise.resolve(json(url.includes("status") ? { activeBatches: [] } : catalog)); }));
  render(); await tick(); return { pending, more, tree: render() };
}

describe("actual ranking navigation and failure actions", () => {
  it('passes the dated stale qualification to the actual ranking description preview', async () => {
    const staleCatalog = { ...catalog, items: [{ ...item, descriptionPolicy: 'server-v1',
      descriptionZh: '上次已核验的具体插件能力。',
      descriptionStatus: { state: 'stale', reviewedAt: '2026-09-16', reason: '来源核查中' } }] };
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(json(url.includes('status') ? { activeBatches: [] } : staleCatalog))));
    render(); await tick();
    const preview = elements(render()).find(element => element.type === DescriptionPreview);
    expect(preview?.props.text).toBe('旧版简介（2026-09-16 核对，未确认最新变化）：上次已核验的具体插件能力。');
  });

  it("switches between four top-level pages with the correct market scope", async () => {
    let { tree } = await rankingSetup();
    const nav = elements(tree).find((e) => e.type === "nav")!;
    expect(elements(nav).filter((e) => e.type === "button").map(text)).toEqual(["rankings", "skillsMarket", "installedPage", "diagnostics"]);
    button(tree, "skillsMarket").props.onClick(); tree = render(); await tick(); tree = render();
    expect(button(tree, "skillsMarket").props["aria-selected"]).toBe(true);
    expect(button(tree, "rankings").props["aria-selected"]).toBe(false);
    expect(requests.filter((r) => r.url.includes("rankings?")).at(-1)!.url).toContain("catalogScope=skills");
    expect(requests.filter((r) => r.url.includes("rankings?")).at(-1)!.url).toContain("view=total");
    button(tree, "installedPage").props.onClick(); tree = render();
    button(tree, "rankings").props.onClick(); tree = render(); await tick(); tree = render();
    expect(button(tree, "rankings").props["aria-selected"]).toBe(true);
    expect(requests.filter((r) => r.url.includes("rankings?")).at(-1)!.url).toContain("catalogScope=plugins");
    expect(elements(tree).some((e) => e.props.className === "catalog-navigation")).toBe(false);
  });
  it("finds a restored failed Skill in its own directory before retrying", async () => {
    window.localStorage.setItem("dsh-top100:last-install-batch:v1", "failed-skill");
    const task = { batchId: "failed-skill", createdAt: 1, total: 1, completed: 1, requiresRestart: false, jobs: [
      { id: "skill-job", batchId: "failed-skill", action: "install", kind: "skill", fullName: "acme/skill-demo", phase: "failed", activationState: "not-applicable", error: "network timed out" },
    ] };
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("status")) return Promise.resolve(json({ activeBatches: [] }));
      if (url.includes("install-jobs")) return Promise.resolve(json(task));
      if (url.includes("install-preflight")) return deferred().promise;
      if (url.includes("q=acme%2Fskill-demo") && url.includes("catalogScope=skills")) {
        return Promise.resolve(json({ ...catalog, items: [{ ...item, fullName: "acme/skill-demo", type: "skill" }], total: 1 }));
      }
      return Promise.resolve(json({ ...catalog, items: [], total: 0 }));
    }));
    let tree = render();
    for (let i = 0; i < 5; i++) { await tick(); tree = render(); }
    button(TaskStatus(elements(tree).find((node) => node.type === TaskStatus)!.props), "viewLatestTaskResult").props.onClick(); tree = render();
    button(tree, "retry").props.onClick(); await tick(); tree = render();
    expect(requests.find((r) => r.url.includes("q=acme%2Fskill-demo"))?.url).toContain("catalogScope=skills");
    expect(requests.some((r) => r.url.includes("install-preflight"))).toBe(true);
    expect(text(tree)).not.toContain("retryReloadRequired");
  });
  it.each(["scope", "sort", "search", "category", "availability", "section"])("cancels pending preflight through the %s UI action", async (action) => {
    const { pending, tree } = await rankingSetup(); button(tree, "reviewInstall").props.onClick(); let current = render();
    if (action === "scope") button(current, "skillsMarket").props.onClick();
    if (action === "sort") button(current, "total").props.onClick();
    if (action === "availability") button(current, "installableOnly").props.onClick();
    if (action === "section") button(current, "installedPage").props.onClick();
    if (action === "category") { button(current, "allCategories").props.onClick(); current = render(); button(current, "Tools").props.onClick(); }
    if (action === "search") { const field = elements(current).find((e) => e.type === "input" && e.props.type === "search")!; field.props.onChange({ target: { value: "new query" } }); current = render(); button(current, "search").props.onClick(); }
    expect(requests.find((r) => r.url.includes("install-preflight"))!.init!.signal!.aborted).toBe(true);
    pending.resolve(json(preflight().preflight)); await tick(); current = render(); expect(elements(current).some((e) => e.props.role === "dialog")).toBe(false); expect(text(current)).not.toContain("preflightWait");
  });
  it("retries the rankings request when it fails after a preflight failure", async () => {
    const { pending, more, tree } = await rankingSetup(); button(tree, "more").props.onClick(); button(tree, "reviewInstall").props.onClick();
    pending.reject(new Error("source timeout")); await tick(); more.reject(new Error("rankings download failed")); await tick();
    const current = render(); expect(text(current)).toContain("loadError: rankings download failed"); const previous = requests.filter((r) => r.url.includes("install-preflight")).length;
    button(current, "retry").props.onClick(); await tick(); expect(requests.filter((r) => r.url.includes("install-preflight"))).toHaveLength(previous); expect(requests.at(-1)!.url).toContain("rankings?");
  });
});

async function managedSetup(jobResponse?: unknown, overrides: Record<string, unknown> = {}) {
  const pending = deferred(); const entry = { name: "demo", spec: "1.0.0", kind: "bundle", descriptionZh: "演示", protected: false, local: false, updateAvailable: true, latest: "2.0.0", enabled: true, version: "1.0.0", activationState: "live", ...overrides };
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => { requests.push({ url, init }); if (url.includes("status")) return Promise.resolve(json({ activeBatches: [] })); if (url.includes("update-preflight-session")) return updateSessionResponse(init); if (url.includes("update-preflight")) return pending.promise.then(async (response) => { preparedItems = ((await response.clone().json()) as any).items ?? []; return response; }); if (url.includes("install-jobs") && jobResponse) return Promise.resolve(json(jobResponse)); if (url === "/dsh-top100/manage") return Promise.resolve(json({ batchId: "batch", jobs: [], total: 2, completed: 0 })); return Promise.resolve(json({ items: [entry, { ...entry, name: "second" }], total: 2, profile: "web" })); }));
  render(ManagedPage); await tick(); return { pending, tree: render(ManagedPage) };
}

describe("actual managed update actions", () => {
  it("requires explicit review before migrating legacy channels and unlocks updates after migration", async () => {
    let migrationNeeded = true;
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    window.confirm = confirm;
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("status")) return Promise.resolve(json({ activeBatches: [] }));
      if (url === "/dsh-top100/source-migration") {
        const body = JSON.parse(init!.body as string);
        if (body.action === "preflight") return Promise.resolve(json({ approvalToken: "migration-token", items: [{ name: "demo", from: "beta", version: "2.0.0-beta.1" }] }));
        expect(body).toEqual({ action: "apply", approvalToken: "migration-token" });
        migrationNeeded = false; return Promise.resolve(json({ migrated: 1 }));
      }
      return Promise.resolve(json({ sourceMigrationRequired: migrationNeeded, profile: "web", total: 1, items: [{ name: "demo", kind: "bundle", descriptionZh: "演示", version: "2.0.0-beta.1", latest: "2.0.0-beta.2", updateAvailable: true, enabled: true }] }));
    }));
    render(ManagedPage); await tick(); let tree = render(ManagedPage);
    expect(button(tree, "updateAll").props.disabled).toBe(true);
    button(tree, "sourceMigrationAction").props.onClick(); await tick(); tree = render(ManagedPage);
    expect(confirm.mock.calls[0][0]).toContain("demo: beta → 2.0.0-beta.1");
    expect(requests.filter((r) => r.url === "/dsh-top100/source-migration")).toHaveLength(1);
    button(tree, "sourceMigrationAction").props.onClick(); await tick(); tree = render(ManagedPage);
    expect(text(tree)).toContain("sourceMigrationComplete");
    expect(button(tree, "updateAll").props.disabled).toBe(false);
    expect(requests.some((r) => r.url === "/dsh-top100/manage")).toBe(false);
  });
  it("explicitly refreshes cached version information", async () => {
    const { tree } = await managedSetup();
    button(tree, "refreshInstalled").props.onClick();
    expect(requests.at(-1)!.url).toContain("&refresh=1");
  });
  it.each(["2.0.0", "3.0.0-beta.1"])("does not offer a redundant or older update for installed %s", async (version) => {
    const { tree } = await managedSetup(undefined, { version, updateAvailable: false });
    expect(elements(tree).some((e) => e.type === "button" && ["noUpdateAvailable", "update", "checkUpdates"].includes(text(e)))).toBe(false);
    expect(elements(tree).some((e) => e.type === "button" && text(e.props.children).includes("updateAll"))).toBe(false);
    expect(requests.some((r) => r.url.includes("update-preflight") || r.url === "/dsh-top100/manage")).toBe(false);
  });
  it("checks an unknown source without presenting it as an available update", async () => {
    const { pending, tree } = await managedSetup(undefined, { spec: "github:acme/demo", latest: null, updateAvailable: false });
    expect(button(tree, "checkUpdates").props.disabled).toBe(false);
    button(tree, "checkUpdates").props.onClick(); await tick();
    pending.resolve(new Response(JSON.stringify({ error: "已是最新提交，无需更新", code: "no-update" }), { status: 422 }));
    await tick(); const current = render(ManagedPage);
    expect(text(current)).toContain("已是最新提交，无需更新");
    expect(requests.some((r) => r.url.includes("managed?") && r.url.includes("refresh=1"))).toBe(true);
    expect(elements(current).some((e) => e.props.className === "error")).toBe(false);
    expect(requests.some((r) => r.url === "/dsh-top100/manage")).toBe(false);
  });
  it("submits all pinned approvals only after reviewing and accepting the full batch", async () => {
    const { pending, tree } = await managedSetup(); button(tree, "updateAll").props.onClick(); await tick(); expect(JSON.parse(requests.findLast((r) => r.url === "/dsh-top100/update-preflight")!.init!.body as string)).toEqual({ names: ["demo", "second"], strategy: "preserve", partial: true, sessionToken: "test-session" }); expect(requests.some((r) => r.url === "/dsh-top100/manage")).toBe(false);
    pending.resolve(json({ items: [preflight("demo", true), preflight("second")] })); await tick(); let current = render(ManagedPage); let review = elements(current).find((e) => e.type === UpdateReview)!;
    const reviewTree = UpdateReview(review.props); expect(text(reviewTree)).toContain("1.0.0 → demo@2.0.0"); expect(text(reviewTree)).toContain("node build.js"); expect(button(reviewTree, "confirmUpdate").props.disabled).toBe(true);
    review.props.onAccepted(true); current = render(ManagedPage); review = elements(current).find((e) => e.type === UpdateReview)!; review.props.onConfirm(); review.props.onConfirm(); await tick();
    const submissions = requests.filter((r) => r.url === "/dsh-top100/manage"); expect(submissions).toHaveLength(1); expect(JSON.parse(submissions[0].init!.body as string)).toEqual({ action: "update", kind: "bundle", names: ["demo", "second"], approvals: [{ name: "demo", approvalToken: "token-demo", risksAccepted: true }, { name: "second", approvalToken: "token-second", risksAccepted: true }], submissionId: expect.any(String) });
  });
  it("rejects a partial batch and retries the entire preflight", async () => {
    const { pending, tree } = await managedSetup(); button(tree, "updateAll").props.onClick(); pending.resolve(json({ items: [preflight()] })); await tick(); const current = render(ManagedPage);
    expect(text(current)).toContain("updatePreflightIncomplete"); expect(elements(current).some((e) => e.type === UpdateReview)).toBe(false); button(current, "retry").props.onClick(); await tick(); expect(JSON.parse(requests.findLast((r) => r.url === "/dsh-top100/update-preflight")!.init!.body as string)).toEqual({ names: ["demo", "second"], strategy: "preserve", partial: true, sessionToken: "test-session" }); expect(requests.some((r) => r.url === "/dsh-top100/manage")).toBe(false);
  });
  it.each(["failed", "cancelled"])("shows %s recovery details and obtains new approval on retry", async (phase) => {
    const failure = "Update failed; automatic recovery failed. Inspect the profile manually.";
    const { pending, tree } = await managedSetup({ batchId: "batch", jobs: [{ fullName: "demo", action: "update", phase, activationState: phase === "failed" ? "broken" : "restart-required", error: failure, lastLine: "generic wrapper output" }], total: 2, completed: 2, requiresRestart: true });
    button(tree, "updateAll").props.onClick(); pending.resolve(json({ items: [preflight(), preflight("second")] })); await tick();
    const review = elements(render(ManagedPage)).find((e) => e.type === UpdateReview)!;
    review.props.onConfirm(); for (let i = 0; i < 6; i++) { await tick(); render(ManagedPage); } const current = render(ManagedPage);
    expect(text(current)).toContain(`task_update_${phase}`); expect(text(current)).toContain(failure); expect(text(current)).not.toContain("manageComplete");
    button(current, "retry").props.onClick(); await tick(); expect(requests.filter((r) => r.url === "/dsh-top100/update-preflight")).toHaveLength(2); expect(JSON.parse(requests.findLast((r) => r.url === "/dsh-top100/update-preflight")!.init!.body as string)).toEqual({ names: ["demo"], strategy: "preserve", partial: true, sessionToken: "test-session" });
    expect(requests.filter((r) => r.url === "/dsh-top100/manage")).toHaveLength(1);
  });
  it.each(["cancel", "unmount"])("discards a late full batch after %s", async (action) => {
    const { pending, tree } = await managedSetup(); button(tree, "updateAll").props.onClick(); await tick(); const request = requests.at(-1)!; if (action === "cancel") button(render(ManagedPage), "cancel").props.onClick(); else host.reset();
    expect(request.init!.signal!.aborted).toBe(true); pending.resolve(json({ items: [preflight(), preflight("second")] })); await tick(); if (action === "cancel") expect(elements(render(ManagedPage)).some((e) => e.type === UpdateReview)).toBe(false); expect(requests.some((r) => r.url === "/dsh-top100/manage")).toBe(false);
  });
});
