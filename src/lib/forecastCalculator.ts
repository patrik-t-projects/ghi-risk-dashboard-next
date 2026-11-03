import type { ForecastSegments, ForecastSeries } from "./forecastCsv";

export type CalculatorForecast = { member: string; label: string; ghi: number | null; control: boolean };

const memberIds = ["control", ...Array.from({ length: 20 }, (_, index) => `member_${index + 1}`)];

export function runTimestamp(run: string): number {
  return Date.parse(`${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T${run.slice(9, 11)}:${run.slice(11, 13)}:00Z`);
}

export function formatRun(run: string): string {
  return `${run.slice(6, 8)}.${run.slice(4, 6)}.${run.slice(0, 4)} ${Number(run.slice(9, 11))} UTC`;
}

export function measuredGhiOptions(segments: ForecastSegments): { time: string; value: number }[] {
  const values = new Map<string, number>();
  for (const segment of segments) {
    for (const row of segment.rows) if (row.measured !== null) values.set(row.time, row.measured);
  }
  return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([time, value]) => ({ time, value }));
}

export function icon2RunOptions(segments: ForecastSegments, currentTime: string, historical: boolean): string[] {
  const latestAllowed = Date.parse(currentTime);
  const runs = new Set<string>();
  for (const segment of segments) {
    for (const series of segment.series) {
      if (series.model === "icon_ch2" && (!historical || runTimestamp(series.run) <= latestAllowed)) runs.add(series.run);
    }
  }
  return [...runs].sort((a, b) => runTimestamp(b) - runTimestamp(a));
}

const hourStart = (time: string) => `${time.slice(0, 13)}:00:00Z`;

function seriesIndexes(segment: ForecastSegments[number], run: string): number[] {
  return segment.series.flatMap((series, index) => series.model === "icon_ch2" && series.run === run ? [index] : []);
}

export function futureHourOptions(segments: ForecastSegments, run: string, currentTime: string): string[] {
  const current = Date.parse(currentTime);
  const hours = new Set<string>();
  for (const segment of segments) {
    const indexes = seriesIndexes(segment, run);
    if (!indexes.length) continue;
    for (const row of segment.rows) {
      const hour = hourStart(row.time);
      if (Date.parse(hour) > current && indexes.some(index => row.values[index] !== null)) hours.add(hour);
    }
  }
  return [...hours].sort();
}

function seriesValue(segments: ForecastSegments, run: string, member: string, hour: string): number | null {
  const end = Date.parse(hour) + 3600000;
  for (const segment of segments) {
    const index = segment.series.findIndex((series: ForecastSeries) =>
      series.model === "icon_ch2" && series.run === run && series.member === member);
    if (index < 0) continue;
    for (const row of segment.rows) {
      const time = Date.parse(row.time);
      const value = row.values[index];
      if (time >= Date.parse(hour) && time < end && value !== null && value !== undefined) return value;
    }
  }
  return null;
}

export function futureGhiValues(segments: ForecastSegments, run: string, hour: string): CalculatorForecast[] {
  return memberIds.map(member => ({
    member,
    label: member === "control" ? "Control" : member.replace("member_", "Member "),
    ghi: seriesValue(segments, run, member, hour),
    control: member === "control",
  }));
}

export function deltaAussp(currentDelta: number, a: number, b: number, currentGhi: number, currentGhiDa: number): number | null {
  if (![currentDelta, a, b, currentGhi, currentGhiDa].every(Number.isFinite) || b === 0) return null;
  return currentDelta - a / b * (currentGhi - currentGhiDa);
}

export function predictedDelta(baseDelta: number | null, a: number, b: number, futureGhi: number, futureGhiDa: number): number | null {
  if (baseDelta === null || ![a, b, futureGhi, futureGhiDa].every(Number.isFinite) || b === 0) return null;
  return baseDelta + a / b * (futureGhi - futureGhiDa);
}
