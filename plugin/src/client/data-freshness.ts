const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function snapshotDay(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const utc = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== value) return null;
  return { label: value, start: utc - 8 * 60 * 60 * 1000 };
}

export function staleSnapshotLabel(metadata: { generatedAt?: unknown; snapshotDate?: unknown } | null | undefined, now = Date.now()): string | null {
  if (!metadata || !Number.isFinite(now)) return null;
  const value = metadata.generatedAt;
  const generated = typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && snapshotDay(value.slice(0, 10)) ? Date.parse(value) : NaN;
  const day = snapshotDay(metadata.snapshotDate);
  const validDay = day && day.start <= now ? day : null;
  const candidates = [];
  if (Number.isFinite(generated) && generated <= now) candidates.push(generated);
  // Date-only metadata has no collection time: allow the whole Beijing day.
  // A later republish must not make an old snapshot appear current.
  if (validDay) candidates.push(validDay.start + DAY_MS);
  if (!candidates.length || now - Math.min(...candidates) <= STALE_AFTER_MS) return null;
  const label = validDay?.label ?? new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(generated));
  return label;
}

