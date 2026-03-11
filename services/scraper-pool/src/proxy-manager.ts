import { InfisicalSDK } from "@infisical/sdk";
import type { Redis } from "ioredis";

interface ProxyEntry {
  url: string;
  failures: number;
  burned: boolean;
}

const MAX_CONSECUTIVE_FAILURES = 5;
const STICKY_TTL_SECONDS = 3600; // 1 hour
const REFRESH_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export class ProxyManager {
  private redis: Redis;
  private proxies: ProxyEntry[] = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private infisicalClient: InfisicalSDK | null = null;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Initialize proxies — from Infisical if configured, otherwise from env var.
   * When using Infisical, sets up periodic refresh (fetch-use-discard pattern).
   */
  async initProxies(): Promise<void> {
    const projectId = process.env.INFISICAL_PROJECT_ID;

    if (projectId) {
      await this.loadFromInfisical();
      this.refreshTimer = setInterval(() => {
        void this.loadFromInfisical();
      }, REFRESH_INTERVAL_MS);
      console.log("[ProxyManager] Infisical refresh scheduled every 30m");
    } else {
      this.loadFromEnv();
    }
  }

  /**
   * Fetch proxy list from Infisical (fetch-use-discard pattern).
   * Re-fetches fresh each call — never caches the SDK secret values.
   */
  private async loadFromInfisical(): Promise<void> {
    const projectId = process.env.INFISICAL_PROJECT_ID!;
    const environment = process.env.INFISICAL_ENV ?? "production";
    const secretPath = process.env.INFISICAL_PROXY_SECRET_PATH ?? "/proxies";
    const secretName = process.env.INFISICAL_PROXY_SECRET_NAME ?? "PROXY_RESIDENTIAL_ENDPOINT";

    try {
      const sdk = await this.getInfisicalClient();
      const secret = await sdk.secrets().getSecret({
        projectId,
        environment,
        secretPath,
        secretName,
      });

      const value = secret.secretValue;
      if (!value) {
        console.warn("[ProxyManager] Infisical secret is empty, keeping existing proxies");
        return;
      }

      const urls = value.split(",").map((u) => u.trim()).filter(Boolean);

      // Preserve failure/burned state for proxies that still exist
      const existingByUrl = new Map(this.proxies.map((p) => [p.url, p]));
      this.proxies = urls.map((url) => {
        const existing = existingByUrl.get(url);
        return existing ?? { url, failures: 0, burned: false };
      });

      console.log(`[ProxyManager] loaded ${this.proxies.length} proxies from Infisical`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ProxyManager] Infisical fetch failed: ${msg}`);

      // On first load with no proxies, fall back to env var
      if (this.proxies.length === 0) {
        console.warn("[ProxyManager] falling back to PROXY_RESIDENTIAL_ENDPOINT env var");
        this.loadFromEnv();
      }
    }
  }

  private async getInfisicalClient(): Promise<InfisicalSDK> {
    if (this.infisicalClient) return this.infisicalClient;

    this.infisicalClient = new InfisicalSDK({
      siteUrl: process.env.INFISICAL_SITE_URL ?? "http://localhost:8080",
    });

    await this.infisicalClient.auth().universalAuth.login({
      clientId: process.env.INFISICAL_CLIENT_ID!,
      clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
    });

    return this.infisicalClient;
  }

  /**
   * Load proxy list from environment variable (local dev fallback).
   * Format: comma-separated proxy URLs.
   */
  loadFromEnv(): void {
    const endpoint = process.env.PROXY_RESIDENTIAL_ENDPOINT;
    if (!endpoint) {
      console.warn("[ProxyManager] no PROXY_RESIDENTIAL_ENDPOINT set");
      return;
    }

    // Support comma-separated list or single rotating endpoint
    const urls = endpoint.split(",").map((u) => u.trim()).filter(Boolean);
    this.proxies = urls.map((url) => ({ url, failures: 0, burned: false }));
    console.log(`[ProxyManager] loaded ${this.proxies.length} proxies from env`);
  }

  loadFromList(urls: string[]): void {
    this.proxies = urls.map((url) => ({ url, failures: 0, burned: false }));
  }

  /**
   * Get a proxy for a domain. Uses sticky assignment if one exists.
   * Falls back to round-robin from healthy proxies.
   */
  async getProxy(domain: string): Promise<string | null> {
    if (this.proxies.length === 0) return null;

    const stickyKey = `scraper:proxy:sticky:${domain}`;

    // Check sticky assignment
    const sticky = await this.redis.get(stickyKey);
    if (sticky) {
      const entry = this.proxies.find((p) => p.url === sticky && !p.burned);
      if (entry) return entry.url;
    }

    // Pick from healthy proxies
    const healthy = this.proxies.filter((p) => !p.burned);
    if (healthy.length === 0) {
      console.error("[ProxyManager] all proxies burned");
      return null;
    }

    const picked = healthy[Math.floor(Math.random() * healthy.length)];

    // Set sticky assignment
    await this.redis.set(stickyKey, picked.url, "EX", STICKY_TTL_SECONDS);

    return picked.url;
  }

  /**
   * Report success for a proxy — resets failure counter.
   */
  reportSuccess(proxyUrl: string): void {
    const entry = this.proxies.find((p) => p.url === proxyUrl);
    if (entry) entry.failures = 0;
  }

  /**
   * Report failure for a proxy — increments counter, burns after threshold.
   */
  reportFailure(proxyUrl: string): void {
    const entry = this.proxies.find((p) => p.url === proxyUrl);
    if (!entry) return;

    entry.failures++;
    if (entry.failures >= MAX_CONSECUTIVE_FAILURES) {
      entry.burned = true;
      console.warn(`[ProxyManager] proxy burned: ${proxyUrl}`);
    }
  }

  /**
   * Stop the periodic refresh timer.
   */
  stopRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  get healthyCount(): number {
    return this.proxies.filter((p) => !p.burned).length;
  }

  get totalCount(): number {
    return this.proxies.length;
  }
}
