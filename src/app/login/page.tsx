"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const inputClass = "w-full mb-4 rounded-lg bg-slate-950 border border-slate-700 px-4 py-3 outline-none focus:border-cyan-400";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage("");
    try {
      if (signup) {
        const { data, error } = await supabase.auth.signUp({
          email: identifier.trim(), password,
          options: { data: { username: username.trim().toLowerCase() } },
        });
        if (error) throw new Error("Could not create account. Check your details or try another username. " + error.message);
        if (data.session) { router.push("/dashboard"); return; }
        setMessage("Check your email to confirm your account, then sign in.");
        setSignup(false);
      } else {
        const response = await fetch("/api/login", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identifier, password }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        const { error } = await supabase.auth.setSession(result);
        if (error) throw error;
        router.push("/dashboard");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to connect. Please try again.");
    } finally { setLoading(false); }
  }
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
        <h1 className="text-3xl font-semibold mb-2">GHI Risk Dashboard</h1>
        <p className="text-slate-400 mb-8">{signup ? "Create your account." : "Sign in to access the dashboard."}</p>
        <form onSubmit={submit}>
          <label htmlFor="identifier" className="block text-sm text-slate-300 mb-2">{signup ? "Email" : "Username or email"}</label>
          <input id="identifier" name="identifier" className={inputClass} type={signup ? "email" : "text"} autoComplete={signup ? "email" : "username"} autoCapitalize="none" spellCheck={false} required value={identifier} onChange={e => setIdentifier(e.target.value)} />
          {signup && <>
            <label htmlFor="username" className="block text-sm text-slate-300 mb-2">Username</label>
            <input id="username" name="username" className={inputClass} autoComplete="username" autoCapitalize="none" required pattern="[A-Za-z0-9_]{3,30}" title="3–30 letters, numbers, or underscores" value={username} onChange={e => setUsername(e.target.value)} />
          </>}
          <label htmlFor="password" className="block text-sm text-slate-300 mb-2">Password</label>
          <input id="password" name="password" className={inputClass} type="password" autoComplete={signup ? "new-password" : "current-password"} required value={password} onChange={e => setPassword(e.target.value)} />
          <button type="submit" className="w-full rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-4 py-3 disabled:opacity-50" disabled={loading}>{loading ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
          <button type="button" className="w-full mt-3 rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-3 disabled:opacity-50" disabled={loading} onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "Back to sign in" : "Sign up"}</button>
        </form>
        {message && <p role="status" className="mt-6 text-sm text-slate-300 border border-slate-800 rounded-lg p-3">{message}</p>}
      </div>
    </main>
  );
}

