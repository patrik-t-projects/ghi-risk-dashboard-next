export type ForecastSeries = { key: string; model: "icon_ch1" | "icon_ch2"; run: string; member: string };
export type StationSummary = { id: string; name: string; latitude: number; longitude: number };
export type StationForecast = StationSummary & {
  rows: { time: string; measured: number | null; values: (number | null)[] }[];
};
export type ForecastData = { series: ForecastSeries[]; stations: StationForecast[]; start: string; end: string };
export type ForecastOverview = { stations: StationSummary[]; start: string; end: string; day: string; version: string };
export type StationDetail = { station: StationForecast; series: ForecastSeries[]; start: string; end: string };
export type ForecastFile = { day: string; version: string; updatedAt: string };
export type ForecastCatalog = { files: ForecastFile[]; today: string };
export type ForecastSegments = { series: ForecastSeries[]; rows: StationForecast["rows"] }[];

// Coordinates contain commas inside quoted fields. Do not split CSV lines on commas.
export function readCsv(text: string): string[][] {
  const records: string[][] = []; let row: string[] = []; let value = ""; let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === "," || c === "\n" || c === "\r")) {
      row.push(value); value = "";
      if (c !== ",") {
        if (row.some(v => v.trim())) records.push(row);
        row = [];
        if (c === "\r" && text[i + 1] === "\n") i++;
      }
    } else value += c;
  }
  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  row.push(value); if (row.some(v => v.trim())) records.push(row);
  return records;
}

function parseRuntime(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}) UTC$/.exec(value);
  if (!match) throw new Error(`Invalid model runtime: ${value}`);
  const [, day, month, year, hour] = match;
  const iso = `${year}-${month}-${day}T${hour.padStart(2, "0")}:00:00Z`;
  if (!Number.isFinite(Date.parse(iso)) || new Date(iso).toISOString() !== iso.replace("Z", ".000Z")) throw new Error(`Invalid model runtime: ${value}`);
  return `${year}${month}${day}T${hour.padStart(2, "0")}0000Z`;
}

function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("Invalid number in forecast CSV.");
  return result;
}

/** Normalize the Pi's daily station/model/run rows into the chart's series format.
 * Timestamps are interval ends in UTC. Preserve them exactly; never shift to the runtime.
 */
export function parseForecastCsv(text: string): ForecastData {
  const [header, ...records] = readCsv(text);
  if (!header || !records.length) throw new Error("The forecast CSV is empty.");
  if (new Set(header).size !== header.length) throw new Error("Duplicate CSV column.");
  const columns = new Map(header.map((key, index) => [key, index]));
  for (const key of ["datetime", "station_abbr", "grid_coordinates", "Model", "Runtime", "measured_ghi", "control"]) {
    if (!columns.has(key)) throw new Error(`Missing CSV column: ${key}`);
  }
  const get = (row: string[], key: string) => row[columns.get(key)!].trim();
  const memberColumns = header.flatMap((key, index) => /^(control|member_\d+)$/.test(key) ? [{ key, index }] : []);
  const runCache = new Map<string, string>();
  const seriesMap = new Map<string, ForecastSeries>();
  const stations = new Map<string, StationForecast>();
  const observations = new Map<string, Map<string, StationForecast["rows"][number]>>();
  const coordinates = new Map<string, string>();
  const preferredCoordinates = new Set<string>();
  const seen = new Set<string>();
  const values = new Map<string, Map<string, number | null>>();
  let start = ""; let end = "";
  for (const row of records) {
    if (row.length !== header.length) throw new Error("A CSV row has an unexpected number of columns.");
    const id = get(row, "station_abbr"); const time = get(row, "datetime");
    if (!/^[A-Z0-9_-]{1,20}$/.test(id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(time) ||
        !Number.isFinite(Date.parse(time)) || new Date(time).toISOString() !== time.replace("Z", ".000Z")) throw new Error("Invalid station or UTC timestamp.");
    const modelName = get(row, "Model");
    if (modelName !== "ICON1" && modelName !== "ICON2") throw new Error(`Unknown model: ${modelName}`);
    const model = modelName === "ICON1" ? "icon_ch1" : "icon_ch2";
    const runtime = get(row, "Runtime");
    if (!runCache.has(runtime)) runCache.set(runtime, parseRuntime(runtime));
    const run = runCache.get(runtime)!;
    const rowKey = `${id}:${time}`;
    const unique = `${rowKey}:${model}:${run}`;
    if (seen.has(unique)) throw new Error("Duplicate station/model/run/time row in CSV.");
    seen.add(unique);
    const coordinate = get(row, "grid_coordinates");
    const pair = /^\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\s*$/.exec(coordinate);
    if (!pair) throw new Error(`Invalid map location for ${id}.`);
    const latitude = Number(pair[1]); const longitude = Number(pair[2]);
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Invalid map location.");
    const coordinateKey = `${id}:${model}`;
    const normalizedCoordinate = `${latitude},${longitude}`;
    if (coordinates.has(coordinateKey) && coordinates.get(coordinateKey) !== normalizedCoordinate) throw new Error(`Conflicting coordinates for ${id}/${modelName}.`);
    coordinates.set(coordinateKey, normalizedCoordinate);
    if (!stations.has(id)) {
      stations.set(id, { id, name: id === "CHZ" ? "Cham" : id, latitude, longitude, rows: [] });
      observations.set(id, new Map());
    }
    // One marker per station: prefer ICON1's point, even if ICON2 rows occur first.
    if (model === "icon_ch1" && !preferredCoordinates.has(id)) {
      Object.assign(stations.get(id)!, { latitude, longitude }); preferredCoordinates.add(id);
    }
    const stationRows = observations.get(id)!;
    if (!stationRows.has(time)) stationRows.set(time, { time, measured: null, values: [] });
    const target = stationRows.get(time)!;
    const measured = numeric(get(row, "measured_ghi"));
    if (measured !== null) {
      if (target.measured !== null && Math.abs(target.measured - measured) > 1e-8) throw new Error(`Conflicting measured GHI for ${id} at ${time}.`);
      target.measured = measured;
    }
    const rowValues = values.get(rowKey) ?? new Map<string, number | null>();
    for (const member of memberColumns) {
      const value = numeric(row[member.index]);
      const key = `${model}_${run}_${member.key}`;
      // The shared schema has 20 member columns, but ICON1 only populates 10.
      if (value !== null || member.key === "control") seriesMap.set(key, { key, model, run, member: member.key });
      if (value !== null) rowValues.set(key, value);
    }
    values.set(rowKey, rowValues);
    if (!start || time < start) start = time;
    if (!end || time > end) end = time;
  }
  const series = [...seriesMap.values()].sort((a, b) => a.model.localeCompare(b.model) || a.run.localeCompare(b.run) ||
    (a.member === "control" ? -1 : b.member === "control" ? 1 : Number(a.member.slice(7)) - Number(b.member.slice(7))));
  const all = [...stations.values()].sort((a, b) => a.id.localeCompare(b.id));
  for (const station of all) {
    station.rows = [...observations.get(station.id)!.values()].sort((a, b) => a.time.localeCompare(b.time));
    for (const row of station.rows) row.values = series.map(s => values.get(`${station.id}:${row.time}`)?.get(s.key) ?? null);
  }
  return { series, stations: all, start, end };
}
