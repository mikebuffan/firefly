import { supabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";

/**
 * Clean up old system jobs and heartbeats.
 * Keeps the database lean and performant.
 */
export async function cleanupJobs() {
  const client = supabaseAdmin();
  const now = new Date();
  const jobCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days
  const heartbeatCutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 60 days

  try {
    const { error: jobsErr } = await client
      .from("system_jobs")
      .delete()
      .lte("completed_at", jobCutoff.toISOString());

    const { error: hbErr } = await client
      .from("system_heartbeats")
      .delete()
      .lte("created_at", heartbeatCutoff.toISOString());

    if (jobsErr || hbErr) throw jobsErr || hbErr;

    console.log(`[cleanup] Removed old jobs and heartbeats`);
    return { ok: true };
  } catch (err: any) {
    console.error("[cleanup] failed", err);
    Sentry.captureException(err, { tags: { module: "cleanup" } });
    return { ok: false, error: err.message };
  }
}
