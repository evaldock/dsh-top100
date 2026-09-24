import type { DiagnosticReport } from "../shared/types.js";

const CODES = new Set([
  "profile-missing", "catalog-unreachable", "catalog-stale", "bundle-unresolved",
  "bundle-disabled", "bundle-local", "bundle-unlisted", "peer-mismatch", "peer-missing",
  "host-core-dependency", "duplicate-entry", "skill-manifest-missing",
  "core-multi-version", "patch-orphan", "extra-dependency",
  "user-patch-invalid", "runtime-restart-required", "runtime-failed", "runtime-missing-services",
]);
const count = (value: number): number | null => Number.isFinite(value) && value >= 0 ? value : null;

/** Construct a new payload; never copy free-form fields from the report. */
export function diagnosticSummary(report: DiagnosticReport) {
  const findings: Record<string, number> = {};
  for (const finding of report.findings) {
    const code = CODES.has(finding.code) ? finding.code : "other";
    findings[code] = (findings[code] ?? 0) + 1;
  }
  return {
    schema: "dsh-top100/diagnostic-summary/v1",
    pluginVersion: /^\d+\.\d+\.\d+$/.test(report.pluginVersion) ? report.pluginVersion : null,
    summary: {
      ok: report.summary.ok === true,
      errors: count(report.summary.errors), warnings: count(report.summary.warnings),
      conflicts: count(report.summary.conflicts), dependencies: count(report.summary.dependencies),
    },
    catalog: {
      ok: report.catalog.ok === true,
      latencyMs: report.catalog.latencyMs === null ? null : count(report.catalog.latencyMs),
      staleDays: report.catalog.staleDays === null ? null : count(report.catalog.staleDays),
      total: count(report.catalog.counts.total),
    },
    inventory: {
      official: count(report.inventory.official), community: count(report.inventory.community),
      skills: count(report.inventory.skills), enabled: count(report.inventory.enabled), disabled: count(report.inventory.disabled),
    },
    findings,
  };
}
