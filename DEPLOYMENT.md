# Nexus Suite — Production Deployment Guide

## Why Not Vercel/Serverless?

This stack runs **10 specialized containers**: Patchright stealth browsers, FFmpeg video processors, Python ML sidecars, and pg-boss workers. These require persistent processes, shared memory, and GPU/CPU-intensive workloads that serverless platforms can't support.

## Server Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 16 GB | 32 GB |
| vCPUs | 4 | 8 |
| Disk | 80 GB SSD | 160 GB NVMe |
| OS | Ubuntu 22.04+ / Debian 12 | Ubuntu 24.04 |

**Recommended hosts:** Hetzner (best price/performance), DigitalOcean Droplet, AWS EC2 (c6a.2xlarge), Render.

**Storage:** Cloudflare R2 for video/media objects (zero egress fees, infinite scale). Local disk is only for Docker volumes (DB, Redis, ML models).

---

## Go-to-Market Checklist

### 1. Gather API Keys

Register your app with each platform. Add keys to `.env`:

| Service | Console URL | Env Vars |
|---------|------------|----------|
| **Google (Auth)** | [console.cloud.google.com](https://console.cloud.google.com) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| **YouTube (OAuth)** | Same Google Console → YouTube Data API v3 | `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET` |
| **TikTok** | [developers.tiktok.com](https://developers.tiktok.com) → Login Kit | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET` |
| **Instagram/Meta** | [developers.facebook.com](https://developers.facebook.com) → Instagram Graph API | `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` |
| **Stripe** | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Resend** | [resend.com/api-keys](https://resend.com/api-keys) | `RESEND_API_KEY` |
| **Cloudflare R2** | [dash.cloudflare.com](https://dash.cloudflare.com) → R2 | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |

### 2. Complete Infisical OAuth TODOs

The OAuth callback routes in `src/app/api/oauth/[platform]/callback/route.ts` currently store a placeholder `infisicalSecretPath`. When going live:

1. Import your Infisical SDK wrapper from `@/lib/infisical`
2. After token exchange, store `access_token` + `refresh_token` in Infisical
3. Save the returned secret path to `infisicalSecretPath` on the `OrgPlatformToken`
4. Never store raw tokens in Prisma — DB holds only Infisical path references

### 3. Configure OAuth Redirect URIs

Register these callback URLs in each platform's developer console:

```
YouTube:   https://app.yourdomain.com/api/oauth/youtube/callback
TikTok:    https://app.yourdomain.com/api/oauth/tiktok/callback
Instagram: https://app.yourdomain.com/api/oauth/instagram/callback
Google:    https://app.yourdomain.com/api/auth/callback/google
Stripe:    https://app.yourdomain.com/api/webhooks/stripe
```

### 4. Set Up DNS + SSL

Point your domain to the server IP. Use Caddy or nginx as a reverse proxy with automatic HTTPS:

```bash
# Example: Caddyfile
app.yourdomain.com {
    reverse_proxy localhost:3000
}

grafana.yourdomain.com {
    reverse_proxy localhost:3001
}
```

### 5. Deploy

```bash
# On the server:
git clone git@github.com:your-org/nexus-suite.git
cd nexus-suite

# Copy and configure environment
cp .env.example .env
nano .env  # Fill in all production values

# Set NEXTAUTH_URL to your production domain
# NEXTAUTH_URL=https://app.yourdomain.com

# Deploy
./scripts/deploy.sh preflight
./scripts/deploy.sh build
./scripts/deploy.sh migrate
./scripts/deploy.sh up
```

### 6. Verify

```bash
./scripts/deploy.sh status

# Check individual services
./scripts/deploy.sh logs nexus-app
./scripts/deploy.sh logs nexus-worker
```

---

## Operations

### Deploy Script Commands

```bash
./scripts/deploy.sh preflight     # Pre-deployment checks
./scripts/deploy.sh build         # Build all containers
./scripts/deploy.sh migrate       # Run Prisma migrations
./scripts/deploy.sh up            # Start everything
./scripts/deploy.sh down          # Stop everything
./scripts/deploy.sh restart       # Restart all (or specific service)
./scripts/deploy.sh logs [svc]    # Tail logs
./scripts/deploy.sh status        # Health checks
./scripts/deploy.sh backup        # PostgreSQL dump
./scripts/deploy.sh update        # git pull + rebuild + migrate + restart
```

### Updates

```bash
./scripts/deploy.sh update
# Or manually:
git pull --ff-only
./scripts/deploy.sh build
./scripts/deploy.sh migrate
./scripts/deploy.sh up
```

### Backups

```bash
# Manual backup
./scripts/deploy.sh backup
# Outputs to: backups/YYYYMMDD_HHMMSS/nexus_*.dump

# Restore
docker compose exec -T db pg_restore -U nexus -d nexus < backups/*/nexus_*.dump
```

### Monitoring

- **Prometheus:** http://localhost:9090 (or grafana.yourdomain.com)
- **Grafana:** http://localhost:3001 — pre-provisioned dashboards
- **App health:** GET `/api/health`
- **Metrics:** GET `/api/metrics` (requires `METRICS_SECRET` header)

---

## Service Architecture (Resource Map)

```
┌─────────────────────────────────────────────────────────────┐
│  VPS (16-32GB RAM, 4-8 vCPU)                                │
│                                                              │
│  nexus-app        (Next.js)         2 CPU / 4GB             │
│  nexus-worker ×2  (pg-boss)         2 CPU / 4GB each        │
│  scraper-pool     (Patchright)      4 CPU / 8GB  + 4GB shm  │
│  warming-service  (Patchright)      2 CPU / 4GB  + 2GB shm  │
│  media-engine     (FFmpeg)          4 CPU / 8GB             │
│  ml-sidecar       (Python/sklearn)  2 CPU / 4GB             │
│  scrapling-sidecar (Python)         1 CPU / 2GB             │
│  db               (pgvector/pg17)   shared                   │
│  redis            (Redis 7)         shared (512MB max)       │
│  infisical        (Secrets)         shared                   │
│  infisical-db     (Postgres)        shared                   │
│  prometheus       (Metrics)         shared                   │
│  grafana          (Dashboards)      shared                   │
│                                                              │
│  External: Cloudflare R2 (object storage)                    │
└─────────────────────────────────────────────────────────────┘
```

Total hard limits: ~38GB across all services. With overhead and shared infra, target **32GB RAM** for comfortable production or **16GB** with reduced worker replicas.

### Scaling Down for 16GB

Edit `docker-compose.yml`:
- Set `nexus-worker` replicas to 1 (saves 4GB)
- Reduce `scraper-pool` memory to 4GB and `POOL_SIZE` to 4
- Reduce `media-engine` memory to 4GB

---

## Security Checklist

- [ ] Change all default passwords in `.env` (`POSTGRES_PASSWORD`, `NEXTAUTH_SECRET`, `INFISICAL_ENCRYPTION_KEY`, etc.)
- [ ] Set `NODE_ENV=production`
- [ ] Use HTTPS (Caddy/nginx with Let's Encrypt)
- [ ] Restrict Docker port bindings (don't expose DB/Redis to 0.0.0.0 in production)
- [ ] Set up firewall: only ports 80, 443, and SSH
- [ ] Configure Grafana admin password
- [ ] Set `METRICS_SECRET` to a strong random value
- [ ] Enable Stripe webhook signature verification
- [ ] Set up automated backups (cron + `./scripts/deploy.sh backup`)
