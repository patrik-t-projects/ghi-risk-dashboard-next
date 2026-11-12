"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { defaultCustomDashboard, normalizeCustomDashboard, pinDashboardWidget,
  type CustomDashboardState, type DashboardWidget } from "@/lib/customDashboard";

const SwitzerlandBeta = dynamic(() => import("@/components/SwitzerlandBeta"), {
  ssr: false,
  loading: () => <p className="p-10 text-slate-400">Loading station explorer…</p>,
});
const FogMap = dynamic(() => import("@/components/FogMap"), {
  ssr: false,
  loading: () => <p className="p-10 text-slate-400">Loading fog map…</p>,
});
const ControlAreaBalance = dynamic(() => import("@/components/ControlAreaBalance"), {
  ssr: false,
  loading: () => <p className="p-10 text-slate-400">Loading Swissgrid data…</p>,
});
const CustomDashboard = dynamic(() => import("@/components/CustomDashboard"), {
  ssr: false,
  loading: () => <p className="p-10 text-slate-400">Loading personal dashboard…</p>,
});

const DASHBOARDS = {
  dashboard: {
    label: "Dashboard",
    description: "Your pinned live plots",
  },
  "control-area-balance": {
    label: "CH Imbalance & AEP",
    description: "Swiss control-area balance and balancing energy price",
  },
  "switzerland-beta": {
    label: "Switzerland map — Beta",
    description: "Station forecasts · Today and historical days",
  },
  "fog-map": {
    label: "Fog map",
    description: "Switzerland fog map",
  },
} as const;

type DashboardId = keyof typeof DASHBOARDS;
type DashboardView = "empty" | DashboardId;

