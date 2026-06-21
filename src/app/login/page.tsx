"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.push("/dashboard");
  }

  async function handleSignUp() {
    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Account created. Check your email if confirmation is required, then sign in.");
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
        <h1 className="text-3xl font-semibold mb-2">GHI Risk Dashboard</h1>
        <p className="text-slate-400 mb-8">Sign in to access the dashboard.</p>

        <label className="block text-sm text-slate-300 mb-2">Email</label>
        <input
          className="w-full mb-4 rounded-lg bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-cyan-400"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="block text-sm text-slate-300 mb-2">Password</label>
        <input
          className="w-full mb-6 rounded-lg bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-cyan-400"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />

        <div className="flex gap-3">
          <button
            className="flex-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-3 disabled:opacity-50"
            onClick={handleSignIn}
            disabled={loading}
          >
            Sign in
          </button>

          <button
            className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold px-4 py-3 disabled:opacity-50"
            onClick={handleSignUp}
            disabled={loading}
          >
            Sign up
          </button>
        </div>

        {message && (
          <p className="mt-6 text-sm text-slate-300 border border-slate-800 rounded-lg p-3">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
