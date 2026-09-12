import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseForecastCsv, type ForecastData } from "./forecastCsv";

type Snapshot = { day: string; version: string; data: ForecastData };
let cached: { key: string; value: Promise<Snapshot> } | undefined;

// This is the data-source boundary. A future Supabase loader can return the same
// daily snapshot without changing the parser, map, or station chart endpoints.
export async function loadDailyForecast(day?: string): Promise<Snapshot> {
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid forecast date.");
  const directory = path.join(process.cwd(), "test_data");
  const files = (await readdir(directory)).filter(name => /^icon_ghi_all_stations_\d{4}-\d{2}-\d{2}\.csv$/.test(name)).sort();
  const file = day ? `icon_ghi_all_stations_${day}.csv` : files.at(-1);
  if (!file || !files.includes(file)) throw new Error("No daily forecast CSV available.");
  const filePath = path.join(directory, file);
  const info = await stat(filePath);
  const key = `${file}:${info.size}-${info.mtimeMs}`;
  if (cached?.key === key) return cached.value;
  const value = readFile(filePath, "utf8").then(csv => ({ day: file.match(/\d{4}-\d{2}-\d{2}/)![0],
    version: createHash("sha256").update(csv).digest("hex").slice(0, 16), data: parseForecastCsv(csv) }));
  cached = { key, value };
  try { return await value; }
  catch (error) { if (cached?.key === key) cached = undefined; throw error; }
}
