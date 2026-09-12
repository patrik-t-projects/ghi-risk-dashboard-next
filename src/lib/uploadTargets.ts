export type UploadTarget = { bucket: string; path: string; contentType: string };

export function resolveUploadTarget(dashboard: string | null, date: string | null): UploadTarget | null {
  if (dashboard === "icon-forecast" || dashboard === "imbalance-ch") {
    if (date !== null) return null;
    return { bucket: "dashboard-html", path: dashboard === "icon-forecast" ? "icon_forecast.html" : "imbalance_dashboard.html",
      contentType: "text/html; charset=utf-8" };
  }
  if (dashboard !== "forecast-daily" || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return { bucket: "forecast-data", path: `daily/icon_ghi_all_stations_${date}.csv`, contentType: "text/csv; charset=utf-8" };
}
