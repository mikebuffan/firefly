import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runMemoryDecay } from "@/lib/tasks/decay";
import { runReflectionJob } from "@/lib/tasks/reflection";
import { enqueueJob } from "@/lib/system/jobs"; 
import { runPendingJobs } from "@/lib/system/scheduler";
import { cleanupJobs } from "@/lib/system/cleanup";

export const runtime = "nodejs";

export async function POST() {
  const admin = supabaseAdmin();
  const lockName = "daily_heartbeat";

  try {
    // Try to acquire system lock
    const { data: existingLock } = await admin
      .from("system_locks")
      .select("*")
      .eq("name", lockName)
      .eq("is_active", true)
      .maybeSingle();

    if (existingLock) {
      console.warn("[heartbeat] skipped: lock active");
      return NextResponse.json({ ok: false, message: "heartbeat already running" });
    }

    // Create lock
    await admin.from("system_locks").insert({
      name: lockName,
      is_active: true,
      locked_at: new Date().toISOString(),
    });

    const { data: users, error: userErr } = await admin
      .from("users")
      .select("id, project_id")
      .order("created_at", { ascending: true });

    if (userErr) throw userErr;

    const chunkSize = 100;
    let processed = 0;
    const totalUsers = users?.length ?? 0;
    const startTime = Date.now();

    // Process users in chunks
    for (let i = 0; i < totalUsers; i += chunkSize) {
      const batch = users.slice(i, i + chunkSize);

      for (const u of batch) {
        await enqueueJob("decay", { userId: u.id });
        await enqueueJob("reflection", { userId: u.id, projectId: u.project_id });
      }

      await new Promise((r) => setTimeout(r, 500));
      // Optional small delay between batches to reduce load
      await new Promise((r) => setTimeout(r, 500));
    }

    await runPendingJobs();
    await cleanupJobs();

    const durationMs = Date.now() - startTime;

    await admin.from("system_heartbeats").insert({
      status: "success",
      processed_users: processed,
      notes: `Processed ${processed}/${totalUsers} users in ${durationMs}ms`,
    });

    // Release lock
    await admin
      .from("system_locks")
      .update({ is_active: false, released_at: new Date().toISOString() })
      .eq("name", lockName);

    return NextResponse.json({
      ok: true,
      message: `Heartbeat processed ${processed} users in ${durationMs}ms.`,
    });
  } catch (err: any) {
    console.error("[heartbeat] failed", err);

    await admin.from("system_heartbeats").insert({
      status: "error",
      notes: err?.message ?? "Unknown error",
    });

    await admin
      .from("system_locks")
      .update({ is_active: false, released_at: new Date().toISOString() })
      .eq("name", lockName);

    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
