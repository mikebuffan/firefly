import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedText } from "@/lib/memory/embeddings";

function userTriggeredSensitive(latestUserText: string) {
  const t = latestUserText.toLowerCase();
  return (
    t.includes("remember when") ||
    t.includes("remember that") ||
    t.includes("like i told you") ||
    t.includes("as i said before") ||
    t.includes("you know i have")
  );
}

export async function getMemoryContext(params: {
  authedUserId: string;
  latestUserText: string;
}) {
  const { authedUserId, latestUserText } = params;
  const queryEmbedding = await embedText(latestUserText);

  const { data: primary, error: e1 } = await supabaseAdmin.rpc("match_memory_kv_items", {
    p_user_id: authedUserId,
    p_query_embedding: queryEmbedding,
    p_match_count: 18,
    p_tiers: ["core", "normal"],
    p_include_user_trigger_only: false,
  });
  if (e1) throw e1;

  let sensitive: any[] = [];
  if (userTriggeredSensitive(latestUserText)) {
    const { data, error: e2 } = await supabaseAdmin.rpc("match_memory_kv_items", {
      p_user_id: authedUserId,
      p_query_embedding: queryEmbedding,
      p_match_count: 8,
      p_tiers: ["sensitive"],
      p_include_user_trigger_only: true,
    });
    if (e2) throw e2;
    sensitive = data ?? [];
  }

  const core = (primary ?? []).filter((m: any) => m.tier === "core");
  const normal = (primary ?? []).filter((m: any) => m.tier === "normal");

  return {
    core,
    normal,
    sensitive,
    keysUsed: [...(primary ?? []), ...sensitive].map((m: any) => m.key),
  };
}
