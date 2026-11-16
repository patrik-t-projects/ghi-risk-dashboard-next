import type { ForecastSegments } from "./forecastCsv";

export type GhiForecastResolution = "hourly" | "15min";

export function normalizeGhiForecastResolution(value: unknown): GhiForecastResolution {
  return value === "15min" ? "15min" : "hourly";
}

const hourStart = (value: string) => {
  const instant = Date.parse(value);
  return Number.isFinite(instant) && new Date(instant).getUTCMinutes() === 0 && new Date(instant).getUTCSeconds() === 0;
};

function interpolatedValue(start: number | null, end: number | null, fraction: number) {
  return start === null || end === null ? null : start + (end - start) * fraction;
}

export function interpolateForecastSegments(segments: ForecastSegments, resolution: GhiForecastResolution): ForecastSegments {
  if (resolution === "hourly") return segments;
  return segments.map(segment => {
    const rows = segment.rows.map(row => ({ ...row, values: [...row.values] }));
    const anchors = rows.flatMap((row, index) => hourStart(row.time) ? [{ index, instant: Date.parse(row.time) }] : []);
    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex++) {
      const start = anchors[anchorIndex];
      const end = anchors[anchorIndex + 1];
      if (end.instant - start.instant !== 3600000) continue;
      for (let rowIndex = start.index + 1; rowIndex < end.index; rowIndex++) {
        const instant = Date.parse(rows[rowIndex].time);
        const fraction = (instant - start.instant) / (end.instant - start.instant);
        if (fraction <= 0 || fraction >= 1) continue;
        rows[rowIndex].values = rows[rowIndex].values.map((original, seriesIndex) =>
          interpolatedValue(rows[start.index].values[seriesIndex] ?? null, rows[end.index].values[seriesIndex] ?? null, fraction) ?? original);
      }
    }
    return { ...segment, rows };
  });
}

const csvNumber = (value: string) => {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatCsvNumber = (value: number) => String(Number(value.toFixed(10)));

export function interpolateForecastCsvRows(header: string[], sourceRows: string[][],
  resolution: GhiForecastResolution): string[][] {
  if (resolution === "hourly") return sourceRows;
  const timeIndex = header.indexOf("datetime");
  const stationIndex = header.indexOf("station_abbr");
  const modelIndex = header.indexOf("Model");
  const runtimeIndex = header.indexOf("Runtime");
  if ([timeIndex, stationIndex, modelIndex, runtimeIndex].some(index => index < 0)) {
    throw new Error("The forecast CSV is missing interpolation columns.");
  }
  const valueIndexes = header.flatMap((column, index) => /^(control|member_\d+)$/.test(column) ? [index] : []);
  const rows = sourceRows.map(row => [...row]);
  const groups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = `${row[stationIndex]}\u0000${row[modelIndex]}\u0000${row[runtimeIndex]}`;
    groups.set(key, [...(groups.get(key) ?? []), index]);
  });
  for (const indexes of groups.values()) {
    indexes.sort((a, b) => Date.parse(rows[a][timeIndex]) - Date.parse(rows[b][timeIndex]));
    const anchors = indexes.filter(index => hourStart(rows[index][timeIndex]));
    for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex++) {
      const startIndex = anchors[anchorIndex];
      const endIndex = anchors[anchorIndex + 1];
      const start = Date.parse(rows[startIndex][timeIndex]);
      const end = Date.parse(rows[endIndex][timeIndex]);
      if (end - start !== 3600000) continue;
      for (const rowIndex of indexes) {
        const instant = Date.parse(rows[rowIndex][timeIndex]);
        if (instant <= start || instant >= end) continue;
        const fraction = (instant - start) / (end - start);
        for (const valueIndex of valueIndexes) {
          const value = interpolatedValue(csvNumber(rows[startIndex][valueIndex]), csvNumber(rows[endIndex][valueIndex]), fraction);
          if (value !== null) rows[rowIndex][valueIndex] = formatCsvNumber(value);
        }
      }
    }
  }
  return rows;
}
