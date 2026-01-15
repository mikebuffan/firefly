import { NextResponse } from "next/server";
import { supabaseFromAuthHeader } from "@/lib/supabaseFromAuthHeader";

export const runtime = "nodejs";

async function requireUserId(req: Request) {
  const supa = supabaseFromAuthHeader(req);
  const { data, error } = await supa.auth.getUser();
  if (error || !data?.user) throw new Error("Unauthorized");
  return { supa, userId: data.user.id };
}

export async function POST(req: Request) {
  try {
    const { supa, userId } = await requireUserId(req);

    // 1) Try to fetch existing default project
    const { data: existing, error: e1 } = await supa
      .from("projects")
      .select("id, user_id, name, persona_id, framework_version, created_at, updated_at")
      .eq("user_id", userId)
      .eq("name", "Default Project")
      .maybeSingle();

    if (e1) {
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }
    if (existing) return NextResponse.json({ project: existing });

    // 2) Create default project (persona/framework pervasive)
    const { data: created, error: e2 } = await supa
      .from("projects")
      .insert({
        user_id: userId,
        name: "Default Project",
        persona_id: "arbor",
        framework_version: "v1",
      })
      .select("id, user_id, name, persona_id, framework_version, created_at, updated_at")
      .single();

    if (e2) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }

    return NextResponse.json({ project: created });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
