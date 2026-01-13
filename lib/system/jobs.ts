import { supabaseAdmin } from "@/lib/supabase/admin";
import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode } from "@opentelemetry/api";

const MAX_RETRIES = 3;

/**
 * Queue a new background job
 */
export async function enqueueJob(type: string, payload: any = {}) {
  const client = supabaseAdmin();

  const { error } = await client.from("system_jobs").insert({
    type,
    payload,
    status: "pending",
    retry_count: 0,
    created_at: new Date().toISOString(),
  });

  if (error) {
    Sentry.captureException(error, { tags: { job_type: type } });
    throw error;
  }

  return true;
}

/**
 * Execute an individual job with retry and backoff
 */
export async function handleJob(job: any) {
  const client = supabaseAdmin();

  await Sentry.startSpan(
    {
      op: "system.job",
      name: `Run job: ${job.type}`,
      attributes: { jobId: job.id, jobType: job.type },
    },
    async (span) => {
      try {
        // Mark as running
        await client
          .from("system_jobs")
          .update({ status: "running", started_at: new Date().toISOString() })
          .eq("id", job.id);

        // Dispatch job types
        switch (job.type) {
          case "reflection": {
            const { runReflectionJob } = await import("@/lib/tasks/reflection");
            await runReflectionJob(job.payload.authedUserId, job.payload.projectId);
            break;
          }

          case "decay": {
            const { runMemoryDecay } = await import("@/lib/tasks/decay");
            await runMemoryDecay(job.payload.authedUserId);
            break;
          }

          default:
            console.warn("[system_jobs] Unknown job type:", job.type);
            break;
        }

        // Mark success
        await client
          .from("system_jobs")
          .update({
            status: "completed",
            completed_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        span?.setStatus({ code: SpanStatusCode.OK });
      } catch (err: any) {
        console.error("[system_jobs] job failed", job.id, err);

        const retries = (job.retry_count ?? 0) + 1;
        const shouldRetry = retries <= MAX_RETRIES;
        const nextRun = new Date(Date.now() + Math.pow(2, retries) * 60000).toISOString();

        await client
          .from("system_jobs")
          .update({
            status: shouldRetry ? "pending" : "failed",
            retry_count: retries,
            next_run_at: shouldRetry ? nextRun : null,
            last_error: err?.message ?? "Unknown error",
            completed_at: shouldRetry ? null : new Date().toISOString(),
          })
          .eq("id", job.id);

        Sentry.captureException(err, {
          tags: { job_type: job.type, job_id: job.id },
          extra: { retry_count: retries, next_run_at: nextRun },
        });

        span?.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
      } finally {
        span?.end?.();
      }
    }
  );
}
