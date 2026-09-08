"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AccountPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [username, setUsername] = useState("");
  const [hasUsername, setHasUsername] = useState(false);
  const [email, setEmail] = useState("");
  const [currentEmail, setCurrentEmail] = useState("");
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) { router.replace("/login"); return; }
        const { data: profile, error: profileError } = await supabase.from("account_usernames")
          .select("username").eq("user_id", data.user.id).maybeSingle();
        if (profileError) throw new Error("Account settings are not available yet. Please try again later.");
        setUserId(data.user.id);
        setEmail(data.user.email ?? "");
        setCurrentEmail(data.user.email ?? "");
        setUsername(profile?.username ?? "");
        setHasUsername(Boolean(profile));
        setReady(true);
      } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load your account."); }
    }
    void load();
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !ready) return;
    setSaving(true);
    setMessage("");
    try {
      const normalized = username.trim().toLowerCase();
      const { error } = await supabase.from("account_usernames")
        .upsert({ user_id: userId, username: normalized }, { onConflict: "user_id" });
      if (error) throw new Error(error.code === "23505" ? "That username is already taken. Choose another." : "Could not save your username. Please try again.");
      setUsername(normalized);
      setHasUsername(true);
      if (email.trim() !== currentEmail) {
        const { error: emailError } = await supabase.auth.updateUser({ email: email.trim() });
        if (emailError) throw new Error("Username saved. Email was not changed: " + emailError.message);
        setMessage("Username saved. Check your email for confirmation links to complete the email change. Your current email remains active until confirmed.");
      } else { setMessage("Account saved."); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save your account."); }
    finally { setSaving(false); }
  }
  const inputClass = "mt-2 mb-5 w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 focus:border-cyan-400 outline-none";
  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-8">
        <h1 className="text-2xl font-semibold mb-3">Account settings</h1>
        <p className="text-slate-400 mb-6">{ready && !hasUsername ? "Choose a username to complete your account setup." : "Manage your username and email address."}</p>
        <form onSubmit={save}>
          <fieldset disabled={!ready || saving}>
            <label htmlFor="username">Username</label>
            <input id="username" name="username" className={inputClass} autoComplete="username" autoCapitalize="none" required pattern="[A-Za-z0-9_]{3,30}" title="3–30 letters, numbers, or underscores" value={username} onChange={e => setUsername(e.target.value)} />
            <p className="text-sm text-slate-400 mb-5">3–30 letters, numbers, or underscores. Usernames are not case-sensitive.</p>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" className={inputClass} type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            <button type="submit" className="w-full rounded-lg bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50" disabled={!ready || saving}>{saving ? "Saving…" : "Save account"}</button>
          </fieldset>
        </form>
        {message && <p role="status" className="mt-5 text-sm text-slate-300">{message}</p>}
        {hasUsername && <Link href="/dashboard" className="block mt-6 text-cyan-300">Back to dashboard</Link>}
        <button type="button" className="block mt-4 text-sm text-slate-400" onClick={async () => { await supabase.auth.signOut(); router.replace("/login"); }}>Sign out</button>
      </div>
    </main>
  );
}
