"use client";

import { useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ChatResponse =
  | {
      ok: true;
      projectId: string;
      conversationId: string;
      assistantText: string;
    }
  | { ok: false; error: any };

export default function DebugChatPage() {
  // Create the client once
  const supabase: SupabaseClient = useMemo(() => {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }, []);

  // Auth UI
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Chat UI
  const [msg, setMsg] = useState("Whazzup?");
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(false);

  // Persist these across sends
  const [projectId, setProjectId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setReply("");
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      // optional: confirm session
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Signed in, but no session returned.");

      setReply(JSON.stringify({ ok: true, message: "Signed in." }, null, 2));
    } catch (e: any) {
      setReply(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function newThread() {
    // Keep projectId (persona/framework scope), reset conversationId (new thread)
    setConversationId(null);
    setReply(JSON.stringify({ ok: true, message: "Started a new thread (conversationId reset)." }, null, 2));
  }

  async function send() {
    setLoading(true);
    setReply("");

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Not logged in");

      const body = {
        userText: msg,
        projectId,       // keep same project across threads (global Arbor persona)
        conversationId,  // reuse for continuity; null => server creates new conversation
      };

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ChatResponse;

      // Persist IDs so next send stays in same conversation
      if (json && (json as any).projectId) setProjectId((json as any).projectId);
      if (json && (json as any).conversationId) setConversationId((json as any).conversationId);

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

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
          style={{ flex: 1, padding: 6 }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          type="password"
          style={{ flex: 1, padding: 6 }}
        />
        <button onClick={signIn} disabled={loading}>
          Sign in
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        <button onClick={newThread} disabled={loading}>
          New thread
        </button>
        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <div>projectId: {projectId ?? "(null: server will create/use Default Project)"}</div>
          <div>conversationId: {conversationId ?? "(null: next send creates new conversation)"}</div>
        </div>
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
