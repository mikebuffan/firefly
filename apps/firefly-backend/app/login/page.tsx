"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    setMsg(error ? error.message : "Signed in. Go test /debug/chat");
  }

  async function signUp(e: React.MouseEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);
    setMsg(error ? error.message : "Signed up. If email confirmations are on, check email.");
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Login</h1>

      <form onSubmit={signIn} style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <button disabled={loading} type="submit">
          {loading ? "…" : "Sign in"}
        </button>
        <button disabled={loading} onClick={signUp}>
          Create account
        </button>
      </form>

      {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
    </div>
  );
}
