import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/nextjs";
import { SpanStatusCode } from "@opentelemetry/api";

let _adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Supabase admin client missing environment vars");

  _adminClient = createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { "x-application-role": "admin" } },
  });

  return _adminClient;
}

export async function safeQuery<T>(
  fn: (client: ReturnType<typeof supabaseAdmin>) => Promise<T>,
  label: string,
  retries = 2
): Promise<T> {
  const client = supabaseAdmin();

  return Sentry.startSpan(
    {
      op: "db.supabase",
      name: label,
    },
    async (span) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await fn(client);
          span.setAttribute("attempt", attempt);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err: any) {
          const isLastAttempt = attempt === retries;
          const shouldRetry =
            !isLastAttempt &&
            (err?.status === 500 ||
              err?.status === 503 ||
              err?.message?.includes("fetch") ||
              err?.message?.includes("timeout"));

          console.warn(`[safeQuery:${label}] attempt ${attempt + 1} failed`, err);

          if (attempt === 0 || isLastAttempt) {
            Sentry.captureException(err, {
              tags: { query_label: label, retry_attempt: attempt },
              extra: { message: err?.message, stack: err?.stack },
            });
          }

          span.setAttribute("error_message", err?.message ?? "unknown");
          span.setAttribute("retry_attempt", attempt);

          if (shouldRetry) {
            await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
            continue;
          }

          span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
          throw err;
        }
      }

      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "exceeded retries",
      });

      throw new Error(`safeQuery:${label} failed after ${retries + 1} attempts`);
    }
  );
}
