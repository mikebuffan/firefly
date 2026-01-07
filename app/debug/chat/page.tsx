"use client";

import { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function DebugChatPage() {
  const supabase = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [msg, setMsg] = useState("Whazzup?");
  const [reply, setReply] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setReply("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signOut() {
    setReply("");
    await supabase.auth.signOut();
  }

  async function send() {
    setLoading(true);
    setReply("");

    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;

      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in to Supabase");

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
      setReply(`ERROR: ${e?.message ?? String(e)}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Debug Chat</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={signIn} style={{ padding: "8px 12px" }}>Sign In</button>
        <button onClick={signOut} style={{ padding: "8px 12px" }}>Sign Out</button>
      </div>

      <textarea
        value={msg}
        onChange={(e) => setMsg(e.target.value)}
        rows={4}
        style={{ width: "100%", padding: 8 }}
      />

      <button onClick={send} disabled={loading} style={{ marginTop: 8 }}>
        {loading ? "Sending..." : "Send"}
      </button>

      <pre style={{ marginTop: 16, padding: 12, background: "#111", color: "#0f0", overflowX: "auto" }}>
        {reply}
      </pre>
    </div>
  );
}
