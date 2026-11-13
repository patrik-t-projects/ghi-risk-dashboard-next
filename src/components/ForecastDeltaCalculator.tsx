"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchForecast } from "@/lib/forecastClient";
import { combineStationDays } from "@/lib/forecastHistory";
import { deltaAussp, formatRun, futureGhiValues, futureHourOptions, measuredGhiOptions, modelRunOptions,
  predictedDelta, type CalculatorForecast, type CalculatorModel } from "@/lib/forecastCalculator";
import type { StationForecastResponse, StationSummary } from "@/lib/forecastCsv";

type CalculatorData = ReturnType<typeof combineStationDays>;
type CalculatedRow = CalculatorForecast & { text: string; value: number | null; delta: number | null };

const numberValue = (value: string) => value.trim() === "" ? Number.NaN : Number(value);
const formatTimestamp = (value: string) => new Date(value).toLocaleString("en-GB", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
}).replace(",", "") + " UTC";
const formatHour = (value: string) => new Date(value).toLocaleString("en-GB", {
  day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", hour12: false, timeZone: "UTC",
}).replace(",", "") + " UTC";

function NumericInput({ label, value, onChange, placeholder, unit }: {
  label: string; value: string; onChange: (value: string) => void; placeholder?: string; unit?: string;
}) {
  return <label className="text-xs text-slate-400">{label}
    <div className="mt-1 flex overflow-hidden rounded-lg border border-white/15 bg-[#0d1d2b] focus-within:border-cyan-400/50">
      <input type="number" step="any" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)}
        className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600" />
      {unit && <span className="flex items-center border-l border-white/10 px-2 text-[10px] text-slate-500">{unit}</span>}
    </div>
  </label>;
}

