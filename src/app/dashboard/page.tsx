"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

type DashboardView = "empty" | "imbalance-ch";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<DashboardView>("empty");
  const [dashboardHtml, setDashboardHtml] = useState("");
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      setUser(data.user);
      setLoading(false);
    }

    loadUser();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function openImbalanceDashboard() {
    setActiveView("imbalance-ch");

    if (dashboardHtml) {
      return;
    }

    setDashboardLoading(true);
    setDashboardError("");

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      const response = await fetch("/api/dashboard-html", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (response.status === 401) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error || "The dashboard could not be loaded.");
      }

      setDashboardHtml(await response.text());
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "The dashboard could not be loaded.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#071018] text-slate-200">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
          Opening workspace…
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-[#071018] text-slate-100">
      <aside className="flex w-72 shrink-0 flex-col border-r border-white/10 bg-[#0b1722] p-4">
        <div className="border-b border-white/10 px-3 pb-5 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400">
            GHI Risk
          </p>
          <h1 className="mt-2 text-lg font-semibold">Dashboard models</h1>
        </div>

        <nav className="flex-1 py-5" aria-label="Dashboard models">
          <button
            type="button"
            onClick={openImbalanceDashboard}
            aria-current={activeView === "imbalance-ch" ? "page" : undefined}
            className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
              activeView === "imbalance-ch"
                ? "bg-cyan-400/12 text-cyan-200 ring-1 ring-inset ring-cyan-300/20"
                : "text-slate-300 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                activeView === "imbalance-ch"
                  ? "bg-cyan-300"
                  : "bg-slate-600 group-hover:bg-slate-400"
              }`}
            />
            <span className="font-medium">Imbalance CH model</span>
          </button>
        </nav>

        <div className="border-t border-white/10 px-3 pt-4">
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <button
            type="button"
            className="mt-3 text-sm text-slate-400 transition hover:text-white"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center border-b border-white/10 bg-[#09131d] px-6">
          <div>
            <p className="text-sm font-medium text-slate-200">
              {activeView === "imbalance-ch"
                ? "Imbalance CH model"
                : "Model workspace"}
            </p>
            <p className="text-xs text-slate-500">
              {activeView === "imbalance-ch"
                ? "Switzerland imbalance dashboard"
                : "Select a model from the sidebar"}
            </p>
          </div>
        </header>

        <div className="min-h-0 flex-1">
          {activeView === "empty" && (
            <div className="flex h-full min-h-[calc(100vh-4rem)] items-center justify-center p-8">
              <div className="max-w-md text-center">
                <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03]">
                  <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                </div>
                <h2 className="text-lg font-medium text-slate-200">
                  Your model workspace is ready
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Select “Imbalance CH model” from the sidebar to open the
                  dashboard.
                </p>
              </div>
            </div>
          )}

          {activeView === "imbalance-ch" && dashboardLoading && (
            <div className="flex h-full min-h-[calc(100vh-4rem)] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                Loading Imbalance CH model…
              </div>
            </div>
          )}

          {activeView === "imbalance-ch" && dashboardError && (
            <div className="flex h-full min-h-[calc(100vh-4rem)] items-center justify-center p-8">
              <div className="max-w-lg rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6">
                <h2 className="font-medium text-amber-100">
                  Dashboard HTML not available
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {dashboardError}
                </p>
                <button
                  type="button"
                  onClick={openImbalanceDashboard}
                  className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/15"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {activeView === "imbalance-ch" && dashboardHtml && (
            <iframe
              title="Imbalance CH model dashboard"
              srcDoc={dashboardHtml}
              className="block h-[calc(100vh-4rem)] w-full border-0 bg-white"
              allow="fullscreen"
            />
          )}
        </div>
      </section>
    </main>
  );
}
