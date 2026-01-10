import { supabaseAdmin } from "@/lib/supabase/admin";
import { handleJob } from "@/lib/system/jobs";

export async function runPendingJobs(limit = 10) {
  const client = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const { data: jobs, error } = await client
    .from("system_jobs")
    .select("*")
    .eq("status", "pending")
    .or(`next_run_at.lte.${nowIso},next_run_at.is.null`)
    .limit(limit);

  if (error) throw error;
  if (!jobs?.length) return 0;

  for (const job of jobs) {
    await handleJob(job);
    await new Promise((r) => setTimeout(r, 200)); // gentle pacing
  }

  return jobs.length;
}
