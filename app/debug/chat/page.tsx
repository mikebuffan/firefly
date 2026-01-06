"use client";

import { useState } from "react";

export default function DebugChatPage() {
  const [msg, setMsg] = useState("Hello. Who are you?");
  const [reply, setReply] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function send() {
    setLoading(true);
    setReply("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json();
      setReply(JSON.stringify(json, null, 2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: "system-ui", maxWidth: 900 }}>
      <h1>Debug Chat</h1>
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
