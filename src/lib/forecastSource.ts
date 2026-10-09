import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { parseForecastCsv, type ForecastData, type StationDetail } from "./forecastCsv";
import { knownForecastStation } from "./forecastStationCatalog";

export class ForecastSourceError extends Error {
  constructor(message: string, public status = 503, public code?: string) { super(message); }
}

export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}

export function validMonth(month: string): boolean {
  if (!/^\d{4}-\d{2}$/.test(month)) return false;
  const date = new Date(`${month}-01T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 7) === month;
}

export function monthsInRange(from: string, to: string): string[] {
  if (!validDay(from) || !validDay(to) || from > to) return [];
  const cursor = new Date(`${from.slice(0, 7)}-01T00:00:00Z`);
  const last = to.slice(0, 7);
  const months: string[] = [];
  while (cursor.toISOString().slice(0, 7) <= last) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ForecastSourceError("Forecast storage is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  }).storage.from("forecast-data");
}

type StorageItem = { id?: string | null; name: string; updated_at?: string | null; created_at?: string | null; metadata?: unknown };
export type StationForecastFile = { kind: "daily" | "monthly"; period: string; path: string; version: string; updatedAt: string };
export type StationForecastSnapshot = { file: StationForecastFile; data: ForecastData; text: string };

const versionFor = (item: StorageItem) => createHash("sha256")
  .update(JSON.stringify([item.id, item.updated_at, item.metadata])).digest("hex").slice(0, 20);

async function listStationFiles(station: string, view: "today" | "history", from: string, to: string): Promise<StationForecastFile[]> {
  if (!knownForecastStation(station)) throw new ForecastSourceError("Unknown forecast station.", 404, "station_not_found");
  const bucket = storage();
  if (view === "today") {
    const { data, error } = await bucket.list(`forecast/stations/${station}`, {
      limit: 100, offset: 0, sortBy: { column: "name", order: "asc" }, search: "daily.csv",
    });
    if (error || !data) throw new ForecastSourceError(`Cannot read the daily forecast for ${station}.`);
    const item = (data as StorageItem[]).find(candidate => candidate.name === "daily.csv" && candidate.id);
    return item ? [{ kind: "daily", period: from, path: `forecast/stations/${station}/daily.csv`,
      version: versionFor(item), updatedAt: item.updated_at ?? item.created_at ?? "" }] : [];
  }
  const wanted = new Set(monthsInRange(from, to));
  const { data, error } = await bucket.list(`forecast/stations/${station}/monthly`, {
    limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" },
  });
  if (error || !data) throw new ForecastSourceError(`Cannot read historical forecasts for ${station}.`);
  return (data as StorageItem[]).flatMap(item => {
    const match = /^(\d{4}-\d{2})\.csv$/.exec(item.name);
    if (!match || !item.id || !wanted.has(match[1]) || !validMonth(match[1])) return [];
    return [{ kind: "monthly" as const, period: match[1], path: `forecast/stations/${station}/monthly/${item.name}`,
      version: versionFor(item), updatedAt: item.updated_at ?? item.created_at ?? "" }];
  }).sort((a, b) => a.period.localeCompare(b.period));
}

const snapshots = new Map<string, Promise<StationForecastSnapshot>>();

async function loadSnapshot(station: string, file: StationForecastFile): Promise<StationForecastSnapshot> {
  const key = `${file.path}:${file.version}`;
  const existing = snapshots.get(key);
  if (existing) {
    snapshots.delete(key);
    snapshots.set(key, existing);
    return existing;
  }
  const value = (async () => {
    const { data: blob, error } = await storage().download(file.path, { cacheNonce: file.version }, { cache: "no-store" });
    if (error || !blob) throw new ForecastSourceError(`Could not download ${station} forecast data.`);
    const text = await blob.text();
    let data: ForecastData;
    try { data = parseForecastCsv(text); }
    catch { throw new ForecastSourceError(`The ${station} CSV does not match the expected GHI format.`, 422); }
    if (data.stations.length !== 1 || data.stations[0].id !== station) {
      throw new ForecastSourceError(`The ${station} CSV contains data for another station.`, 422);
    }
    const start = Date.parse(`${file.period}${file.kind === "monthly" ? "-01" : ""}T00:00:00Z`);
    const endDate = new Date(start);
    if (file.kind === "monthly") endDate.setUTCMonth(endDate.getUTCMonth() + 1);
    else endDate.setUTCDate(endDate.getUTCDate() + 1);
    if (Date.parse(data.start) < start || Date.parse(data.end) >= endDate.getTime()) {
      throw new ForecastSourceError(`CSV timestamps do not match ${file.period}.`, 422);
    }
    return { file, data, text };
  })();
  snapshots.set(key, value);
  while (snapshots.size > 200) snapshots.delete(snapshots.keys().next().value!);
  try { return await value; }
  catch (error) { if (snapshots.get(key) === value) snapshots.delete(key); throw error; }
}

export async function loadStationForecast(station: string, view: "today" | "history", from: string, to: string) {
  const files = await listStationFiles(station, view, from, to);
  if (!files.length) throw new ForecastSourceError(`No ${view === "today" ? "daily" : "historical"} forecast has been uploaded for ${station}.`,
    404, "station_not_found");
  return Promise.all(files.map(file => loadSnapshot(station, file)));
}

export function stationDetail(snapshot: StationForecastSnapshot, from: string, to: string): StationDetail | null {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + 86400000;
  const source = snapshot.data.stations[0];
  const rows = source.rows.filter(row => {
    const instant = Date.parse(row.time);
    return instant >= start && instant < end;
  });
  if (!rows.length) return null;
  return { station: { ...source, rows }, series: snapshot.data.series, start: rows[0].time, end: rows.at(-1)!.time };
}
