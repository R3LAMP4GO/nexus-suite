import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { redis } from "@/lib/redis";

export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  // DB connectivity
  try {
    await db.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch {
    checks.db = "fail";
  }

  // Redis connectivity
  try {
    const pong = await redis.ping();
    checks.redis = pong === "PONG" ? "ok" : "fail";
  } catch {
    checks.redis = "fail";
  }

  const healthy = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks },
    { status: healthy ? 200 : 503 },
  );
}
