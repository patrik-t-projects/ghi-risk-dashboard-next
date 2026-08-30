"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

const DASHBOARDS = {
  "imbalance-ch": {
    label: "Imbalance CH model",
    description: "Switzerland imbalance dashboard",
  },
  "icon-forecast": {
    label: "ICON forecast",
    description: "ICON weather forecast dashboard",
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
  const [dashboardHtml, setDashboardHtml] = useState<
    Partial<Record<DashboardId, string>>
  >({});
  const [dashboardLoading, setDashboardLoading] = useState<DashboardId | null>(
    null,
  );
  const [dashboardErrors, setDashboardErrors] = useState<
    Partial<Record<DashboardId, string>>
  >({});

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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function openDashboard(dashboardId: DashboardId) {
    setActiveView(dashboardId);

    if (window.matchMedia("(max-width: 767px)").matches) {
      setSidebarOpen(false);
    }

    if (dashboardHtml[dashboardId]) {
      return;
    }

    setDashboardLoading(dashboardId);
    setDashboardErrors((current) => ({ ...current, [dashboardId]: undefined }));

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      const response = await fetch(
        `/api/dashboard-html?dashboard=${encodeURIComponent(dashboardId)}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        },
      );

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

      const html = await response.text();
      setDashboardHtml((current) => ({ ...current, [dashboardId]: html }));
    } catch (error) {
      setDashboardErrors((current) => ({
        ...current,
        [dashboardId]:
          error instanceof Error
            ? error.message
            : "The dashboard could not be loaded.",
      }));
    } finally {
      setDashboardLoading(null);
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
  const activeHtml = activeView === "empty" ? null : dashboardHtml[activeView];
  const activeError =
    activeView === "empty" ? null : dashboardErrors[activeView];
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-400">
            GHI Risk
          </p>
          <h1 className="mt-2 text-lg font-semibold">Dashboard models</h1>
        </div>

        <nav className="flex-1 space-y-2 py-5" aria-label="Dashboard models">
          {dashboardEntries.map(([dashboardId, dashboard]) => {
            const isActive = activeView === dashboardId;

            return (
              <button
                key={dashboardId}
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
            );
          })}
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

      <section
        ref={dashboardAreaRef}
        className={`relative flex min-w-0 flex-1 flex-col bg-[#071018] ${
          fallbackFullscreen ? "fixed inset-0 z-50" : ""
        }`}
      >
        <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-[#09131d] px-3 py-2 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {!fullscreenActive && (
              <button
                type="button"
                onClick={() => setSidebarOpen((current) => !current)}
                aria-expanded={sidebarOpen}
                className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-white/10"
              >
                {sidebarOpen ? "Hide menu" : "Show menu"}
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

          {activeView !== "empty" && dashboardLoading === activeView && (
            <div className="flex h-full min-h-[calc(100vh-4rem)] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-slate-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
                Loading {DASHBOARDS[activeView].label}…
              </div>
            </div>
          )}

          {activeView !== "empty" && activeError && (
            <div className="flex h-full min-h-[calc(100vh-4rem)] items-center justify-center p-8">
              <div className="max-w-lg rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-6">
                <h2 className="font-medium text-amber-100">
                  Dashboard HTML not available
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {activeError}
                </p>
                <button
                  type="button"
                  onClick={() => openDashboard(activeView)}
                  className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-sm text-white transition hover:bg-white/15"
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {activeView !== "empty" && activeHtml && (
            <iframe
              title={`${DASHBOARDS[activeView].label} dashboard`}
              srcDoc={activeHtml}
              className="block h-[calc(100dvh-4rem)] w-full border-0 bg-white"
              allow="fullscreen"
            />
          )}
        </div>
      </section>
    </main>
  );
}
