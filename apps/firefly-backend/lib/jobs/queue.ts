import { supabaseAdmin } from "@/lib/supabase/admin";

const JOB_TABLE = "job_queue";

export async function enqueueJob(jobName: string, payload: Record<string, any>) {
  const client = supabaseAdmin();
  const { error } = await client.from(JOB_TABLE).insert({
    job_name: jobName,
    payload,
    status: "queued",
  });
  if (error) throw error;
}

export async function claimNextJob(workerId: string) {
  const client = supabaseAdmin();

  const { data, error } = await client
    .from(JOB_TABLE)
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { error: updateError } = await client
    .from(JOB_TABLE)
    .update({ status: "running", worker_id: workerId, started_at: new Date().toISOString() })
    .eq("id", data.id);

  if (updateError) throw updateError;
  return data;
}

export async function completeJob(jobId: string, success = true, message?: string) {
  const client = supabaseAdmin();
  const { error } = await client
    .from(JOB_TABLE)
    .update({
      status: success ? "completed" : "failed",
      result_message: message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw error;
}
