import { describe, expect, it } from "vitest";
import { updateLinks } from "../src/client/UpdateLinks.js";
import type { InstallProvenance } from "../src/shared/types.js";

const provenance = (overrides: Partial<InstallProvenance> = {}): InstallProvenance => ({
  source: "npm", packageName: "@example/plugin", version: "1.2.3", repositoryUrl: "https://github.com/example/plugin",
  commit: null, requestedTarget: "@example/plugin@latest", resolvedTarget: "@example/plugin@1.2.3",
  integrity: null, repositoryIdentity: "matched", verifiedAt: 0, ...overrides,
});

describe("update reference links", () => {
  it("links the exact npm target and release history without inventing a tag", () => {
    expect(updateLinks(provenance({ version: "2.0.0-rc.1" }))).toEqual([
      { label: "updateNotesNpm", href: "https://www.npmjs.com/package/@example/plugin/v/2.0.0-rc.1" },
      { label: "updateNotesReleases", href: "https://github.com/example/plugin/releases" },
    ]);
  });

  it("links the immutable GitHub target instead of an unverified version or branch", () => {
    const commit = "a".repeat(40);
    expect(updateLinks(provenance({ source: "github", repositoryUrl: "https://github.com/example/plugin.git/", commit }))).toEqual([
      { label: "updateNotesReleases", href: "https://github.com/example/plugin/releases" },
      { label: "updateNotesCommit", href: `https://github.com/example/plugin/commit/${commit}` },
    ]);
    expect(updateLinks(provenance({ source: "github", commit: "main" }))).toHaveLength(1);
  });

  it("normalizes npm's git+https repository metadata to a browser link", () => {
    expect(updateLinks(provenance({ repositoryUrl: "git+https://github.com/example/plugin.git" }))[1]).toEqual({
      label: "updateNotesReleases", href: "https://github.com/example/plugin/releases",
    });
  });

  it.each(["javascript:alert(1)", "https://github.com.evil.test/a/b", "https://user:pass@github.com/a/b", "https://github.com/a/..", "https://github.com/a/b?secret=key", "https://github.com/a/b#frag", "https://github.com/a/b/tree/main"])("does not turn unsafe or ambiguous repository URLs into links: %s", (repositoryUrl) => {
    expect(updateLinks(provenance({ source: "github", repositoryUrl, commit: "a".repeat(40) }))).toEqual([]);
  });

  it("omits malformed npm metadata instead of constructing misleading links", () => {
    expect(updateLinks(provenance({ packageName: "../../evil", repositoryUrl: null }))).toEqual([]);
    expect(updateLinks(provenance({ version: "latest", repositoryUrl: null }))).toEqual([]);
  });
});
