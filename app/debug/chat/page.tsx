"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function DebugChatPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("Whazzup?");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function send() {
    setLoading(true);
    setReply("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userText: msg }),
      });

      const json = await res.json();
      setReply(JSON.stringify(json, null, 2));
    } catch (e: any) {
      setReply(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Debug Chat</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
        <button onClick={() => signIn()} disabled={loading}>Sign in</button>
      </div>

      <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={4} style={{ width: "100%", padding: 8 }} />
      <button onClick={send} disabled={loading} style={{ marginTop: 8 }}>
        {loading ? "Sending..." : "Send"}
      </button>

      <pre style={{ marginTop: 16, padding: 12, background: "#111", color: "#0f0", overflowX: "auto" }}>
        {reply}
      </pre>
    </div>
  );
}
