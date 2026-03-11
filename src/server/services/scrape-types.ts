/**
 * Shared types for scrape task/result payloads exchanged via pg-boss
 * between scraper-pool (producer) and consumer workers.
 */

export interface ScrapeCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface ScrapeResult {
  taskId: string;
  html: string;
  cookies: Array<ScrapeCookie>;
  meta: {
    strategy: string;
    durationMs: number;
    url: string;
    error?: string;
  };
}

export interface ScrapeTask {
  taskId: string;
  url: string;
  options?: {
    priority?: number;
    timeout?: number;
  };
}
