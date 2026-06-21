import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-semibold mb-6">GHI Risk Dashboard</h1>
        <p className="text-slate-400 text-lg mb-8">
          Online dashboard for GHI forecasts, risk scores, regional maps, and
          historical backtesting.
        </p>

        <div className="flex justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-6 py-3"
          >
            Login
          </Link>

          <Link
            href="/dashboard"
            className="rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold px-6 py-3"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
