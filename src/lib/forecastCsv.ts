export type ForecastSeries = { key: string; model: "icon_ch1" | "icon_ch2"; run: string; member: string };
export type StationForecast = {
  id: string; name: string; latitude: number; longitude: number;
  rows: { time: string; measured: number | null; values: (number | null)[] }[];
};
export type ForecastData = { series: ForecastSeries[]; stations: StationForecast[]; start: string; end: string };

// CSV coordinates contain commas inside quoted fields. Do not split lines on commas.
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

export function parseForecastCsv(text: string): ForecastData {
  const [header, ...records] = readCsv(text);
  if (!header) throw new Error("The forecast CSV is empty.");
  const required = ["datetime", "station_abbr", "grid_coordinates", "measured_ghi"];
  for (const key of required) if (!header.includes(key)) throw new Error(`Missing CSV column: ${key}`);
  const series: ForecastSeries[] = [];
  const indexes: number[] = [];
  header.forEach((key, index) => {
    const match = /^(icon_ch[12])_(\d{8}T\d{6}Z)_(control|member_\d+)$/.exec(key);
    if (match) { indexes.push(index); series.push({ key, model: match[1] as ForecastSeries["model"], run: match[2], member: match[3] }); }
  });
  if (!series.length) throw new Error("No ICON forecast columns found.");
  const stations = new Map<string, StationForecast>(); const seen = new Set<string>();
  const number = (value: string) => {
    if (!value.trim()) return null;
    const result = Number(value); if (!Number.isFinite(result)) throw new Error("Invalid number in forecast CSV.");
    return result;
  };
  for (const row of records) {
    if (row.length !== header.length) throw new Error("A CSV row has an unexpected number of columns.");
    const get = (key: string) => row[header.indexOf(key)].trim();
    const id = get("station_abbr"); const time = get("datetime");
    if (!id || !/Z$/.test(time) || !Number.isFinite(Date.parse(time))) throw new Error("Invalid station or UTC timestamp.");
    if (seen.has(`${id}:${time}`)) throw new Error("Duplicate station/time row in CSV.");
    seen.add(`${id}:${time}`);
    if (!stations.has(id)) {
      const coordinates = /ICON[12]=\s*([-\d.]+),\s*([-\d.]+)/.exec(get("grid_coordinates"));
      if (!coordinates) throw new Error(`Missing map location for ${id}.`);
      const latitude = Number(coordinates[1]); const longitude = Number(coordinates[2]);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error("Invalid map location.");
      stations.set(id, { id, name: id === "CHZ" ? "Cham" : id, latitude, longitude, rows: [] });
    }
    stations.get(id)!.rows.push({ time, measured: number(get("measured_ghi")), values: indexes.map(index => number(row[index])) });
  }
  const all = [...stations.values()];
  if (!all.length) throw new Error("No station data found.");
  all.forEach(station => station.rows.sort((a, b) => a.time.localeCompare(b.time)));
  const times = all.flatMap(station => station.rows.map(row => row.time)).sort();
  return { series, stations: all, start: times[0], end: times[times.length - 1] };
}
