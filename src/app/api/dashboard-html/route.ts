import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const DASHBOARD_FILES = {
  "imbalance-ch": "imbalance_dashboard.html",
  "icon-forecast": "icon_forecast.html",
} as const;

const DASHBOARD_BUCKET = "dashboard-html";

type DashboardId = keyof typeof DASHBOARD_FILES;

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!accessToken) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return Response.json(
      { error: "Dashboard authentication is not configured." },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return Response.json(
      { error: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  const dashboardId = new URL(request.url).searchParams.get(
    "dashboard",
  ) as DashboardId | null;
  const dashboardFile = dashboardId ? DASHBOARD_FILES[dashboardId] : null;

  if (!dashboardFile) {
    return Response.json({ error: "Unknown dashboard." }, { status: 400 });
  }

  const storageObjectPath = [DASHBOARD_BUCKET, dashboardFile]
    .map(encodeURIComponent)
    .join("/");
  const storageUrl = new URL(
    `/storage/v1/object/authenticated/${storageObjectPath}`,
    supabaseUrl,
  );

  // A unique query value prevents an overwritten object from being served from
  // an intermediary cache. The response itself is also explicitly non-cacheable.
  storageUrl.searchParams.set("v", Date.now().toString());

  try {
    const storageResponse = await fetch(storageUrl, {
      cache: "no-store",
      headers: {
        apikey: supabasePublishableKey,
        Authorization: `Bearer ${accessToken}`,
        "Cache-Control": "no-cache",
      },
    });

    if (storageResponse.ok) {
      const html = await storageResponse.text();

      return new Response(html, {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "Content-Type": "text/html; charset=utf-8",
          "X-Content-Type-Options": "nosniff",
          "X-Dashboard-Source": "supabase-storage",
        },
      });
    }

    // Keep the currently deployed dashboards working while Storage is being
    // configured, or when a dashboard has not yet been uploaded there.
    const dashboardPath = path.join(
      process.cwd(),
      "dashboard-html",
      dashboardFile,
    );
    const html = await readFile(dashboardPath, "utf8");

    return new Response(html, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Dashboard-Source": "deployment-fallback",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          `Upload ${dashboardFile} to the private Supabase Storage bucket ${DASHBOARD_BUCKET}.`,
      },
      { status: 404 },
    );
  }
}
