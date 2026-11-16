import { readCsv } from "./forecastCsv";

export type FogRecord = {
  model: "icon_ch2";
  runtime: string;
  time: string;
  locationId: string;
  locationLatitude: number;
  locationLongitude: number;
  gridLatitude: number;
  gridLongitude: number;
  gridDistanceKm: number;
  modelLevel: number;
  heightAslM: number;
  surfaceHeightAslM: number;
  heightAglM: number;
  fogProbability: number;
};

export type FogData = { records: FogRecord[]; runtimes: string[]; start: string; end: string };

const REQUIRED = ["model", "reference_datetime", "datetime", "location_id", "location_latitude", "location_longitude",
  "grid_latitude", "grid_longitude", "grid_distance_km", "model_level", "height_asl_m", "surface_height_asl_m",
  "height_agl_m", "fog_probability"] as const;

const isoUtc = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value.replace("Z", ".000Z");

function number(value: string, field: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed)) throw new Error(`Invalid fog CSV number: ${field}`);
  return parsed;
}

export function parseFogCsv(text: string): FogData {
  const [header, ...rows] = readCsv(text);
  if (!header || !rows.length) throw new Error("The fog CSV is empty.");
  if (new Set(header).size !== header.length) throw new Error("Duplicate fog CSV column.");
  const columns = new Map(header.map((column, index) => [column.trim(), index]));
  for (const column of REQUIRED) if (!columns.has(column)) throw new Error(`Missing fog CSV column: ${column}`);
  const get = (row: string[], column: typeof REQUIRED[number]) => row[columns.get(column)!]?.trim() ?? "";
  const seen = new Set<string>();
  const records = rows.map(row => {
    if (row.length !== header.length) throw new Error("A fog CSV row has an unexpected number of columns.");
    const model = get(row, "model");
    const runtime = get(row, "reference_datetime");
    const time = get(row, "datetime");
    const locationId = get(row, "location_id");
    if (model !== "icon_ch2" || !isoUtc(runtime) || !isoUtc(time) || !/^[A-Za-z0-9_-]{1,80}$/.test(locationId)) {
      throw new Error("Invalid fog model, timestamp or location.");
    }
    const modelLevel = number(get(row, "model_level"), "model_level");
    const fogProbability = number(get(row, "fog_probability"), "fog_probability");
    if (!Number.isInteger(modelLevel) || modelLevel < 60 || modelLevel > 80 || fogProbability < 0 || fogProbability > 1) {
      throw new Error("Fog level or probability is outside the supported range.");
    }
    const record: FogRecord = {
      model: "icon_ch2", runtime, time, locationId,
      locationLatitude: number(get(row, "location_latitude"), "location_latitude"),
      locationLongitude: number(get(row, "location_longitude"), "location_longitude"),
      gridLatitude: number(get(row, "grid_latitude"), "grid_latitude"),
      gridLongitude: number(get(row, "grid_longitude"), "grid_longitude"),
      gridDistanceKm: number(get(row, "grid_distance_km"), "grid_distance_km"),
      modelLevel,
      heightAslM: number(get(row, "height_asl_m"), "height_asl_m"),
      surfaceHeightAslM: number(get(row, "surface_height_asl_m"), "surface_height_asl_m"),
      heightAglM: number(get(row, "height_agl_m"), "height_agl_m"),
      fogProbability,
    };
    if (Math.abs(record.locationLatitude) > 90 || Math.abs(record.gridLatitude) > 90 ||
        Math.abs(record.locationLongitude) > 180 || Math.abs(record.gridLongitude) > 180 || record.gridDistanceKm < 0) {
      throw new Error("Invalid fog location coordinates.");
    }
    const key = `${runtime}:${time}:${locationId}:${modelLevel}`;
    if (seen.has(key)) throw new Error("Duplicate fog CSV row.");
    seen.add(key);
    return record;
  }).sort((a, b) => a.runtime.localeCompare(b.runtime) || a.time.localeCompare(b.time) ||
    a.locationId.localeCompare(b.locationId) || a.modelLevel - b.modelLevel);
  const runtimes = [...new Set(records.map(record => record.runtime))];
  return { records, runtimes, start: records[0].time, end: records.at(-1)!.time };
}

export type FogDisplayRecord = Omit<FogRecord, "model" | "runtime" | "time">;

export function fogRecordsAtTime(records: FogRecord[], time: string, resolution: "hourly" | "15min"): FogDisplayRecord[] {
  const exact = records.filter(record => record.time === time);
  if (exact.length || resolution === "hourly") return exact.map(({ model: _model, runtime: _runtime, time: _time, ...record }) => record);
  const instant = Date.parse(time);
  const before = new Date(Math.floor(instant / 3600000) * 3600000).toISOString().replace(".000Z", "Z");
  const after = new Date(Math.ceil(instant / 3600000) * 3600000).toISOString().replace(".000Z", "Z");
  if (before === after) return [];
  const fraction = (instant - Date.parse(before)) / 3600000;
  const left = new Map(records.filter(record => record.time === before).map(record => [`${record.locationId}:${record.modelLevel}`, record]));
  const right = new Map(records.filter(record => record.time === after).map(record => [`${record.locationId}:${record.modelLevel}`, record]));
  return [...left].flatMap(([key, a]) => {
    const b = right.get(key); if (!b) return [];
    const interpolate = (x: number, y: number) => x + (y - x) * fraction;
    return [{
      locationId: a.locationId, locationLatitude: a.locationLatitude, locationLongitude: a.locationLongitude,
      gridLatitude: a.gridLatitude, gridLongitude: a.gridLongitude, gridDistanceKm: a.gridDistanceKm,
      modelLevel: a.modelLevel, heightAslM: interpolate(a.heightAslM, b.heightAslM),
      surfaceHeightAslM: interpolate(a.surfaceHeightAslM, b.surfaceHeightAslM),
      heightAglM: interpolate(a.heightAglM, b.heightAglM), fogProbability: interpolate(a.fogProbability, b.fogProbability),
    }];
  });
}
