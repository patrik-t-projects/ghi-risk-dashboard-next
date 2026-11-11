"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchForecast } from "@/lib/forecastClient";
import { combineStationDays } from "@/lib/forecastHistory";
import { comparisonRunColor, comparisonRunOptions, compactRunLabel } from "@/lib/forecastComparison";
import type { StationForecastResponse } from "@/lib/forecastCsv";

type LoadedRuns = { key: string; runs: string[] };

export default function ComparisonRuntimePicker({ stationId, mode, from, to, refreshToken, selectedRuns, onChange }: {
  stationId: string;
  mode: "today" | "history";
  from: string;
  to: string;
  refreshToken: number;
  selectedRuns: string[];
  onChange: (runs: string[]) => void;
}) {
  const [loaded, setLoaded] = useState<LoadedRuns | null>(null);
  const [candidate, setCandidate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const requestKey = `${stationId}:${mode}:${from}:${to}`;
  const runs = useMemo(() => loaded?.key === requestKey ? loaded.runs : [], [loaded, requestKey]);
  const availableCandidate = runs.includes(candidate) && !selectedRuns.includes(candidate)
    ? candidate : runs.find(run => !selectedRuns.includes(run)) ?? "";

  useEffect(() => {
    if (!stationId) return;
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true; setLoading(true); setError("");
      try {
        const params: Record<string, string> = { view: mode, station: stationId };
        if (mode === "history") Object.assign(params, { from, to });
        const result = await fetchForecast<StationForecastResponse>(params, controller.signal);
        const combined = combineStationDays(result.segments);
        if (!controller.signal.aborted) setLoaded({ key: requestKey, runs: comparisonRunOptions(combined.segments) });
      } catch (caught) {
        if (!controller.signal.aborted) { setLoaded(null); setError(caught instanceof Error ? caught.message : "Could not load model runtimes."); }
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
  }, [stationId, mode, from, to, requestKey, refreshToken, retry]);

  const unavailableSelections = useMemo(() => selectedRuns.filter(run => !runs.includes(run)), [selectedRuns, runs]);
  return <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4" aria-label="Comparison runtime selection">
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-64 flex-1 text-[10px] text-slate-500">Run (yyyy-mm-ddThh)
        <select value={availableCandidate} onChange={event => setCandidate(event.target.value)} disabled={!availableCandidate || selectedRuns.length >= 6}
          className="mt-1 block w-full rounded-lg border border-white/15 bg-[#0d1d2b] px-3 py-2 text-sm text-white disabled:opacity-50">
          {!availableCandidate && <option value="">{loading ? "Loading runtimes…" : "No additional runtime available"}</option>}
          {runs.filter(run => !selectedRuns.includes(run)).map(run => <option key={run} value={run}>{compactRunLabel(run)}{run === runs[0] ? " · latest" : ""}</option>)}
        </select>
      </label>
      <button type="button" disabled={!availableCandidate || selectedRuns.length >= 6} onClick={() => onChange([...selectedRuns, availableCandidate])}
        className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Add runtime</button>
      <span className="pb-2 text-xs text-slate-500">{selectedRuns.length} / 6 selected</span>
    </div>
    {error && <div role="alert" className="mt-3 text-sm text-amber-200">{error}<button type="button" className="ml-3 underline" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    {unavailableSelections.length > 0 && <p className="mt-3 text-xs text-amber-200">Some selected runtimes are unavailable in this date range. Remove them or select another range.</p>}
    {selectedRuns.length > 0 && <div className="mt-4 space-y-2" aria-label="Selected comparison runtimes">
      {selectedRuns.map(run => <div key={run} className="flex items-center gap-3 rounded-lg border border-white/10 bg-[#0d1d2b]/70 px-3 py-2 text-sm">
        <span className="h-0.5 w-6" style={{ backgroundColor: comparisonRunColor(run, selectedRuns) }} />
        <span className="flex-1 font-mono text-slate-200">{compactRunLabel(run)}</span>
        <button type="button" onClick={() => onChange(selectedRuns.filter(selected => selected !== run))} className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-white/10 hover:text-white">Remove</button>
      </div>)}
    </div>}
  </section>;
}
