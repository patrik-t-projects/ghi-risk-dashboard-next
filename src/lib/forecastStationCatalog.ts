import stations from "@/data/forecastStations.json";
import type { StationSummary } from "./forecastCsv";

export const forecastStations = stations as StationSummary[];
const stationIds = new Set(forecastStations.map(station => station.id));

export function knownForecastStation(station: string): boolean {
  return stationIds.has(station);
}
