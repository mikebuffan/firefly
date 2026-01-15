import { cookies } from "next/headers";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export async function getServerSupabase(): Promise<SupabaseClient> {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const store = await cookies();
  const token = store.get("sb-access-token")?.value;

  client = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });

  return client;
}

// Reliable retry wrapper
export async function supabaseRetry<T>(
  fn: () => Promise<T>,
  retries = 3
): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === retries - 1) throw err;
      if (err?.status >= 500 || err?.code === "PGRST000") {
        console.warn(`[SupabaseRetry] ${i + 1}/${retries} retrying after error:`, err.message);
        await new Promise((r) => setTimeout(r, 200 * i));
      }
    }
  }
  throw new Error("Supabase retry failed after multiple attempts");
}

// Optional telemetry for development
export function logSupabaseEvent(eventType: string, payload: any) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[Supabase:${eventType}]`, payload);
  }
}
