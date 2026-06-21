"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabase.auth.getUser();

      if (!data.user) {
        router.push("/login");
        return;
      }

      setUser(data.user);
      setLoading(false);
    }

    loadUser();
  }, [router]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        Loading dashboard...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-semibold">GHI Risk Dashboard</h1>
            <p className="text-slate-400">Logged in as {user?.email}</p>
          </div>

          <button
            className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-slate-400 text-sm">Latest risk</p>
            <p className="text-3xl font-semibold mt-2">--</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-slate-400 text-sm">Max GHI</p>
            <p className="text-3xl font-semibold mt-2">-- W/m²</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-slate-400 text-sm">Cloud cover</p>
            <p className="text-3xl font-semibold mt-2">-- %</p>
          </div>

          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5">
            <p className="text-slate-400 text-sm">Last update</p>
            <p className="text-3xl font-semibold mt-2">--</p>
          </div>
        </section>

        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
          <h2 className="text-xl font-semibold mb-2">Dashboard placeholder</h2>
          <p className="text-slate-400">
            Next we will add the Switzerland map, time slider, variable buttons,
            and plots.
          </p>
        </section>
      </div>
    </main>
  );
}
