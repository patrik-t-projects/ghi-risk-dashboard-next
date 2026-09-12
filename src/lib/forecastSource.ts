import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { parseForecastCsv, type ForecastData, type ForecastFile } from "./forecastCsv";
export class ForecastSourceError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}
export function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day;
}
function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ForecastSourceError("Forecast storage is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  }).storage.from("forecast-data");
}
let catalog: { expires: number; value: Promise<ForecastFile[]> } | undefined;
export async function listForecastFiles(fresh = false): Promise<ForecastFile[]> {
  if (!fresh && catalog && catalog.expires > Date.now()) return catalog.value;
  const value = (async () => {
    const bucket = storage(); const files: ForecastFile[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list("daily", { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new ForecastSourceError("Cannot read forecast-data/daily. Check that the private bucket exists and the server key has access.");
      for (const item of data) {
        const match = /^icon_ghi_all_stations_(\d{4}-\d{2}-\d{2})\.csv$/.exec(item.name);
        if (!match || !item.id || !validDay(match[1])) continue;
        const version = createHash("sha256").update(JSON.stringify([item.id, item.updated_at, item.metadata])).digest("hex").slice(0, 20);
        files.push({ day: match[1], version, updatedAt: item.updated_at ?? item.created_at ?? "" });
      }
      if (data.length < 1000) break;
    }
    return files.sort((a, b) => a.day.localeCompare(b.day));
  })();
  catalog = { expires: Date.now() + 15000, value };
  try { return await value; } catch (error) { if (catalog?.value === value) catalog = undefined; throw error; }
}
const snapshots = new Map<string, Promise<{ day: string; version: string; data: ForecastData }>>();
export async function loadDailyForecast(day: string, version?: string) {
  if (!validDay(day)) throw new ForecastSourceError("Invalid forecast date.", 400);
  const file = (await listForecastFiles()).find(item => item.day === day);
  if (!file) throw new ForecastSourceError(`No CSV has been uploaded for ${day}.`, 404);
  if (version && version !== file.version) throw new ForecastSourceError("A newer upload is available. Refreshing the forecast…", 409);
  const key = `${day}:${file.version}`;
  const existing = snapshots.get(key);
  if (existing) { snapshots.delete(key); snapshots.set(key, existing); return existing; }
  const value = (async () => {
    const { data: blob, error } = await storage().download(`daily/icon_ghi_all_stations_${day}.csv`, { cacheNonce: file.version }, { cache: "no-store" });
    if (error || !blob) throw new ForecastSourceError(`Could not download the CSV for ${day}.`);
    const current = (await listForecastFiles(true)).find(item => item.day === day);
    if (current?.version !== file.version) throw new ForecastSourceError("The file changed during download. Refreshing the forecast…", 409);
    let data: ForecastData;
    try { data = parseForecastCsv(await blob.text()); }
    catch { throw new ForecastSourceError(`The CSV for ${day} does not match the expected daily GHI format.`, 422); }
    const start = Date.parse(`${day}T00:00:00Z`); const end = start + 86400000;
    if (Date.parse(data.start) <= start || Date.parse(data.end) > end) throw new ForecastSourceError(`CSV timestamps do not match the data day ${day}.`, 422);
    return { day, version: file.version, data };
  })();
  snapshots.set(key, value);
  while (snapshots.size > 3) snapshots.delete(snapshots.keys().next().value!);
  try { return await value; } catch (error) { if (snapshots.get(key) === value) snapshots.delete(key); throw error; }
}
