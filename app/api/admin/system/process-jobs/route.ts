import { NextResponse } from "next/server";
import { runPendingJobs } from "@/lib/system/scheduler";

export const runtime = "nodejs";

export async function POST() {
  const count = await runPendingJobs();
  return NextResponse.json({ ok: true, processed: count });
}
