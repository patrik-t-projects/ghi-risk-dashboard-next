"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ImbalanceForecastFrame({ height = 720 }: { height?: number }) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Please sign in again to load the imbalance forecast.");
        const response = await fetch("/api/dashboard-html?dashboard=imbalance-ch", { signal: controller.signal, cache: "no-store",
          headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: string } | null;
          throw new Error(payload?.error || "The imbalance forecast could not be loaded.");
        }
        const result = await response.text();
        if (!controller.signal.aborted) setHtml(result);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "The imbalance forecast could not be loaded.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  if (loading) return <p role="status" className="p-5 text-sm text-slate-400">Loading imbalance forecast…</p>;
  if (error) return <div role="alert" className="m-5 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-sm text-amber-100">
    {error}<button type="button" className="ml-4 underline" onClick={() => setAttempt(value => value + 1)}>Retry</button></div>;
  return <iframe title="Imbalance forecast dashboard" srcDoc={html} style={{ height }}
    className="block min-h-[300px] w-full border-0 bg-white" allow="fullscreen" />;
}
