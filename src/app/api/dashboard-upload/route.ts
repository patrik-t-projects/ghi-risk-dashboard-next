import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DASHBOARD_BUCKET = "dashboard-html";

const UPLOAD_TARGETS = {
  "imbalance-ch": {
    path: "imbalance_dashboard.html",
    contentType: "text/html; charset=utf-8",
  },
  "icon-forecast": {
    path: "icon_forecast.html",
    contentType: "text/html; charset=utf-8",
  },
} as const;

type UploadTarget = keyof typeof UPLOAD_TARGETS;

function hasValidUploadToken(request: Request, expectedToken: string) {
  const authorization = request.headers.get("authorization");
  const suppliedToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";

  const suppliedBytes = Buffer.from(suppliedToken);
  const expectedBytes = Buffer.from(expectedToken);

  return (
    suppliedBytes.length === expectedBytes.length &&
    suppliedBytes.length > 0 &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  const uploadToken = process.env.PI_UPLOAD_TOKEN;

  if (!supabaseUrl || !supabaseSecretKey || !uploadToken) {
    return Response.json(
      { error: "Dashboard uploads are not configured." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (!hasValidUploadToken(request, uploadToken)) {
    return Response.json(
      { error: "Invalid upload credentials." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const dashboardId = new URL(request.url).searchParams.get(
    "dashboard",
  ) as UploadTarget | null;
  const target = dashboardId ? UPLOAD_TARGETS[dashboardId] : null;

  if (!target) {
    return Response.json(
      { error: "Unknown dashboard." },
      {
        status: 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const { data, error } = await supabase.storage
    .from(DASHBOARD_BUCKET)
    .createSignedUploadUrl(target.path, { upsert: true });

  if (error || !data) {
    console.error("Could not create a signed dashboard upload URL:", error);

    return Response.json(
      { error: "Could not authorize the dashboard upload." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return Response.json(
    {
      dashboard: dashboardId,
      path: target.path,
      uploadUrl: data.signedUrl,
      method: "PUT",
      contentType: target.contentType,
      expiresInSeconds: 7200,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
