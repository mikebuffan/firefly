import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const COOKIE_NAME = "ff_uid";

export async function getOrCreateUserId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const userId = randomUUID();
  jar.set(COOKIE_NAME, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  const admin = supabaseAdmin();
  await admin.from("app_users").insert({ id: userId });
  return userId;
}

export async function requireUserId(): Promise<string> {
  const jar = await cookies();
  const uid = jar.get(COOKIE_NAME)?.value;
  if (!uid) return getOrCreateUserId();
  return uid;
}

// optional stub (you referenced it)
export async function getUserEmail(): Promise<string | null> {
  return null;
}
