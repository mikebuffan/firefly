import { NextResponse } from "next/server";
import { fireflyHeartbeat } from "@/lib/system/loop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  console.log("[heartbeat] 🔔 received POST request");
  try {
    await fireflyHeartbeat();
    console.log("[heartbeat] ✅ heartbeat completed successfully");
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[heartbeat] ❌ error:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
