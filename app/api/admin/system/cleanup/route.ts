import { NextResponse } from "next/server";
import { cleanupJobs } from "@/lib/system/cleanup";

export const runtime = "nodejs";

export async function POST() {
  const result = await cleanupJobs();
  return NextResponse.json(result);
}
