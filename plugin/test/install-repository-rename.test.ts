import { afterEach, expect, it, vi } from "vitest";
import { verifyInstallSpec, clearInstallVerificationCache } from "../src/install/install-verify.js";
afterEach(() => { vi.unstubAllGlobals(); clearInstallVerificationCache(); });
const manifest = { name: "demo", version: "1.0.0", repository: "https://github.com/old/demo.git",
  dist: { integrity: "sha512-test" }, dsh: { bundle: { patch: "patch.yml" } } };
it.each([true, false])("compares immutable repository IDs after rename (match=%s)", async match => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("registry.npmjs.org") ? manifest
    : { id: url.endsWith("old/demo") && !match ? 2 : 1, full_name: "new/demo" }))));
  const result = verifyInstallSpec({ kind: "npm", spec: "demo" }, { expectedRepository: "new/demo" });
  if (match) await expect(result).resolves.toMatchObject({ repositoryIdentity: "matched" });
  else await expect(result).rejects.toThrow("不一致");
});
it("does not treat missing GitHub identity as a verified rename", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(url.includes("registry.npmjs.org") ? manifest : {}))));
  await expect(verifyInstallSpec({ kind: "npm", spec: "demo" }, { expectedRepository: "new/demo" }))
    .rejects.toThrow("暂时无法确认是否为同一仓库");
});
