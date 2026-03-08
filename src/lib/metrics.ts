import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379/0");

const PREFIX = "metrics:";

// ── Counters ─────────────────────────────────────────────────

/**
 * Increment a counter metric.
 * Stored as Redis key: metrics:counter:{name}:{label1=val1,label2=val2}
 */
export async function incCounter(
  name: string,
  labels: Record<string, string>,
  delta = 1,
): Promise<void> {
  const key = `${PREFIX}counter:${name}:${serializeLabels(labels)}`;
  await redis.incrby(key, delta);
}

/**
 * Read all values for a given counter name.
 * Returns array of { labels, value }.
 */
export async function getCounter(
  name: string,
): Promise<{ labels: Record<string, string>; value: number }[]> {
  const pattern = `${PREFIX}counter:${name}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return [];

  const values = await redis.mget(...keys);
  return keys.map((k, i) => ({
    labels: deserializeLabels(k.slice(`${PREFIX}counter:${name}:`.length)),
    value: Number(values[i] ?? 0),
  }));
}

// ── Histograms ───────────────────────────────────────────────

const DEFAULT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60];

/**
 * Record a histogram observation.
 * Uses a Redis hash per metric+labels: field = bucket boundary, value = count.
 * Also tracks _sum and _count.
 */
export async function observeHistogram(
  name: string,
  labels: Record<string, string>,
  value: number,
  buckets: number[] = DEFAULT_BUCKETS,
): Promise<void> {
  const key = `${PREFIX}histogram:${name}:${serializeLabels(labels)}`;
  const pipeline = redis.pipeline();

  for (const b of buckets) {
    if (value <= b) {
      pipeline.hincrby(key, `le:${b}`, 1);
    }
  }
  // +Inf bucket always incremented
  pipeline.hincrby(key, "le:+Inf", 1);
  pipeline.hincrby(key, "_count", 1);
  pipeline.hincrbyfloat(key, "_sum", value);

  await pipeline.exec();
}

/**
 * Read all histogram data for a given metric name.
 */
export async function getHistogram(
  name: string,
): Promise<{ labels: Record<string, string>; buckets: Record<string, number>; count: number; sum: number }[]> {
  const pattern = `${PREFIX}histogram:${name}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return [];

  const results = [];
  for (const k of keys) {
    const hash = await redis.hgetall(k);
    const labelStr = k.slice(`${PREFIX}histogram:${name}:`.length);
    const buckets: Record<string, number> = {};
    let count = 0;
    let sum = 0;

    for (const [field, val] of Object.entries(hash)) {
      if (field === "_count") count = Number(val);
      else if (field === "_sum") sum = Number(val);
      else buckets[field] = Number(val);
    }

    results.push({ labels: deserializeLabels(labelStr), buckets, count, sum });
  }

  return results;
}

// ── Helpers ──────────────────────────────────────────────────

function serializeLabels(labels: Record<string, string>): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
}

function deserializeLabels(s: string): Record<string, string> {
  if (!s) return {};
  const labels: Record<string, string> = {};
  for (const pair of s.split(",")) {
    const eq = pair.indexOf("=");
    if (eq > 0) {
      labels[pair.slice(0, eq)] = pair.slice(eq + 1);
    }
  }
  return labels;
}
