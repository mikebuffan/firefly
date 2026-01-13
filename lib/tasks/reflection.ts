import { reflectOnMemoryCluster } from "@/lib/memory/reflection";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logMemoryEvent } from "@firefly/shared/lib/safety/postcheck";

export async function runReflectionJob(authedUserId: string, projectId: string | null) {
  const client = supabaseAdmin();
  const { data, error } = await client
    .from("memory_items")
    .select("mem_key")
    .eq("user_id", authedUserId)
    .order("updated_at", { ascending: false })
    .limit(10);

  if (error) throw error;

  const keys = data?.map(d => d.mem_key) ?? [];
  if (!keys.length) return;

  const result = await reflectOnMemoryCluster(authedUserId, projectId, keys);
  await logMemoryEvent("reflection_job_complete", { authedUserId, summary: result?.summary });
}
