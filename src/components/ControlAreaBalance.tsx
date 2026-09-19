"use client";

import { useEffect, useState } from "react";
import { fetchControlAreaBalance, type ControlAreaBalanceResponse } from "@/lib/controlAreaBalanceClient";
import ControlAreaBalanceChart from "./ControlAreaBalanceChart";

function defaultHistoryDay() {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return yesterday.slice(0, 4) === today.slice(0, 4) ? yesterday : today;
}

export default function ControlAreaBalance({ mode, onModeChange }: {
  mode: "today" | "history";
  onModeChange: (mode: "today" | "history") => void;
}) {
  const initialDay = defaultHistoryDay();
  const [from, setFrom] = useState(initialDay);
  const [to, setTo] = useState(initialDay);
  const [range, setRange] = useState({ from: initialDay, to: initialDay });
  const [data, setData] = useState<ControlAreaBalanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checked, setChecked] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true; setLoading(true); setError("");
      try {
        const params: Record<string, string> = mode === "today" ? { view: "today" } : { view: "history", from: range.from, to: range.to };
        const result = await fetchControlAreaBalance(params, controller.signal);
        if (!controller.signal.aborted) { setData(result); setChecked(new Date().toLocaleTimeString("en-GB", { timeZone: "UTC" })); }
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load Swissgrid data.");
      } finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const interval = mode === "today" ? setInterval(load, 60000) : undefined;
    if (mode === "today") document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); if (interval) clearInterval(interval); document.removeEventListener("visibilitychange", load); };
  }, [mode, range, attempt]);

  const period = mode === "today" ? data?.availableTo ?? new Date().toISOString().slice(0, 10) : `${range.from}-${range.to}`;
  return <div className="h-[calc(100dvh-4rem)] overflow-y-auto p-4 sm:p-6">
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-400">Swiss electricity system</p>
        <h2 className="text-2xl font-semibold tracking-tight">CH Imbalance &amp; AEP</h2>
        <p className="mt-2 text-sm text-slate-400">Quarter-hour Swiss control-area balance and balancing energy price.</p></div>
      <div className="text-right text-xs text-slate-400"><p className="text-slate-200">UTC · 15-minute values</p></div>
    </div>

    <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="tablist" aria-label="Control-area balance period">
          {(["today", "history"] as const).map(view => <button key={view} type="button" role="tab" aria-selected={mode === view}
            onClick={() => onModeChange(view)} className={`rounded-lg px-4 py-2 text-sm ${mode === view ? "bg-cyan-400/15 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>{view === "today" ? "Today" : "Historical"}</button>)}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400"><span>{mode === "today" ? "Auto-update: every minute" : "Historical CSV"}{checked ? ` · Checked ${checked} UTC` : ""}</span>
          <button type="button" className="rounded border border-white/15 px-3 py-2 hover:text-white" onClick={() => setAttempt(value => value + 1)}>Refresh</button></div>
      </div>
      {mode === "history" && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={event => {
        event.preventDefault();
        if (from > to) { setError("The start date must be on or before the end date."); return; }
        setRange({ from, to });
      }}>
        <label className="text-xs text-slate-400">From (UTC day)<input type="date" required value={from} min={data?.availableFrom} max={to}
          onChange={event => setFrom(event.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <label className="text-xs text-slate-400">To (UTC day)<input type="date" required value={to} min={from} max={data?.availableTo ?? new Date().toISOString().slice(0, 10)}
          onChange={event => setTo(event.target.value)} className="mt-1 block rounded border border-white/20 bg-[#0d1d2b] px-3 py-2 text-sm text-white [color-scheme:dark]" /></label>
        <button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Show range</button>
        {data && <span className="pb-2 text-xs text-slate-500">Available: {data.availableFrom} to {data.availableTo}</span>}
      </form>}
    </div>

    {error && <div role="alert" className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-sm text-amber-100">{error}
      <button className="ml-4 underline" onClick={() => setAttempt(value => value + 1)}>Retry</button>{data && <p className="mt-1 text-xs">Showing the last successfully loaded data.</p>}</div>}
    {loading && <p role="status" className="mb-4 text-sm text-slate-400">Loading Swissgrid imbalance and AEP…</p>}
    {!loading && data && data.rows.length === 0 && <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-slate-400">No Swissgrid values are available for this date range.</div>}
    {data && data.rows.length > 0 && <ControlAreaBalanceChart rows={data.rows} period={period} />}
  </div>;
}
