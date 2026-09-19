import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { parseControlAreaBalanceCsv, type ControlAreaBalanceData } from "./controlAreaBalanceCsv";

export type ControlAreaBalanceSource = "today" | "yearly";

const FILES: Record<ControlAreaBalanceSource, string> = {
  today: "control-area-balance-today.csv",
  yearly: "control-area-balance-yearly.csv",
};

export class ControlAreaBalanceSourceError extends Error {
  constructor(message: string, public status = 503) { super(message); }
}

function storage() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new ControlAreaBalanceSourceError("Swissgrid storage is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  }).storage.from("forecast-data");
}

const snapshots = new Map<string, Promise<{ data: ControlAreaBalanceData; version: string }>>();

export async function loadControlAreaBalance(source: ControlAreaBalanceSource) {
  const bucket = storage();
  const filename = FILES[source];
  const { data: files, error: listError } = await bucket.list("swissgrid", {
    limit: 100, offset: 0, sortBy: { column: "name", order: "asc" },
  });
  if (listError || !files) throw new ControlAreaBalanceSourceError("Cannot read the Swissgrid data folder.");
  const file = files.find(item => item.name === filename);
  if (!file?.id) throw new ControlAreaBalanceSourceError(`The Swissgrid ${source} CSV has not been uploaded yet.`, 404);
  const version = createHash("sha256").update(JSON.stringify([file.id, file.updated_at, file.metadata])).digest("hex").slice(0, 20);
  const key = `${source}:${version}`;
  const existing = snapshots.get(key);
  if (existing) return existing;
  const value = (async () => {
    const { data: blob, error } = await bucket.download(`swissgrid/${filename}`, { cacheNonce: version }, { cache: "no-store" });
    if (error || !blob) throw new ControlAreaBalanceSourceError(`Could not download the Swissgrid ${source} CSV.`);
    try {
      return { data: parseControlAreaBalanceCsv(await blob.text()), version };
    } catch {
      throw new ControlAreaBalanceSourceError(`The Swissgrid ${source} CSV does not match the expected balance format.`, 422);
    }
  })();
  snapshots.set(key, value);
  while (snapshots.size > 2) snapshots.delete(snapshots.keys().next().value!);
  try { return await value; }
  catch (error) { if (snapshots.get(key) === value) snapshots.delete(key); throw error; }
}