export default function DashboardPage() {
  const router = useRouter();
  const dashboardAreaRef = useRef<HTMLElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false);
  const [activeView, setActiveView] = useState<DashboardView>("empty");
  const [betaMode, setBetaMode] = useState<"today" | "history">("today");
  const [balanceMode, setBalanceMode] = useState<"today" | "history">("today");
  const [customDashboard, setCustomDashboard] = useState<CustomDashboardState>(defaultCustomDashboard);

  useEffect(() => {
    async function loadUser() {
      const { data, error } = await supabase.auth.getUser();

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("account_usernames").select("username").eq("user_id", data.user.id).maybeSingle();
      if (!profileError && !profile) {
        router.replace("/account");
        return;
      }
      try {
        const stored = localStorage.getItem(`energy-dashboard-layout:${data.user.id}`);
        setCustomDashboard(stored ? normalizeCustomDashboard(JSON.parse(stored)) : defaultCustomDashboard());
      } catch { setCustomDashboard(defaultCustomDashboard()); }
      setUser(data.user);
      setLoading(false);
    }

    loadUser();
  }, [router]);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 768px)");
    const handleWidthChange = (event: MediaQueryListEvent | MediaQueryList) => {
      setSidebarOpen(event.matches);
    };
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === dashboardAreaRef.current);
    };

    handleWidthChange(desktopQuery);
    desktopQuery.addEventListener("change", handleWidthChange);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

    return () => {
      desktopQuery.removeEventListener("change", handleWidthChange);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  function saveCustomDashboard(next: CustomDashboardState) {
    setCustomDashboard(next);
    if (user) localStorage.setItem(`energy-dashboard-layout:${user.id}`, JSON.stringify(next));
  }

  function pinWidget(widget: DashboardWidget) {
    setCustomDashboard(current => {
      const next = pinDashboardWidget(current, widget);
      if (user) localStorage.setItem(`energy-dashboard-layout:${user.id}`, JSON.stringify(next));
      return next;
    });
  }

  const isPinned = (widgetId: string) => customDashboard.widgets.some(widget => widget.id === widgetId);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function openDashboard(dashboardId: DashboardId) {
    setActiveView(dashboardId);

    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }
  }

  async function toggleFullscreen() {
    const dashboardArea = dashboardAreaRef.current;

    if (!dashboardArea) {
      return;
    }

    if (fallbackFullscreen) {
      setFallbackFullscreen(false);
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (document.fullscreenEnabled && dashboardArea.requestFullscreen) {
      await dashboardArea.requestFullscreen();
      return;
    }

    setFallbackFullscreen(true);
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

  const activeDashboard =
    activeView === "empty" ? null : DASHBOARDS[activeView];
  const dashboardEntries = Object.entries(DASHBOARDS) as [
    DashboardId,
    (typeof DASHBOARDS)[DashboardId],
  ][];
  const fullscreenActive = isFullscreen || fallbackFullscreen;

  return (
    <main className="relative flex min-h-dvh bg-[#071018] text-slate-100">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close dashboard menu"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/55 md:hidden"
        />
      )}

      <aside
        className={`${
          sidebarOpen ? "flex" : "hidden"
        } w-72 shrink-0 flex-col border-r border-white/10 bg-[#0b1722] p-4 max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-2xl`}
      >
        <div className="border-b border-white/10 px-3 pb-5 pt-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Hide menu"
              title="Hide menu"
              className="flex h-8 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              {"<<"}
            </button>
          </div>
          <p className="text-[11px] font-semibold tracking-[0.22em] text-cyan-400">
            Energy Dashboard
          </p>
          <h1 className="mt-2 text-lg font-semibold">Dashboard models</h1>
        </div>

        <nav className="flex-1 space-y-2 py-5" aria-label="Dashboard models">
          {dashboardEntries.map(([dashboardId, dashboard]) => {
            const isActive = activeView === dashboardId;

            return (
              <div key={dashboardId}>
              <button
                type="button"
                onClick={() => openDashboard(dashboardId)}
                aria-current={isActive ? "page" : undefined}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${
                  isActive
                    ? "bg-cyan-400/12 text-cyan-200 ring-1 ring-inset ring-cyan-300/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isActive
                      ? "bg-cyan-300"
                      : "bg-slate-600 group-hover:bg-slate-400"
                  }`}
                />
                <span className="font-medium">{dashboard.label}</span>
              </button>
              {dashboardId === "switzerland-beta" && isActive && <div className="ml-7 mt-1 space-y-1 border-l border-white/10 pl-3">
                {(["today", "history"] as const).map(mode => <button key={mode} type="button" aria-current={betaMode === mode ? "page" : undefined}
                  onClick={() => { setBetaMode(mode); if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${betaMode === mode ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>{mode === "today" ? "Today" : "Historical"}</button>)}
              </div>}
              {dashboardId === "control-area-balance" && isActive && <div className="ml-7 mt-1 space-y-1 border-l border-white/10 pl-3">
                {(["today", "history"] as const).map(mode => <button key={mode} type="button" aria-current={balanceMode === mode ? "page" : undefined}
                  onClick={() => { setBalanceMode(mode); if (window.matchMedia("(max-width: 767px)").matches) setSidebarOpen(false); }}
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${balanceMode === mode ? "bg-cyan-400/10 text-cyan-200" : "text-slate-400 hover:bg-white/5"}`}>{mode === "today" ? "Today" : "Historical"}</button>)}
              </div>}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-3 pt-4">
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <Link href="/account" className="mt-3 block text-sm text-cyan-300 hover:text-cyan-200">Account settings</Link>
          <button
            type="button"
            className="mt-3 text-sm text-slate-400 transition hover:text-white"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </aside>

      <section
        ref={dashboardAreaRef}
        className={`relative flex min-w-0 flex-1 flex-col bg-[#071018] ${
          fallbackFullscreen ? "fixed inset-0 z-50" : ""
        }`}
      >
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#09131d] px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {!fullscreenActive && !sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-expanded={sidebarOpen}
                aria-label="Show menu"
                title="Show menu"
                className="flex h-8 min-w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 px-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
              >
                {">>"}
              </button>
            )}
            <div className="min-w-0">
            <p className="text-sm font-medium text-slate-200">
              {activeDashboard?.label ?? "Model workspace"}
            </p>
            <p className="truncate text-xs text-slate-500">
              {activeDashboard?.description ?? "Select a model from the sidebar"}
            </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleFullscreen}
            disabled={activeView === "empty"}
            className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {fullscreenActive ? "Exit fullscreen" : "Fullscreen"}
          </button>
        </header>

        <div className="min-h-0 flex-1">
          {activeView === "dashboard" && <CustomDashboard state={customDashboard} onSave={saveCustomDashboard} />}
          {activeView === "control-area-balance" && <ControlAreaBalance mode={balanceMode} onModeChange={setBalanceMode} onPin={pinWidget} isPinned={isPinned} />}
          {activeView === "switzerland-beta" && <SwitzerlandBeta mode={betaMode} onModeChange={setBetaMode} onPin={pinWidget} isPinned={isPinned} />}
          {activeView === "fog-map" && <FogMap />}
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
                  Select a dashboard model from the sidebar to open it.
                </p>
              </div>
            </div>
          )}

        </div>
      </section>
    </main>
  );
}
