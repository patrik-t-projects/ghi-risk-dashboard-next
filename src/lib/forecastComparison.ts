import type { ForecastSegments } from "./forecastCsv";

export const comparisonColors = ["#2563eb", "#f97316", "#7c3aed", "#dc2626", "#0891b2", "#db2777"] as const;

export function compactRunLabel(run: string): string {
  return `${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(9, 11)}`;
}

export function comparisonRunColor(run: string, selectedRuns: readonly string[]): string {
  const index = selectedRuns.indexOf(run);
  return comparisonColors[index < 0 ? 0 : index % comparisonColors.length];
}

export function observationDays(segments: ForecastSegments): string[] {
  const days = new Set<string>();
  for (const segment of segments) {
    for (const row of segment.rows) if (row.measured !== null) days.add(row.time.slice(0, 10));
  }
  return [...days].sort();
}

export function sharedGhiRange(segments: ForecastSegments, selectedRuns?: readonly string[]): [number, number] {
  const selected = selectedRuns ? new Set(selectedRuns) : null;
  let maximum = 0;
  for (const segment of segments) {
    const indexes = segment.series.flatMap((series, index) => !selected || selected.has(series.run) ? [index] : []);
    for (const row of segment.rows) {
      if (row.measured !== null) maximum = Math.max(maximum, row.measured);
      for (const index of indexes) {
        const value = row.values[index];
        if (value !== null && value !== undefined) maximum = Math.max(maximum, value);
      }
    }
  }
  const upper = Math.max(100, Math.ceil(maximum * 1.08 / 50) * 50);
  return [0, upper];
}
