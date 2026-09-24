import { expect, it } from "vitest";
import { diagnosticView, diagnosticNextStep } from "../src/client/diagnostic-view.js";
import type { DiagnosticReport, DiagnosticFinding, DiagnosticBundle } from "../src/shared/types.js";
const finding = (severity: DiagnosticFinding["severity"], code: string, subject = "demo", parameters?: DiagnosticFinding["parameters"]): DiagnosticFinding => ({ severity, code, subject, parameters, message: code });
const report = (findings: DiagnosticFinding[], bundles: Partial<DiagnosticBundle>[] = []) => ({ findings, bundles }) as DiagnosticReport;
it("groups by owner, prioritizes errors, and keeps distinct missing dependencies", () => {
  const first = finding("error", "peer-missing", "demo", { dependency: "a" });
  const result = diagnosticView(report([finding("warning", "peer-mismatch", "other"), first, first,
    finding("error", "peer-missing", "demo", { dependency: "b" }), finding("warning", "host-core-dependency", "demo")]));
  expect(result.issues.map((group) => [group.subject, group.severity, group.findings.length])).toEqual([["demo", "error", 3], ["other", "warning", 1]]);
});
it("separates pending restart and routine notes from actionable issues", () => {
  const result = diagnosticView(report([finding("info", "bundle-disabled"), finding("info", "bundle-local"), finding("info", "runtime-restart-required")],
    [{ name: "demo", enabled: false, runtime: { state: "restart-required", reason: "pending" } }]));
  expect(result.issues).toEqual([]);
  expect(result.notes.map((item) => item.code)).toEqual(["bundle-disabled", "bundle-local"]);
  expect(result.pending.map((item) => item.name)).toEqual(["demo"]);
  expect(result.unverified).toEqual([]);
});
it("does not claim unknown or inactive enabled plugins are healthy, or flag intentionally disabled plugins", () => {
  const result = diagnosticView(report([], [{ name: "unknown", enabled: true, runtime: { state: "unknown", reason: "unavailable" } },
    { name: "inactive", enabled: true, runtime: { state: "inactive", reason: "unavailable" } }, { name: "no-runtime", enabled: true },
    { name: "disabled", enabled: false, runtime: { state: "inactive", reason: "disabled" } }]));
  expect(result.unverified.map((item) => item.name)).toEqual(["unknown", "inactive", "no-runtime"]);
});
it("provides translated safe next steps for known and future findings", () => {
  expect(diagnosticNextStep("peer-missing", "zh")).toContain("必需依赖");
  expect(diagnosticNextStep("runtime-failed", "en")).toContain("logs");
  expect(diagnosticNextStep("future", "en")).not.toMatch(/\p{Script=Han}/u);
});
