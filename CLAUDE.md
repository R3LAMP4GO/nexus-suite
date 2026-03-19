# Nexus Suite

AI-powered social media content automation platform. Orchestrates multi-tier AI agents (Mastra) to analyze trends, generate scripts, produce videos, and publish across YouTube, TikTok, Instagram, Facebook, LinkedIn, and X. Multi-tenant SaaS for content creators and marketing teams.

## Architecture
Full plan in `@ARCHITECTURE.md` — all decisions (1-10), implementation phases, verification criteria.

## Stack
- Next.js 16 + tRPC 11 + Prisma 7 + PostgreSQL (pgvector) + Redis 7
- Mastra agents (multi-tier hierarchy)
- Docker Compose (10 services)
- Infisical (secrets), Cloudflare R2 (storage)
- Patchright (stealth browser), FFmpeg (media processing)
- pg-boss (job queues), BullMQ (specialized workers)
- Vitest (unit tests), Playwright (e2e), Sentry (monitoring)

## Project Structure
```
src/
├── agents/              AI agent logic (clients, orchestrator, specialists, platforms)
├── app/                 Next.js App Router (dashboard, admin, settings, workflows, api/)
├── cli/                 CLI tools & commands
├── components/ui/       React UI / shared design system
├── generated/           Prisma generated client (do not edit)
├── lib/                 Shared utilities & helpers
├── server/
│   ├── api/             tRPC router layer
│   ├── auth/            Authentication (next-auth)
│   ├── modules/         Domain business logic
│   ├── services/        Core backend services & queue types
│   ├── worker/          Background job workers
│   └── workflows/       Workflow engine
├── shared/              Cross-cutting shared code
└── test/                Test helpers & fixtures
services/                Standalone microservices (media-engine, ml-sidecar, scraper-pool)
prisma/                  DB schema & migrations
e2e/                     Playwright end-to-end tests
scripts/                 Utility & ops scripts
monitoring/              Grafana dashboards & provisioning
```

## Conventions
- Onion architecture: domain → repos → services → modules → api → app
- Multi-tenant: ALL content tables have `organizationId`
- Secrets: DB stores Infisical Secret IDs only, fetch-use-discard pattern
- Agent data minimization: `prepareContext()` strips input before agent calls
- Client plugins: `src/agents/clients/{org_id}/` — no direct Infisical access

## Organization Rules
- One component per file, single responsibility
- Co-locate tests next to source (`*.test.ts` beside `*.ts`)
- No dead code, no commented-out code — delete what's unused
- Types/interfaces defined before implementation
- New files follow existing naming conventions (kebab-case files, PascalCase components)

## Commands
- `docker compose up -d` — start all 10 services
- `docker compose up -d db redis` — start infra only
- `bunx prisma migrate dev` — run migrations
- `bunx prisma generate` — generate client
- `bun run dev` — start Next.js dev server
- `bun run build` — production build

## Quality Checks (zero-tolerance)
```bash
bunx eslint .                   # lint — must pass with 0 errors
bunx tsc --noEmit               # typecheck — must pass with 0 errors
bunx vitest run                 # unit tests — must pass
bunx playwright test            # e2e tests — must pass
```
Run all before committing. CI will reject failures.

## Current Phase
**Phase:** active development

## Wiring Notes
- All new workers/handlers MUST call `checkLlmBudget()` before agent execution
- All posting paths MUST call `canPost()` before `postContent()`
- New agents MUST be added to `bootstrapAgents()` in `src/agents/registry.ts`
- New queue payloads should reference canonical types in `src/server/services/queue-types.ts`
- Warming service components must be wired through executor, not called directly
- SSE events should be published from workers via `publishSSE()` for dashboard updates
- Always use `publishSSE()` for dashboard-facing events — never raw `redis.publish()` to custom channels
- Never call agent `generate()` directly — always go through `executeAgentDelegate()` for budget/safety/tracking
- When adding new agents to `bootstrapAgents()`, also add to `SPECIALIST_AGENTS` or `PLATFORM_SUBAGENTS` in `agent-delegate.ts`
- When adding new workflow action queue producers, ensure a matching consumer worker exists
- `warm:task` queue is owned exclusively by the warming service (`SERVICE_MODE=warming`) — do not add consumers in the worker process

## Shell Commands

### `speedrun` — Sequential feature pipeline
Runs issues one at a time through plan → build → validate → ship.
```bash
speedrun              # all open issues with 'auto' label
speedrun 214          # single issue
speedrun 214-220      # range
speedrun 214,216,220  # specific issues
```

### `speedrun-parallel` — Parallel feature pipeline
Runs up to 3 issues simultaneously in isolated git worktrees.
```bash
speedrunp              # all open issues with 'auto' label
speedrunp 214-220      # range
```

### `speedrun-pcheck` — Check parallel speedrun status
```bash
speedrun-pcheck
```

### `speedrun-ptail` — Tail a parallel issue log
```bash
speedrun-ptail 214
```
