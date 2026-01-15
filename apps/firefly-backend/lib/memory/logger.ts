import { getServerSupabase } from "@/lib/supabase/server";

type LogLevel = "info" | "warn" | "error";
const buffer: any[] = [];
let flushTimeout: NodeJS.Timeout | null = null;

export async function logMemoryEvent(
  event: string,
  payload: Record<string, any>,
  level: LogLevel = "info",
  meta?: { start?: number; context?: string }
) {
  const duration = meta?.start ? `${Date.now() - meta.start}ms` : null;
  buffer.push({
    event,
    payload,
    level,
    duration,
    context: meta?.context,
    timestamp: new Date().toISOString(),
  });

  if (!flushTimeout) flushTimeout = setTimeout(flushLogs, 2000);
}

async function flushLogs() {
  if (buffer.length === 0) return;
  const supabase = await getServerSupabase();
  const logs = buffer.splice(0, buffer.length);

  try {
    await supabase.from("memory_pending").insert(
      logs.map((l) => ({
        event: l.event,
        payload: l.payload,
        level: l.level,
        duration: l.duration,
        context: l.context,
        created_at: l.timestamp,
      }))
    );
  } catch (e) {
    console.error("Failed to flush memory logs", e);
  } finally {
    flushTimeout = null;
  }
}
