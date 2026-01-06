// lib/memory/applyFriendBasics.ts
import { SupabaseClient } from "@supabase/supabase-js";
import { FriendBasicsExtract } from "./friendBasicsSchema";
import { makeKey } from "./key";

const key = makeKey({ namespace: f.kind, id: f.id, field: f.field });

export async function applyFriendBasics(args: {
  supabase: SupabaseClient;
  userId: string;
  extracted: FriendBasicsExtract;
}) {
  const { supabase, userId, extracted } = args;

  for (const f of extracted.facts) {
    const { data: existing, error: selErr } = await supabase
      .from("memories")
      .select("id, user_confirmed")
      .eq("user_id", userId)
      .eq("key", f.key)
      .maybeSingle();

    if (selErr) throw selErr;

    // Respect user corrections
    if (existing?.user_confirmed) {
      // Still update last_mentioned_at so ranking stays fresh
      await supabase
        .from("memories")
        .update({ last_mentioned_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("key", f.key);
      continue;
    }

    const { error: upErr } = await supabase
      .from("memories")
      .upsert(
        {
          user_id: userId,
          key: f.key,
          kind: f.kind,
          title: f.title,
          content: f.content,
          importance: f.importance,
          confidence: f.confidence,
          source: "auto",
          last_mentioned_at: new Date().toISOString(),
        },
        { onConflict: "user_id,key" }
      );

    if (upErr) throw upErr;
  }
}
