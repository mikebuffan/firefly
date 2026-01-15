import { runMemoryDecay } from "@/lib/tasks/decay";
import { runReflectionJob } from "@/lib/tasks/reflection";
import { runMemorySync } from "@/lib/tasks/sync";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logMemoryEvent } from "@/lib/memory/logger";

const LOCK_TABLE = "system_locks";
const LOOP_INTERVAL_MS = 1000 * 60 * 10; // every 10 minutes

export async function fireflyHeartbeat() {
  const client = supabaseAdmin();
  const lockKey = "firefly_heartbeat";
  const now = new Date().toISOString();

  // Acquire distributed lock
  const { data: existing } = await client
    .from(LOCK_TABLE)
    .select("updated_at")
    .eq("key", lockKey)
    .maybeSingle();

  if (existing) {
    const last = new Date(existing.updated_at).getTime();
    const age = Date.now() - last;
    if (age < LOOP_INTERVAL_MS / 2) {
      console.log("[firefly-loop] Skipping: active lock.");
      return;
    }
  }

  await client
    .from(LOCK_TABLE)
    .upsert({ key: lockKey, updated_at: now })
    .eq("key", lockKey);

  try {
    console.log("[firefly-loop] 🫀 Heartbeat tick...");

    // 1️ Decay all user memories (optimize with user list later)
    const { data: users } = await client.from("users").select("id");
    for (const u of users ?? []) {
      await runMemoryDecay(u.id);
      await runReflectionJob(u.id, null);
    }

    // 2️ Sync projects
    const { data: projects } = await client.from("projects").select("id");
    for (const p of projects ?? []) {
      await runMemorySync(p.id);
    }

    await logMemoryEvent("system_heartbeat", {
      users: users?.length ?? 0,
      projects: projects?.length ?? 0,
      timestamp: now,
    });

    console.log("[firefly-loop] ✅ Heartbeat complete");
  } catch (err: any) {
    console.error("[firefly-loop] ❌ Error during loop:", err);
    await logMemoryEvent("system_heartbeat_error", { error: err.message });
  }
}
