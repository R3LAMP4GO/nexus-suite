# Comprehensive Testing Setup Plan

## Project Analysis

### Current State
- **40 test files** already exist across the project
- **Vitest 4.1** configured with `vitest.config.ts` (globals, setup, coverage via v8)
- **Playwright 1.58** configured with `playwright.config.ts` (7 e2e spec files)
- **Test helpers** exist: `src/test/setup.ts`, `src/test/helpers.ts`, `src/test/factories.ts`
- Dependencies installed: `vitest`, `vitest-mock-extended`, `@vitest/coverage-v8`, `@playwright/test`, `ioredis-mock`

### Existing Test Coverage
Already tested:
- `src/server/services/__tests__/circuit-breaker.test.ts`
- `src/server/services/__tests__/distribution-scheduler.test.ts`
- `src/server/services/__tests__/usage-tracking.test.ts`
- `src/server/services/llm-budget.test.ts`
- `src/server/workflows/control-flow.test.ts`
- `src/server/workflows/executor.test.ts`
- `src/server/workflows/interpolation.test.ts`
- `src/server/workflows/validator.test.ts`
- `src/lib/fingerprint.test.ts`
- `src/agents/__tests__/agent-smoke.test.ts`
- `src/agents/general/__tests__/prepare-context.test.ts`
- `src/agents/general/__tests__/tool-wrappers.test.ts`
- `src/server/workers/__tests__/competitor-*.test.ts`, `post-worker.test.ts`
- `src/server/services/warming/__tests__/health-tracker.test.ts`, `human-behavior.test.ts`
- Various `src/__tests__/` integration tests (10 files)
- `services/` microservice tests (media-engine, scraper-pool)
- `e2e/` Playwright specs (7 files)

### Files MISSING Tests (Critical Business Logic)

**Core Services (high priority):**
1. `src/server/services/posting.ts` — Content posting (API + browser), route by account type
2. `src/server/services/r2-storage.ts` — S3/R2 file operations
3. `src/server/services/notifications.ts` — Email notifications via Resend
4. `src/server/services/sse-broadcaster.ts` — SSE pub/sub
5. `src/server/services/hook-performance.ts` — Thompson Sampling scoring
6. `src/server/services/media-queue.ts` — pg-boss media job sender
7. `src/server/services/browser-posting.ts` — Browser automation posting
8. `src/server/services/browser-helpers.ts` — Browser session management

**Lib Utilities (high priority):**
9. `src/lib/prisma-errors.ts` — Prisma→tRPC error mapping
10. `src/lib/rate-limit.ts` — Redis rate limiter
11. `src/lib/metrics.ts` — Counter/histogram metrics
12. `src/lib/env.ts` — Environment validation
13. `src/lib/utils.ts` — Utility functions

**Agent Logic (medium priority):**
14. `src/agents/general/safety.ts` — Credential detection, PII stripping, tool scoping
15. `src/agents/general/validate-output.ts` — Agent output JSON extraction + schema validation
16. `src/agents/general/brand-loader.ts` — Brand config loading
17. `src/agents/general/output-schemas.ts` — Schema definitions

**tRPC Layer (medium priority):**
18. `src/server/api/trpc.ts` — Auth middleware, rate limit middleware, tier gates

**Workers/Handlers (medium priority):**
19. `src/server/worker/jobs/handlers/content-publish.ts` — Content publishing handler
20. `src/server/worker/jobs/handlers/workflow-run.ts` — Workflow execution handler
21. `src/server/worker/jobs/handlers/media-render.ts` — Media rendering
22. `src/server/worker/jobs/handlers/content-schedule.ts` — Content scheduling
23. `src/server/worker/jobs/handlers/webhook-dispatch.ts` — Webhook dispatch

**Middleware/Proxy (medium priority):**
24. `src/proxy.ts` — Auth proxy with rate limiting

**Other:**
25. `src/server/services/warming/session-manager.ts` — Session management
26. `src/server/services/warming/executor.ts` — Warming executor
27. `src/server/workflows/cron-scheduler.ts` — Cron scheduling

## Implementation Plan — 4 Parallel Sub-Agents

### Agent 1: Dependencies & Config Enhancement
- Update `src/test/setup.ts` to add NODE_ENV=test, mock common env vars
- Enhance `src/test/factories.ts` with factories for: `OrgPlatformToken`, `PostRecord`, `VideoVariation`, `SourceVideo`, `UsageRecord`, `BrowserProfile`, `WorkflowRun`
- Enhance `src/test/helpers.ts` with `mockPgBoss()`, `mockS3Client()`, `mockInfisical()`
- Verify vitest.config.ts coverage settings are comprehensive

### Agent 2: Unit Tests (Business Logic & Utilities)
Create tests for ALL untested pure logic files:

1. **`src/lib/prisma-errors.test.ts`** — Test all error codes (P2002, P2025, P2003, P2018, unknown), validation errors
2. **`src/lib/rate-limit.test.ts`** — Rate limiting: allowed/blocked, window expiry, presets
3. **`src/lib/metrics.test.ts`** — Counter increment, histogram observations, label serialization/deserialization
4. **`src/lib/env.test.ts`** — Required var validation, optional var warnings, auth secret fallback
5. **`src/agents/general/__tests__/safety.test.ts`** — Credential patterns (Stripe, AWS, JWT, etc), PII stripping, tool scope enforcement
6. **`src/agents/general/__tests__/validate-output.test.ts`** — JSON extraction from code blocks, raw JSON, nested braces, schema validation pass/fail, retry prompt building
7. **`src/server/services/notifications.test.ts`** — Email sending (mock Resend), HTML escaping, all email types
8. **`src/server/services/hook-performance.test.ts`** — Thompson Sampling math, beta sampling, hook score updates
9. **`src/server/workflows/workflow-schema.test.ts`** — Schema validation for all step types, triggers, edge cases

### Agent 3: Integration Tests (Services, Workers, API Layer)
Create tests for service interactions and handlers:

1. **`src/server/services/__tests__/posting.test.ts`** — postContent routing (API vs browser), finalization, mock mode, missing account/variation
2. **`src/server/services/__tests__/r2-storage.test.ts`** — Upload, download, delete, list, copy, signed URLs (mock S3Client)
3. **`src/server/services/__tests__/sse-broadcaster.test.ts`** — publishSSE, subscribeSSE stream behavior
4. **`src/server/services/__tests__/media-queue.test.ts`** — sendMediaJob with pg-boss mock
5. **`src/server/worker/jobs/handlers/__tests__/content-publish.test.ts`** — Full handler flow: resolve content, find accounts, circuit check, post
6. **`src/server/worker/jobs/handlers/__tests__/workflow-run.test.ts`** — Workflow loading, execution, error handling
7. **`src/server/api/__tests__/trpc-middleware.test.ts`** — Auth enforcement, subscription gates, onboarding gates, admin gates, rate limiting, tier gates

### Agent 4: E2E Test Enhancement
Enhance existing Playwright e2e tests and add missing critical flows:
- Review and ensure existing e2e specs are comprehensive
- Add `e2e/api-health.spec.ts` — API health check endpoint
- Add `e2e/onboarding.spec.ts` — Full onboarding flow
- Ensure all existing specs have proper assertions

## Verification Criteria
1. `bun run test` passes with 0 failures
2. `bun run test:coverage` shows coverage improvements
3. `bunx tsc --noEmit` passes (type-safe tests)
4. All new tests follow existing patterns (prismaMock, mockRedis, vi.mock)

## Post-Implementation
Create `.gg/commands/test.md` with comprehensive test runner command.
