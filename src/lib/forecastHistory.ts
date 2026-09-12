import type { ForecastSegments, ForecastSeries, StationDetail, StationForecast } from "./forecastCsv";

/** Keep daily series sparse. A month of separate runs must not become a huge
 * time × all-runs matrix full of nulls. */
export function combineStationDays(days: StationDetail[]): { station: StationForecast; series: ForecastSeries[]; segments: ForecastSegments } {
  if (!days.length) throw new Error("No station data in the selected range.");
  const ordered = [...days].sort((a, b) => a.start.localeCompare(b.start));
  const series = [...new Map(ordered.flatMap(day => day.series).map(s => [s.key, s])).values()]
    .sort((a, b) => a.model.localeCompare(b.model) || a.run.localeCompare(b.run) || a.member.localeCompare(b.member, undefined, { numeric: true }));
  return { station: { ...ordered.at(-1)!.station, rows: [] }, series,
    segments: ordered.map(day => ({ series: day.series, rows: day.station.rows })) };
}

export function seriesPoints(segments: ForecastSegments, key?: string): { x: string[]; y: (number | null)[] } {
  const values = new Map<string, number | null>();
  for (const segment of segments) {
    const index = key ? segment.series.findIndex(s => s.key === key) : -1;
    if (key && index < 0) continue;
    for (const row of segment.rows) values.set(row.time, key ? row.values[index] : row.measured);
  }
  const points = [...values.entries()].sort(([a], [b]) => a.localeCompare(b));
  const x: string[] = []; const y: (number | null)[] = [];
  let previous = 0;
  for (const [time, value] of points) {
    const instant = Date.parse(time);
    if (previous && instant - previous > 900000) {
      x.push(new Date(previous + 900000).toISOString().replace(/Z$/, "")); y.push(null);
    }
    x.push(time.replace(/Z$/, "")); y.push(value); previous = instant;
  }
  return { x, y };
}
