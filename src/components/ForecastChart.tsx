"use client";

import { useEffect, useRef, useState } from "react";
import type { ForecastData, ForecastSegments, StationForecast } from "@/lib/forecastCsv";
import { seriesPoints } from "@/lib/forecastHistory";

const runLabel = (run: string) => `${run.slice(6, 8)}.${run.slice(4, 6)}. ${Number(run.slice(9, 11))} UTC`;

export default function ForecastChart({ data, station, model, period = "" }: {
  data: Pick<ForecastData, "series"> & { segments?: ForecastSegments }; station: StationForecast; model: "icon_ch1" | "icon_ch2"; period?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [hiddenRuns, setHiddenRuns] = useState<string[]>([]);
  const [members, setMembers] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const element = container.current;
    return () => { if (element) void import("plotly.js/dist/plotly-basic.min.js").then(({ default: plotly }) => plotly.purge(element)); };
  }, []);
  const runs = [...new Set(data.series.filter(s => s.model === model).map(s => s.run))].sort();


  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let disposed = false;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    async function draw() {
      try {
        const { default: Plotly } = await import("plotly.js/dist/plotly-basic.min.js");
        if (disposed || !element) return;
        const modelRuns = [...new Set(data.series.filter(s => s.model === model).map(s => s.run))].sort();
        const traces: Record<string, unknown>[] = [];
        const segments = data.segments ?? [{ series: data.series, rows: station.rows }];
        data.series.forEach((series) => {
          if (series.model !== model || hiddenRuns.includes(series.run) || (!members && series.member !== "control")) return;
          const latest = series.run === modelRuns[modelRuns.length - 1];
          const control = series.member === "control";
          const date = `${series.run.slice(0, 4)}-${series.run.slice(4, 6)}-${series.run.slice(6, 8)}`;
          const run = `${date} ${series.run.slice(9, 11)}:${series.run.slice(11, 13)} UTC`;
          traces.push({
            type: "scatter", mode: "lines", name: control ? "Control" : series.member.replace("member_", "Member "),
            ...seriesPoints(segments, series.key),
            connectgaps: false, legendgroup: series.run, legendgrouptitle: { text: runLabel(series.run) },
            line: { color: latest ? "#2563eb" : "#9ca3af", width: control ? 3.2 : 1.4 }, opacity: control ? 1 : 0.5,
            hovertemplate: `${control ? "Control" : series.member.replace("member_", "Member ")} · ${run}<br>%{y:.1f} W/m²<extra></extra>`,
          });
        });
        traces.push({ type: "scatter", mode: "lines", name: "Actual GHI", legendgroup: "actual",
          ...seriesPoints(segments),
          line: { color: "#16a34a", width: 3.2 }, connectgaps: false,
          hovertemplate: "Actual GHI: %{y:.1f} W/m²<extra></extra>" });
        await Plotly.react(element, traces, {
          autosize: true, height: 520, paper_bgcolor: "#ffffff", plot_bgcolor: "#ffffff",
          margin: { l: 62, r: 18, t: 20, b: 65 }, font: { family: "Arial, sans-serif", size: 11, color: "#334155" },
          xaxis: { title: { text: "Datetime UTC" }, type: "date", tickformat: "%d %b<br>%H:%M", gridcolor: "#e5e7eb", nticks: 7,
            ...(period ? { range: [ `${period.split(":")[0]}T00:00:00`, new Date(Date.parse(`${period.split(":")[1]}T00:00:00Z`) + 86400000).toISOString().replace(/Z$/, "") ] } : {}) },
          yaxis: { title: { text: "GHI [W/m²]" }, rangemode: "tozero", gridcolor: "#e5e7eb" },
          hovermode: "x unified", uirevision: `${station.id}-${model}-${period}`, showlegend: true,
          legend: { orientation: "h", y: -0.25, x: 0, maxheight: 0.25, groupclick: "toggleitem", font: { size: 10 } },
        }, { responsive: true, displaylogo: false, scrollZoom: false, toImageButtonOptions: { filename: `${station.id}-${model}-ghi`, scale: 2 } });
        if (disposed) return;
        observer = new ResizeObserver(() => {
          cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => { if (!disposed) Plotly.Plots.resize(element); });
        });
        observer.observe(element);
      } catch { if (!disposed) setError(true); }
    }
    void draw();
    return () => { disposed = true; observer?.disconnect(); cancelAnimationFrame(frame); };
  }, [data, station, model, hiddenRuns, members, attempt, period]);

  return <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800">
    <div className="border-b border-slate-100 px-5 py-4">
      <h3 className="font-semibold">{model === "icon_ch1" ? "ICON1" : "ICON2"} <span className="ml-2 font-normal text-slate-400">Global horizontal irradiance</span></h3>
      <div className="mt-3 flex max-h-28 flex-wrap items-center gap-x-4 gap-y-2 overflow-y-auto text-xs">
        {runs.map((run, index) => <label key={run} className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={!hiddenRuns.includes(run)} onChange={e => setHiddenRuns(current => e.target.checked ? current.filter(r => r !== run) : [...current, run])} />
          <span className="h-0.5 w-4" style={{ background: index === runs.length - 1 ? "#2563eb" : "#9ca3af" }} />{runLabel(run)}
        </label>)}
        <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={members} onChange={e => setMembers(e.target.checked)} />Members</label>
        <span className="text-green-600">━ Actual GHI</span>
      </div>
    </div>
    {error ? <div role="alert" className="p-8">Chart could not be loaded. <button className="underline" onClick={() => { setError(false); setAttempt(a => a + 1); }}>Retry</button></div> : <div ref={container} className="h-[520px] w-full" aria-label={`${model === "icon_ch1" ? "ICON1" : "ICON2"} forecast and measured GHI for ${station.name}`} />}
  </section>;
}