function ModelResults({ model, runs, activeRun, onRunChange, hours, activeHour, onHourChange, rows, onRowChange }: {
  model: CalculatorModel;
  runs: string[];
  activeRun: string;
  onRunChange: (value: string) => void;
  hours: string[];
  activeHour: string;
  onHourChange: (value: string) => void;
  rows: CalculatedRow[];
  onRowChange: (member: string, value: string) => void;
}) {
  const icon1 = model === "icon_ch1";
  const name = icon1 ? "ICON1" : "ICON2";
  return <section className={`overflow-hidden rounded-2xl border ${icon1 ? "border-amber-300/20" : "border-cyan-300/20"}`} aria-label={`${name} calculation results`}>
    <div className={`p-4 ${icon1 ? "bg-amber-300/[0.05]" : "bg-cyan-300/[0.05]"}`}>
      <div className="mb-4 flex items-center justify-between gap-3"><div><h4 className={`font-semibold ${icon1 ? "text-amber-100" : "text-cyan-100"}`}>{name}</h4>
        <p className="mt-1 text-xs text-slate-500">Control + {icon1 ? "10" : "20"} ensemble members</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${icon1 ? "bg-amber-300/10 text-amber-200" : "bg-cyan-300/10 text-cyan-200"}`}>{name}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-400">{name} model run
          <select value={activeRun} onChange={event => onRunChange(event.target.value)} disabled={!runs.length}
            className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white disabled:opacity-50">
            {!runs.length && <option value="">No eligible {name} run</option>}
            {runs.map(run => <option key={run} value={run}>{formatRun(run)}{run === runs[0] ? " · latest" : ""}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-400">Future hour
          <select value={activeHour} onChange={event => onHourChange(event.target.value)} disabled={!hours.length}
            className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white disabled:opacity-50">
            {!hours.length && <option value="">No future hour in selected data</option>}
            {hours.map(hour => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
          </select>
        </label>
      </div>
    </div>
    <div className="max-h-[34rem] overflow-auto border-t border-white/10">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#122635] text-xs uppercase tracking-wide text-slate-400"><tr>
          <th className="px-4 py-3">Series</th><th className="px-4 py-3">Future GHI [W/m²]</th><th className="px-4 py-3 text-right">Predicted Delta [MW]</th>
        </tr></thead>
        <tbody className="divide-y divide-white/5">{rows.map(row => <tr key={row.member} className={row.control ? (icon1 ? "bg-amber-300/[0.05]" : "bg-cyan-400/[0.06]") : "hover:bg-white/[0.025]"}>
          <td className="px-4 py-2.5 font-medium text-slate-200">{row.label}{row.control && <span className={`ml-2 rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${icon1 ? "bg-amber-300/15 text-amber-200" : "bg-cyan-400/15 text-cyan-200"}`}>Control</span>}</td>
          <td className="px-4 py-2.5"><input type="number" step="any" value={row.text} onChange={event => onRowChange(row.member, event.target.value)}
            aria-label={`${name} ${row.label} future GHI`} className="w-36 rounded border border-white/10 bg-[#0d1d2b] px-2 py-1.5 text-white outline-none focus:border-cyan-400/50" /></td>
          <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">{row.delta === null ? "—" : row.delta.toFixed(2)}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="p-6 text-center text-sm text-slate-500">Choose a timestamp, model run and future hour to populate the {name} calculation.</p>}
    </div>
  </section>;
}

export default function ForecastDeltaCalculator({ stations, mode, from, to, refreshToken }: {
  stations: StationSummary[];
  mode: "today" | "history";
  from: string;
  to: string;
  refreshToken: number;
}) {
  const [stationId, setStationId] = useState("CHZ");
  const [loaded, setLoaded] = useState<{ key: string; data: CalculatorData } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [currentTime, setCurrentTime] = useState("");
  const [icon1Run, setIcon1Run] = useState("");
  const [icon2Run, setIcon2Run] = useState("");
  const [icon1Hour, setIcon1Hour] = useState("");
  const [icon2Hour, setIcon2Hour] = useState("");
  const [currentDelta, setCurrentDelta] = useState("");
  const [a, setA] = useState("9");
  const [b, setB] = useState("125");
  const [currentGhiDa, setCurrentGhiDa] = useState("");
  const [futureGhiDa, setFutureGhiDa] = useState("");
  const [currentGhiEdit, setCurrentGhiEdit] = useState<{ key: string; value: string } | null>(null);
  const [futureEdits, setFutureEdits] = useState<Record<string, Record<string, string>>>({});
  const activeStationId = stations.some(station => station.id === stationId)
    ? stationId : stations.find(station => station.id === "CHZ")?.id ?? stations[0]?.id ?? "";
  const requestKey = `${activeStationId}:${mode}:${from}:${to}`;
  const data = loaded?.key === requestKey ? loaded.data : null;

  useEffect(() => {
    if (!activeStationId) return;
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true; setLoading(true); setError("");
      try {
        const params: Record<string, string> = { view: mode, station: activeStationId };
        if (mode === "history") Object.assign(params, { from, to });
        const result = await fetchForecast<StationForecastResponse>(params, controller.signal);
        if (!controller.signal.aborted) setLoaded({ key: requestKey, data: combineStationDays(result.segments) });
      } catch (caught) {
        if (!controller.signal.aborted) { setLoaded(null); setError(caught instanceof Error ? caught.message : "Could not load calculator data."); }
      } finally {
        pending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const interval = mode === "today" ? setInterval(load, 60000) : undefined;
    if (mode === "today") document.addEventListener("visibilitychange", load);
    return () => {
      controller.abort();
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", load);
    };
  }, [activeStationId, mode, from, to, requestKey, refreshToken, retry]);

  const measurements = useMemo(() => data ? measuredGhiOptions(data.segments) : [], [data]);
  const activeCurrentTime = measurements.some(option => option.time === currentTime)
    ? currentTime : mode === "today" ? measurements.at(-1)?.time ?? "" : measurements[0]?.time ?? "";
  const currentEditKey = `${requestKey}:${activeCurrentTime}`;
  const automaticCurrentGhi = measurements.find(option => option.time === activeCurrentTime)?.value ?? null;
  const currentGhiText = currentGhiEdit?.key === currentEditKey
    ? currentGhiEdit.value : automaticCurrentGhi === null ? "" : String(automaticCurrentGhi);
  const icon1Runs = useMemo(() => data && activeCurrentTime ? modelRunOptions(data.segments, "icon_ch1", activeCurrentTime, mode === "history") : [],
    [data, activeCurrentTime, mode]);
  const icon2Runs = useMemo(() => data && activeCurrentTime ? modelRunOptions(data.segments, "icon_ch2", activeCurrentTime, mode === "history") : [],
    [data, activeCurrentTime, mode]);
  const activeIcon1Run = icon1Runs.includes(icon1Run) ? icon1Run : icon1Runs[0] ?? "";
  const activeIcon2Run = icon2Runs.includes(icon2Run) ? icon2Run : icon2Runs[0] ?? "";
  const icon1Hours = useMemo(() => data && activeIcon1Run && activeCurrentTime
    ? futureHourOptions(data.segments, "icon_ch1", activeIcon1Run, activeCurrentTime) : [], [data, activeIcon1Run, activeCurrentTime]);
  const icon2Hours = useMemo(() => data && activeIcon2Run && activeCurrentTime
    ? futureHourOptions(data.segments, "icon_ch2", activeIcon2Run, activeCurrentTime) : [], [data, activeIcon2Run, activeCurrentTime]);
  const activeIcon1Hour = icon1Hours.includes(icon1Hour) ? icon1Hour : icon1Hours[0] ?? "";
  const activeIcon2Hour = icon2Hours.includes(icon2Hour) ? icon2Hour : icon2Hours[0] ?? "";
  const baseDelta = deltaAussp(numberValue(currentDelta), numberValue(a), numberValue(b), numberValue(currentGhiText), numberValue(currentGhiDa));

  function modelRows(model: CalculatorModel, run: string, hour: string): { key: string; rows: CalculatedRow[] } {
    const key = `${requestKey}:${activeCurrentTime}:${model}:${run}:${hour}`;
    const forecasts = data && run && hour ? futureGhiValues(data.segments, model, run, hour) : [];
    return { key, rows: forecasts.map(forecast => {
      const text = futureEdits[key]?.[forecast.member] ?? (forecast.ghi === null ? "" : String(forecast.ghi));
      const ghi = numberValue(text);
      return { ...forecast, text, value: Number.isFinite(ghi) ? ghi : null,
        delta: predictedDelta(baseDelta, numberValue(a), numberValue(b), ghi, numberValue(futureGhiDa)) };
    }).sort((left, right) => (right.value ?? -Infinity) - (left.value ?? -Infinity)) };
  }
  const icon1 = modelRows("icon_ch1", activeIcon1Run, activeIcon1Hour);
  const icon2 = modelRows("icon_ch2", activeIcon2Run, activeIcon2Hour);
  const updateFuture = (key: string, member: string, value: string) => setFutureEdits(current => ({ ...current,
    [key]: { ...current[key], [member]: value } }));

  return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:p-6" aria-label="GHI Delta calculator">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-400">GHI sensitivity</p>
        <h3 className="mt-1 text-xl font-semibold">Calculator</h3>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">Calculate Delta Aussp. from measured GHI, then compare separate ICON1 and ICON2 control and ensemble results.</p></div>
      {loading && <span role="status" className="text-xs text-slate-400">Loading station data…</span>}
    </div>
    {error && <div role="alert" className="mb-5 rounded-xl border border-amber-300/25 p-4 text-sm text-amber-100">{error}<button type="button" className="ml-4 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    <div className="grid gap-4 md:grid-cols-2">
      <label className="text-xs text-slate-400">Station
        <select value={activeStationId} onChange={event => setStationId(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white">
          {stations.map(station => <option key={station.id} value={station.id}>{station.id}{station.name !== station.id ? ` · ${station.name}` : ""}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-400">Current 15-minute timestamp
        <select value={activeCurrentTime} onChange={event => setCurrentTime(event.target.value)} disabled={!measurements.length} className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white disabled:opacity-50">
          {!measurements.length && <option value="">No measured GHI available</option>}
          {measurements.map(option => <option key={option.time} value={option.time}>{formatTimestamp(option.time)}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <NumericInput label="Current Delta" value={currentDelta} onChange={setCurrentDelta} unit="MW" placeholder="Enter value" />
      <NumericInput label="a" value={a} onChange={setA} />
      <NumericInput label="b" value={b} onChange={setB} />
      <NumericInput label="Current GHI" value={currentGhiText} onChange={value => setCurrentGhiEdit({ key: currentEditKey, value })} unit="W/m²" />
      <NumericInput label="GHI DA current" value={currentGhiDa} onChange={setCurrentGhiDa} unit="W/m²" placeholder="Enter value" />
      <NumericInput label="GHI DA future" value={futureGhiDa} onChange={setFutureGhiDa} unit="W/m²" placeholder="Enter value" />
    </div>
    <div className="mt-6 grid gap-3 lg:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-[#0d1d2b]/70 p-4"><p className="text-xs text-slate-500">Delta Aussp.</p>
        <p className="mt-1 text-2xl font-semibold text-cyan-200">{baseDelta === null ? "—" : `${baseDelta.toFixed(2)} MW`}</p>
        <p className="mt-2 text-xs text-slate-500">Current Delta − a / b × (Current GHI − GHI DA current)</p></div>
      <div className="rounded-xl border border-white/10 bg-[#0d1d2b]/70 p-4"><p className="text-xs text-slate-500">Future calculation</p>
        <p className="mt-2 text-sm text-slate-300">Delta Aussp. + a / b × (Future GHI − GHI DA future)</p>
        <p className="mt-2 text-xs text-slate-500">Future GHI values are editable. Each model remains separately sorted by GHI.</p></div>
    </div>
    <div className="mt-6 grid items-start gap-5 xl:grid-cols-2">
      <ModelResults model="icon_ch1" runs={icon1Runs} activeRun={activeIcon1Run} onRunChange={setIcon1Run}
        hours={icon1Hours} activeHour={activeIcon1Hour} onHourChange={setIcon1Hour} rows={icon1.rows}
        onRowChange={(member, value) => updateFuture(icon1.key, member, value)} />
      <ModelResults model="icon_ch2" runs={icon2Runs} activeRun={activeIcon2Run} onRunChange={setIcon2Run}
        hours={icon2Hours} activeHour={activeIcon2Hour} onHourChange={setIcon2Hour} rows={icon2.rows}
        onRowChange={(member, value) => updateFuture(icon2.key, member, value)} />
    </div>
    {numberValue(b) === 0 && <p role="alert" className="mt-3 text-sm text-amber-200">b must not be zero.</p>}
  </section>;
}
