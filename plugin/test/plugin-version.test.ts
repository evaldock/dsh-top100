import { describe, expect, it } from "vitest";
import { pluginVersionFromStatus, TOP100_PUBLISHED_VERSIONS, TOP100_UPGRADE_GUIDE } from "../src/client/PluginVersion.js";

describe("Top100 version and upgrade entry", () => {
  it("shows the running version, including local candidate versions, without consulting latest", () => {
    expect(pluginVersionFromStatus({ ok: true, name: "dsh-top100", version: "1.3.13" })).toBe("1.3.13");
    expect(pluginVersionFromStatus({ ok: true, name: "dsh-top100", version: "1.4.0-dev.1+local" })).toBe("1.4.0-dev.1+local");
  });

  it.each([null, {}, { ok: false, name: "dsh-top100", version: "1.3.13" }, { ok: true, name: "other", version: "1.3.13" }, { ok: true, name: "dsh-top100", version: "latest" }])("does not present unrelated or invalid status as a version", (status) => {
    expect(pluginVersionFromStatus(status)).toBeNull();
  });

  it("offers published versions and installation instructions without pinning an unreleased build", () => {
    expect(TOP100_PUBLISHED_VERSIONS).toBe("https://www.npmjs.com/package/@evaldock/dsh-top100-plugin?activeTab=versions");
    expect(TOP100_UPGRADE_GUIDE).toBe("https://github.com/evaldock/dsh-top100/blob/main/plugin/README.md#快速开始");
  });
});
