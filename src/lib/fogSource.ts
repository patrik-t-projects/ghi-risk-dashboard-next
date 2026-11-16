import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseFogCsv, type FogData } from "./fogCsv";

export type FogRuntimeSlot = "day-ahead" | "intraday-00" | "intraday-06";
export type FogRuntimeOption = { slot: FogRuntimeSlot; runtime: string; available: boolean };

export class FogSourceError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new FogSourceError("Fog forecast storage is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  }).storage.from("forecast-data");
}

const iso = (date: Date, hour: number) => `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00Z`;

export function fogRuntimeOptions(now = new Date()): FogRuntimeOption[] {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today); yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return [
    { slot: "day-ahead", runtime: iso(yesterday, 0), available: false },
    { slot: "intraday-00", runtime: iso(today, 0), available: false },
    { slot: "intraday-06", runtime: iso(today, 6), available: false },
  ];
}

type FogFile = { path: string; version: string };
const snapshots = new Map<string, Promise<{ data: FogData; version: string }>>();

async function findFile(path: string): Promise<FogFile | null> {
  const slash = path.lastIndexOf("/"); const folder = path.slice(0, slash); const filename = path.slice(slash + 1);
  const { data, error } = await storage().list(folder, { limit: 1000, offset: 0, sortBy: { column: "name", order: "asc" } });
  if (error || !data) throw new FogSourceError("Cannot read the fog forecast folder.");
  const file = data.find(item => item.name === filename && item.id);
  return file ? { path, version: createHash("sha256").update(JSON.stringify([file.id, file.updated_at, file.metadata])).digest("hex").slice(0, 20) } : null;
}

async function loadFile(file: FogFile): Promise<{ data: FogData; version: string }> {
  const key = `${file.path}:${file.version}`;
  const existing = snapshots.get(key); if (existing) return existing;
  const value = (async () => {
    const { data: blob, error } = await storage().download(file.path, { cacheNonce: file.version }, { cache: "no-store" });
    if (error || !blob) throw new FogSourceError("Could not download the fog forecast CSV.");
    try { return { data: parseFogCsv(await blob.text()), version: file.version }; }
    catch { throw new FogSourceError("The fog CSV does not match the expected forecast format.", 422); }
  })();
  snapshots.set(key, value);
  while (snapshots.size > 4) snapshots.delete(snapshots.keys().next().value!);
  try { return await value; }
  catch (error) { if (snapshots.get(key) === value) snapshots.delete(key); throw error; }
}

async function snapshotForRuntime(runtime: string) {
  const today = new Date().toISOString().slice(0, 10);
  const runtimeDay = runtime.slice(0, 10);
  const path = runtimeDay === today ? "forecast/fog/daily.csv" : `forecast/fog/monthly/${runtime.slice(0, 7)}.csv`;
  const file = await findFile(path);
  if (!file) return null;
  return loadFile(file);
}

export async function availableFogRuntimes(now = new Date()): Promise<FogRuntimeOption[]> {
  const options = fogRuntimeOptions(now);
  const snapshotsByPath = new Map<string, Awaited<ReturnType<typeof snapshotForRuntime>>>();
  for (const option of options) {
    const pathKey = option.runtime.slice(0, 10) === now.toISOString().slice(0, 10) ? "daily" : option.runtime.slice(0, 7);
    if (!snapshotsByPath.has(pathKey)) snapshotsByPath.set(pathKey, await snapshotForRuntime(option.runtime));
    option.available = snapshotsByPath.get(pathKey)?.data.runtimes.includes(option.runtime) ?? false;
  }
  return options;
}

export async function loadFogRuntime(runtime: string) {
  const allowed = fogRuntimeOptions().some(option => option.runtime === runtime);
  if (!allowed) throw new FogSourceError("Invalid fog forecast runtime.", 400);
  const snapshot = await snapshotForRuntime(runtime);
  if (!snapshot) throw new FogSourceError("This fog forecast has not been uploaded yet.", 404);
  const records = snapshot.data.records.filter(record => record.runtime === runtime);
  if (!records.length) throw new FogSourceError("This fog forecast runtime is not available yet.", 404);
  return { records, version: snapshot.version };
}
