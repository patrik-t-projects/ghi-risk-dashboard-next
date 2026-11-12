"use client";

import { useEffect, useState } from "react";
import { fetchForecast } from "@/lib/forecastClient";
import { combineStationDays } from "@/lib/forecastHistory";
import type { StationForecastResponse } from "@/lib/forecastCsv";
import { fetchControlAreaBalance, type ControlAreaBalanceResponse } from "@/lib/controlAreaBalanceClient";
import type { DashboardWidget } from "@/lib/customDashboard";
import ForecastChart from "./ForecastChart";
import ControlAreaBalanceChart from "./ControlAreaBalanceChart";
import ImbalanceForecastFrame from "./ImbalanceForecastFrame";

export default function DashboardWidgetView({ widget, height }: { widget: DashboardWidget; height: number }) {
  if (widget.kind === "ghi") return <PinnedGhi widget={widget} height={Math.max(220, height - 180)} />;
  if (widget.kind === "balance") return <PinnedBalance widget={widget} height={height} />;
  return <ImbalanceForecastFrame height={height} />;
}

function PinnedGhi({ widget, height }: { widget: Extract<DashboardWidget, { kind: "ghi" }>; height: number }) {
  const [data, setData] = useState<ReturnType<typeof combineStationDays> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true; setLoading(true); setError("");
      try {
        const params: Record<string, string> = { view: widget.mode, station: widget.station.id };
        if (widget.mode === "history") Object.assign(params, { from: widget.from, to: widget.to });
        const result = await fetchForecast<StationForecastResponse>(params, controller.signal);
        if (!controller.signal.aborted) setData(combineStationDays(result.segments));
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load GHI data."); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const interval = widget.mode === "today" ? setInterval(load, 60000) : undefined;
    if (widget.mode === "today") document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); if (interval) clearInterval(interval); document.removeEventListener("visibilitychange", load); };
  }, [widget, attempt]);
  const today = new Date().toISOString().slice(0, 10);
  const from = widget.mode === "today" ? today : widget.from;
  const to = widget.mode === "today" ? today : widget.to;
  if (error && !data) return <WidgetError message={error} retry={() => setAttempt(value => value + 1)} />;
  if (loading && !data) return <WidgetLoading label="GHI forecast" />;
  return data ? <ForecastChart data={data} station={data.station} model={widget.model} period={`${from}:${to}`} height={height} /> : null;
}

function PinnedBalance({ widget, height }: { widget: Extract<DashboardWidget, { kind: "balance" }>; height: number }) {
  const [data, setData] = useState<ControlAreaBalanceResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let pending = false;
    async function load() {
      if (pending || document.hidden) return;
      pending = true; setLoading(true); setError("");
      try {
        const params: Record<string, string> = widget.mode === "today" ? { view: "today" } : { view: "history", from: widget.from, to: widget.to };
        const result = await fetchControlAreaBalance(params, controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (caught) { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load Swissgrid data."); }
      finally { pending = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    const interval = widget.mode === "today" ? setInterval(load, 60000) : undefined;
    if (widget.mode === "today") document.addEventListener("visibilitychange", load);
    return () => { controller.abort(); if (interval) clearInterval(interval); document.removeEventListener("visibilitychange", load); };
  }, [widget, attempt]);
  const today = new Date().toISOString().slice(0, 10);
  const from = widget.mode === "today" ? today : widget.from;
  const to = widget.mode === "today" ? today : widget.to;
  if (error && !data) return <WidgetError message={error} retry={() => setAttempt(value => value + 1)} />;
  if (loading && !data) return <WidgetLoading label="CH Imbalance & AEP" />;
  if (!data?.rows.length) return <div className="grid h-full place-items-center p-6 text-sm text-slate-400">No values are available for this period.</div>;
  return <ControlAreaBalanceChart rows={data.rows} from={from} to={to} height={height} />;
}

function WidgetLoading({ label }: { label: string }) {
  return <div role="status" className="grid h-full place-items-center text-sm text-slate-400">Loading {label}…</div>;
}

function WidgetError({ message, retry }: { message: string; retry: () => void }) {
  return <div role="alert" className="m-4 rounded-xl border border-amber-300/20 p-4 text-sm text-amber-100">{message}
    <button type="button" className="ml-3 underline" onClick={retry}>Retry</button></div>;
}
