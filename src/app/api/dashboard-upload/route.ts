import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { resolveUploadTarget } from "@/lib/uploadTargets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

  const params = new URL(request.url).searchParams;
  const dashboardId = params.get("dashboard");
  const target = resolveUploadTarget(dashboardId, params.get("date"));

  if (!target) {
    return Response.json(
      { error: "Invalid upload target. Daily forecasts require a valid date in YYYY-MM-DD format." },
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
    .from(target.bucket)
    .createSignedUploadUrl(target.path, { upsert: true });

  if (error || !data) {
    console.error("Could not authorize storage upload", { bucket: target.bucket, path: target.path });

    return Response.json(
      { error: "Could not authorize the upload. Check that the destination bucket exists." },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return Response.json(
    {
      dashboard: dashboardId,
      bucket: target.bucket,
      path: target.path,
      uploadUrl: data.signedUrl,
      method: "PUT",
      contentType: target.contentType,
      expiresInSeconds: 7200,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
