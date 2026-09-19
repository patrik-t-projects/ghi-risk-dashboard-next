import { createClient } from "@supabase/supabase-js";
import { selectControlAreaBalanceRange, validUtcDay } from "@/lib/controlAreaBalanceCsv";
import { ControlAreaBalanceSourceError, loadControlAreaBalance } from "@/lib/controlAreaBalanceSource";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return Response.json({ error: "Authentication required." }, { status: 401, headers });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return Response.json({ error: "Authentication unavailable." }, { status: 503, headers });
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: user, error: userError } = await client.auth.getUser(token);
  if (userError || !user.user) return Response.json({ error: "Please sign in again." }, { status: 401, headers });

  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "today";
  const from = params.get("from");
  const to = params.get("to");
  if (view !== "today" && view !== "history") return Response.json({ error: "Invalid balance-data view." }, { status: 400, headers });
  if (view === "history" && (!from || !to || !validUtcDay(from) || !validUtcDay(to) || from > to ||
      Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > 366 * 86400000)) {
    return Response.json({ error: "Choose a valid historical UTC date range of at most 367 days." }, { status: 400, headers });
  }

  try {
    const snapshot = await loadControlAreaBalance(view === "today" ? "today" : "yearly");
    const rows = view === "history" ? selectControlAreaBalanceRange(snapshot.data.rows, from!, to!) : snapshot.data.rows;
    return Response.json({ rows, start: rows[0]?.time ?? null, end: rows.at(-1)?.time ?? null,
      availableFrom: snapshot.data.start.slice(0, 10), availableTo: snapshot.data.end.slice(0, 10), version: snapshot.version }, { headers });
  } catch (error) {
    return Response.json({ error: error instanceof ControlAreaBalanceSourceError ? error.message : "Swissgrid data is temporarily unavailable." },
      { status: error instanceof ControlAreaBalanceSourceError ? error.status : 503, headers });
  }
}
