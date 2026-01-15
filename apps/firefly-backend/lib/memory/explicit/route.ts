import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/requireUser";
import { upsertMemoryItems } from "@/lib/memory/store";

const Item = z.object({
  key: z.string().min(3),
  value: z.record(z.string(),z.any()),
  tier: z.enum(["core", "normal", "sensitive"]),
  user_trigger_only: z.boolean().default(false),
  importance: z.number().int().min(1).max(10).default(8),
  confidence: z.number().min(0).max(1).default(0.95),
});

const Body = z.object({
  items: z.array(Item).max(25),
});

export async function POST(req: Request) {
  const { userId: authedUserId } = await requireUser(req);

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });

  const { items } = parsed.data;
  const res = await upsertMemoryItems(authedUserId, items);
  return NextResponse.json({ ok: true, res });
}
