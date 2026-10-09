export type UploadTarget = { bucket: string; path: string; contentType: string };

const validDate = (date: string | null): date is string => {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
};
const validMonth = (month: string | null): month is string => {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return false;
  const parsed = new Date(`${month}-01T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 7) === month;
};
const validStation = (station: string | null): station is string => Boolean(station && /^[A-Z0-9_-]{1,20}$/.test(station));

export function resolveUploadTarget(dashboard: string | null, date: string | null, station: string | null = null,
  month: string | null = null): UploadTarget | null {
  if (dashboard === "icon-forecast" || dashboard === "imbalance-ch") {
    if (date !== null || station !== null || month !== null) return null;
    return { bucket: "dashboard-html", path: dashboard === "icon-forecast" ? "icon_forecast.html" : "imbalance_dashboard.html",
      contentType: "text/html; charset=utf-8" };
  }
  if (dashboard === "control-area-balance-yearly" || dashboard === "control-area-balance-today") {
    if (date !== null || station !== null || month !== null) return null;
    return { bucket: "forecast-data", path: dashboard === "control-area-balance-yearly"
      ? "swissgrid/control-area-balance-yearly.csv"
      : "swissgrid/control-area-balance-today.csv",
    contentType: "text/csv; charset=utf-8" };
  }
  if (dashboard === "forecast-station-daily") {
    if (!validStation(station) || !validDate(date) || month !== null) return null;
    return { bucket: "forecast-data", path: `forecast/stations/${station}/daily.csv`, contentType: "text/csv" };
  }
  if (dashboard === "forecast-station-monthly") {
    if (!validStation(station) || !validMonth(month) || date !== null) return null;
    return { bucket: "forecast-data", path: `forecast/stations/${station}/monthly/${month}.csv`, contentType: "text/csv" };
  }
  if (dashboard !== "forecast-daily" || !validDate(date) || station !== null || month !== null) return null;
  return { bucket: "forecast-data", path: `daily/icon_ghi_all_stations_${date}.csv`, contentType: "text/csv; charset=utf-8" };
}
