# Nexus Suite

AI-powered social media content automation platform. Orchestrates multi-tier AI agents to analyze trends, track competitors, generate scripts, create video variations, and distribute content across social platforms — all within a multi-tenant SaaS architecture.

## Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS
- **API**: tRPC v11
- **Database**: PostgreSQL 17 (pgvector), Prisma 7
- **Cache/Queues**: Redis 7, pg-boss, BullMQ
- **AI Agents**: Mastra (multi-tier hierarchy: orchestrator → specialists → platform agents)
- **Browser Automation**: Patchright (stealth browser)
- **Media Processing**: FFmpeg via media-engine service
- **ML**: Python sidecar (Thompson Sampling, bandits)
- **Secrets**: Infisical (fetch-use-discard pattern)
- **Storage**: Cloudflare R2
- **Email**: Resend
- **Payments**: Stripe (setup fee + subscription per tier)
- **Containerization**: Docker Compose (10 services)

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Bun (recommended) or npm

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> nexus-suite
cd nexus-suite
cp .env.example .env
# Fill in required values in .env (see "Required Services" below)

# 2. Start infrastructure
docker compose up -d db redis

# 3. Install dependencies
bun install  # or: npm install

# 4. Set up database
npx prisma generate
npx prisma migrate dev

# 5. Start dev server
bun dev  # or: npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Required External Services

Before going live, configure these in `.env`:

| Service | Env Vars | Setup |
|---------|----------|-------|
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` (×6) | Create 3 products (Pro/Multiplier/Enterprise), each with a one-time setup price + recurring subscription price |
| **Google OAuth** | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com) → OAuth consent screen + credentials |
| **Infisical** | `INFISICAL_ENCRYPTION_KEY`, `INFISICAL_AUTH_SECRET`, `INFISICAL_SITE_URL`, etc. | Self-host via Docker Compose or use Infisical Cloud. Required for storing platform OAuth tokens securely |
| **Cloudflare R2** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | [Cloudflare Dashboard](https://dash.cloudflare.com) → R2 → Create bucket |
| **Resend** | `RESEND_API_KEY`, `EMAIL_FROM` | [resend.com](https://resend.com) → API Keys |

### Platform OAuth Apps (for social connections)

Each platform requires its own OAuth app for users to connect accounts:

| Platform | Env Vars | Developer Portal |
|----------|----------|-----------------|
| YouTube | `YOUTUBE_OAUTH_CLIENT_ID/SECRET` | [Google Cloud Console](https://console.cloud.google.com) → YouTube Data API v3 |
| TikTok | `TIKTOK_CLIENT_KEY/SECRET` | [developers.tiktok.com](https://developers.tiktok.com) |
| Instagram | `INSTAGRAM_APP_ID/SECRET` | [developers.facebook.com](https://developers.facebook.com) → Instagram Graph API |
| Facebook | `FACEBOOK_APP_ID/SECRET` | [developers.facebook.com](https://developers.facebook.com) |
| LinkedIn | `LINKEDIN_CLIENT_ID/SECRET` | [developer.linkedin.com](https://developer.linkedin.com) |
| X (Twitter) | `X_CLIENT_ID/SECRET` | [developer.twitter.com](https://developer.twitter.com) |

## Docker Services

The full stack runs 10 services via `docker-compose.yml`:

| Service | Description |
|---------|-------------|
| `db` | PostgreSQL 17 with pgvector extension |
| `redis` | Redis 7 (queues, caching, rate limiting) |
| `infisical` | Secrets manager (stores platform OAuth tokens) |
| `infisical-db` | PostgreSQL instance for Infisical |
| `nexus-app` | Next.js web app (dashboard, tRPC API, SSE) |
| `nexus-worker` (×2) | pg-boss job workers + BullMQ workflow executor |
| `scraper-pool` | Patchright stealth browser pool for scraping |
| `warming-service` | Account warming / human behavior simulation |
| `media-engine` | FFmpeg video processing + variation generation |
| `ml-sidecar` | Python ML service (Thompson Sampling, bandits) |
| `scrapling-sidecar` | Python scraping sidecar |

For local dev, you typically only need `db` and `redis`:

```bash
docker compose up -d db redis
```

For monitoring (Grafana + Prometheus):

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

## Project Structure

```
src/
├── app/                    # Next.js pages & API routes
│   ├── admin/              # Admin panel (users, orgs, health)
│   ├── agents/             # Agent registry & invocation UI
│   ├── api/                # API routes (tRPC, OAuth, webhooks, metrics)
│   ├── competitors/        # Competitor tracking UI
│   ├── dashboard/          # Main dashboard (analytics, studio, upload)
│   ├── multiplier/         # Video multiplier UI
│   ├── workflows/          # Workflow builder & run viewer
│   └── settings/           # Org settings & usage
├── agents/                 # Mastra agent definitions
│   ├── general/            # General-purpose agents
│   ├── orchestrator/       # Workflow orchestrator agent
│   ├── specialists/        # 15+ specialist agents (writer, SEO, etc.)
│   ├── platforms/          # Platform-specific agents
│   └── clients/            # Per-org client plugins
├── lib/                    # Shared utilities (db, redis, metrics, etc.)
├── server/
│   ├── api/routers/        # tRPC routers (12 modules)
│   ├── auth/               # NextAuth v5 config
│   ├── services/           # Business logic (posting, R2, budget, etc.)
│   ├── worker/             # pg-boss job handlers
│   ├── workers/            # Long-running worker processes
│   └── workflows/          # YAML workflow engine (executor, validator)
└── shared/                 # Shared types (queue types, etc.)
```

## Available Scripts

```bash
bun dev                    # Start Next.js dev server
bun run build              # Production build
bun run start              # Start production server
bun run test               # Run all tests (vitest)
bun run test:coverage      # Tests with coverage report
bun run test:watch         # Watch mode

# Database
bun run db:migrate         # Run Prisma migrations
bun run db:generate        # Generate Prisma client
bun run db:push            # Push schema changes (no migration)
bun run db:studio          # Open Prisma Studio

# Admin CLI
bun run admin:provision    # Provision a new org
bun run admin:assign-proxy # Assign proxy to account
bun run admin:generate-workflows  # Generate YAML workflows
```

## Client Onboarding Flow

1. **Sign up** → Google OAuth login
2. **Choose tier** → Pro / Multiplier / Enterprise pricing page
3. **Payment** → Stripe Checkout (one-time setup fee + monthly subscription)
4. **Onboarding wizard** → 4-step form: niche & brand voice, competitors, platforms, review
5. **Provisioning** → Admin configures AI agents, proxy fleet, content pipeline
6. **Active** → Client accesses dashboard: upload videos, view scripts, track competitors, monitor analytics

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture decisions, implementation phases, and verification criteria.
