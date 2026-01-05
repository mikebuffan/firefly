import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseFromAuthHeader } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MemoryService } from "@/lib/memory/memoryService";
import { toMemValue } from "@/lib/memory/value";

const Body = z.object({
  correctionKey: z.string().min(3),
  correctedValue: z.any(),
  projectId: z.string().uuid().nullable().optional(),
  // accepted for backward compat
  scope: z.any().optional(),
  conversationId: z.any().optional(),
});

export async function POST(req: Request) {
  const supabase = supabaseFromAuthHeader(req);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
  }

  const userId = data.user.id;
  const projectId = parsed.data.projectId ?? null;

  const memKey = parsed.data.correctionKey.trim();
  const memValue = toMemValue(parsed.data.correctedValue);

  const op = {
    op: "CORRECT" as const,
    mem_key: memKey,
    mem_value: memValue,
    display_text: memKey,
    trigger_terms: [],
    emotional_weight: "neutral" as const,
    relational_context: [],
    reveal_policy: "normal" as const,
    confidence: 1,
  };

  const admin = supabaseAdmin();
  const svc = new MemoryService({
    supabase,
    admin,
    userId,
    projectId,
  });

  return NextResponse.json({ ok: true, svc });
}
