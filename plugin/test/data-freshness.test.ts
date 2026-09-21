import { describe, expect, it } from "vitest";
import { staleSnapshotLabel } from "../src/client/data-freshness.js";

const now = Date.parse("2026-09-21T08:00:00Z");
describe("snapshot freshness independent of download and republish time", () => {
  it("warns only after 36 hours and changes as time passes", () => {
    const generatedAt = new Date(now - 36 * 3600_000).toISOString();
    expect(staleSnapshotLabel({ generatedAt }, now)).toBeNull();
    expect(staleSnapshotLabel({ generatedAt }, now + 1)).toBe("2026-09-20");
  });
  it("does not hide an old snapshot behind a new publication time", () => {
    expect(staleSnapshotLabel({ snapshotDate: "2026-09-18", generatedAt: new Date(now).toISOString() }, now)).toBe("2026-09-18");
  });
  it("allows the whole Beijing snapshot day when collection time is unknown", () => {
    const boundary = Date.parse("2026-09-21T04:00:00Z");
    expect(staleSnapshotLabel({ snapshotDate: "2026-09-19" }, boundary)).toBeNull();
    expect(staleSnapshotLabel({ snapshotDate: "2026-09-19" }, boundary + 1)).toBe("2026-09-19");
  });
  it.each([undefined, null, {}, { snapshotDate: "2026-02-30" }, { generatedAt: "yesterday" }, { snapshotDate: "2026-09-22", generatedAt: "2026-09-22T00:00:00Z" }])("does not invent a stale date from absent, invalid or future metadata: %j", (metadata) => {
    expect(staleSnapshotLabel(metadata, now)).toBeNull();
  });
  it("falls back to the timestamp's Beijing date", () => {
    expect(staleSnapshotLabel({ snapshotDate: "bad", generatedAt: "2026-09-18T20:00:00Z" }, now)).toBe("2026-09-19");
  });
});
