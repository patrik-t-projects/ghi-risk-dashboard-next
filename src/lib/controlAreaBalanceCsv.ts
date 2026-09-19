export type ControlAreaBalanceRow = {
  time: string;
  imbalance: number | null;
  aep: number | null;
};

export type ControlAreaBalanceData = {
  rows: ControlAreaBalanceRow[];
  start: string;
  end: string;
};

function readSemicolonCsv(text: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (character === ";" || character === "\n" || character === "\r")) {
      row.push(value); value = "";
      if (character !== ";") {
        if (row.some(field => field.trim())) records.push(row);
        row = [];
        if (character === "\r" && text[index + 1] === "\n") index++;
      }
    } else value += character;
  }
  if (quoted) throw new Error("The CSV has an unfinished quoted field.");
  row.push(value);
  if (row.some(field => field.trim())) records.push(row);
  return records;
}

function utcTimestamp(value: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Invalid Swissgrid UTC timestamp.");
  const [, day, month, year, hour, minute] = match;
  const instant = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  if (instant.getUTCFullYear() !== Number(year) || instant.getUTCMonth() !== Number(month) - 1 ||
      instant.getUTCDate() !== Number(day) || instant.getUTCHours() !== Number(hour) ||
      instant.getUTCMinutes() !== Number(minute) || Number(minute) % 15 !== 0) {
    throw new Error("Invalid Swissgrid UTC timestamp.");
  }
  return instant.toISOString().replace(".000Z", "Z");
}

function numeric(value: string): number | null {
  if (!value.trim()) return null;
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error("Invalid Swissgrid numeric value.");
  return result;
}

export function parseControlAreaBalanceCsv(text: string): ControlAreaBalanceData {
  const [header, ...records] = readSemicolonCsv(text);
  if (!header || !records.length) throw new Error("The Swissgrid CSV is empty.");
  const normalized = header.map(column => column.replace(/^\uFEFF/, "").trim());
  if (new Set(normalized).size !== normalized.length) throw new Error("The Swissgrid CSV contains duplicate columns.");
  const columns = new Map(normalized.map((column, index) => [column, index]));
  const timestampColumn = columns.get("Date Time [UTC]");
  const imbalanceColumn = columns.get("Total System Imbalance");
  const aepColumn = columns.get("AE-Preis");
  if (timestampColumn === undefined || imbalanceColumn === undefined || aepColumn === undefined) {
    throw new Error("The Swissgrid CSV is missing timestamp, imbalance, or AEP data.");
  }
  const seen = new Set<string>();
  const rows = records.map(record => {
    if (record.length !== header.length) throw new Error("A Swissgrid CSV row has an unexpected number of columns.");
    const time = utcTimestamp(record[timestampColumn]);
    if (seen.has(time)) throw new Error(`Duplicate Swissgrid timestamp: ${time}`);
    seen.add(time);
    return { time, imbalance: numeric(record[imbalanceColumn]), aep: numeric(record[aepColumn]) };
  }).sort((a, b) => a.time.localeCompare(b.time));
  return { rows, start: rows[0].time, end: rows.at(-1)!.time };
}

export function validUtcDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const instant = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === day;
}

export function selectControlAreaBalanceRange(rows: ControlAreaBalanceRow[], from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`) + 86400000;
  return rows.filter(row => {
    const instant = Date.parse(row.time);
    return instant >= start && instant < end;
  });
}
