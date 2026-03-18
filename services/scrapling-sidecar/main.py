from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
import redis.asyncio as aioredis
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from scrapling.fetchers import Fetcher, StealthyFetcher

# ── globals ──────────────────────────────────────────────────────────
redis_client: aioredis.Redis | None = None

BLOCK_SIGNALS = {403, 429, 503}
CAPTCHA_MARKERS = ["captcha", "cf-challenge", "hcaptcha", "recaptcha", "challenge-platform"]


# ── lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    global redis_client

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)

    yield

    if redis_client:
        await redis_client.aclose()


# ── app ──────────────────────────────────────────────────────────────
app = FastAPI(title="Scrapling Sidecar", lifespan=lifespan)


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": type(exc).__name__, "detail": str(exc)},
    )


# ── health ───────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    checks: dict[str, Any] = {}
    try:
        await redis_client.ping()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {e}"

    status = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"
    code = 200 if status == "healthy" else 503
    return JSONResponse(status_code=code, content={"status": status, **checks})


# ── helpers ──────────────────────────────────────────────────────────
def _is_blocked(status_code: int, body: str) -> bool:
    if status_code in BLOCK_SIGNALS:
        return True
    if not body or len(body.strip()) < 100:
        return True
    body_lower = body.lower()
    return any(marker in body_lower for marker in CAPTCHA_MARKERS)


def _proxy_url() -> str | None:
    endpoint = os.environ.get("PROXY_RESIDENTIAL_ENDPOINT")
    return endpoint if endpoint else None


# ── 3-tier fetcher ───────────────────────────────────────────────────
async def _fetch_tiered(url: str, proxy: str | None = None) -> dict[str, Any]:
    effective_proxy = proxy or _proxy_url()

    # Tier 1: plain httpx fetch
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            kwargs: dict[str, Any] = {}
            if effective_proxy:
                kwargs["proxy"] = effective_proxy
            resp = await client.get(url, **kwargs)
            body = resp.text
            elapsed = (time.monotonic() - start) * 1000
            if not _is_blocked(resp.status_code, body):
                return {"html": body, "tier_used": 1, "status_code": resp.status_code, "elapsed_ms": round(elapsed, 1)}
    except Exception:
        pass

    # Tier 2: Scrapling stealth mode
    start = time.monotonic()
    try:
        page = StealthyFetcher.fetch(url, headless=True)
        body = page.html_content
        elapsed = (time.monotonic() - start) * 1000
        status = page.status if hasattr(page, "status") else 200
        if not _is_blocked(status, body):
            return {"html": body, "tier_used": 2, "status_code": status, "elapsed_ms": round(elapsed, 1)}
    except Exception:
        pass

    # Tier 3: full browser via Scrapling Fetcher
    start = time.monotonic()
    try:
        page = Fetcher.get(url)
        body = page.html_content
        elapsed = (time.monotonic() - start) * 1000
        status = page.status if hasattr(page, "status") else 200
        return {"html": body, "tier_used": 3, "status_code": status, "elapsed_ms": round(elapsed, 1)}
    except Exception as exc:
        elapsed = (time.monotonic() - start) * 1000
        return {"html": "", "tier_used": 3, "status_code": 0, "elapsed_ms": round(elapsed, 1), "error": str(exc)}


# ── POST /scrape ─────────────────────────────────────────────────────
class ScrapeRequest(BaseModel):
    url: str
    proxy: str | None = None
    extract_rules: dict[str, Any] | None = None


@app.post("/scrape")
async def scrape(req: ScrapeRequest):
    result = await _fetch_tiered(req.url, req.proxy)
    return result


# ── platform selectors ───────────────────────────────────────────────
PROFILE_SELECTORS: dict[str, dict[str, str]] = {
    "youtube": {
        "username": "#channel-handle",
        "display_name": "#channel-name",
        "bio": "#description",
        "follower_count": "#subscriber-count",
        "avatar_url": "#avatar img",
    },
    "tiktok": {
        "username": "[data-e2e='user-subtitle']",
        "display_name": "[data-e2e='user-title']",
        "bio": "[data-e2e='user-bio']",
        "follower_count": "[data-e2e='followers-count']",
        "following_count": "[data-e2e='following-count']",
        "avatar_url": "[data-e2e='user-avatar'] img",
    },
    "instagram": {
        "username": "header h2",
        "display_name": "header h1",
        "bio": "header section > div.-vDIg span",
        "follower_count": "header ul li:nth-child(2) span",
        "avatar_url": "header img",
    },
    "twitter": {
        "username": "[data-testid='UserName'] div span",
        "display_name": "[data-testid='UserName'] span span",
        "bio": "[data-testid='UserDescription']",
        "follower_count": "a[href$='/followers'] span span",
        "following_count": "a[href$='/following'] span span",
        "avatar_url": "[data-testid='UserAvatar'] img",
    },
    "facebook": {
        "username": "meta[property='al:android:url']",
        "display_name": "meta[property='og:title']",
        "bio": "meta[property='og:description']",
        "follower_count": "[data-pagelet='ProfileTilesFeed_0'] span, a[href*='/followers'] span",
        "avatar_url": "[data-pagelet='ProfilePhoto'] img, image[preserveAspectRatio]",
    },
    # NOTE: LinkedIn is extremely aggressive with anti-scraping (IP bans, CAPTCHAs,
    # auth walls). Public/guest pages serve limited SSR HTML for SEO. The stealth
    # browser (tier 2/3) is almost always required. These selectors target the
    # public/guest view; logged-in DOM uses completely different class names.
    "linkedin": {
        "username": "meta[property='al:android:url'], link[rel='canonical']",
        "display_name": "h1.top-card-layout__title, h1.text-heading-xlarge",
        "bio": ".top-card-layout__headline, .top-card__subline-row, meta[property='og:description']",
        "follower_count": ".top-card-layout__first-subline .top-card-layout__entity-info-container span, .org-top-card-summary-info-list__info-item",
        "avatar_url": ".top-card-layout__card img, .top-card__profile-image, img.evi-image",
    },
}

POST_SELECTORS: dict[str, dict[str, str]] = {
    "youtube": {
        "container": "ytd-rich-item-renderer",
        "title": "#video-title",
        "url": "#video-title-link",
        "thumbnail": "img#img",
        "views": "#metadata-line span:first-child",
        "published_at": "#metadata-line span:nth-child(2)",
    },
    "tiktok": {
        "container": "[data-e2e='user-post-item']",
        "title": "[data-e2e='user-post-item-desc']",
        "url": "a",
        "thumbnail": "img",
        "views": "[data-e2e='video-views']",
    },
    "instagram": {
        "container": "article div div div div a",
        "url": "a",
        "thumbnail": "img",
    },
    "twitter": {
        "container": "[data-testid='tweet']",
        "title": "[data-testid='tweetText']",
        "url": "a[href*='/status/']",
        "likes": "[data-testid='like'] span",
        "comments": "[data-testid='reply'] span",
    },
    "facebook": {
        "container": "[role='article'], [data-pagelet*='FeedUnit']",
        "title": "[data-ad-preview='message'], [data-ad-comet-preview='message']",
        "url": "a[href*='/posts/'], a[href*='permalink'], a[href*='/photos/']",
        "thumbnail": "img[src*='scontent'], img[data-visualcompletion='media-vc-image']",
        "likes": "[aria-label*='Like'] span, [data-testid='UFI2ReactionsCount/sent498_icon']",
        "comments": "a[href*='comment_id'] span, [aria-label*='comment']",
    },
    # NOTE: LinkedIn post feeds are almost never available without authentication.
    # The stealth browser (tier 2/3) is required. These selectors target the
    # logged-in / stealth-rendered DOM for company and personal activity feeds.
    "linkedin": {
        "container": "div.feed-shared-update-v2, div.occludable-update, [data-urn*='urn:li:activity:']",
        "title": ".feed-shared-update-v2__description, .update-components-text, .feed-shared-text__text, .break-words",
        "url": "a[href*='/feed/update/'], a[href*='/posts/'], a[data-tracking-control-name*='update']",
        "thumbnail": ".feed-shared-image__image, .update-components-image img, .feed-shared-article__image img",
        "likes": ".social-details-social-counts__reactions-count, [data-test-id='social-actions__reaction-count']",
        "comments": ".social-details-social-counts__comments, [data-test-id='social-actions__comments']",
    },
}


def _extract_text(page: Any, selector: str) -> str | None:
    try:
        el = page.css_first(selector)
        return el.text() if el else None
    except Exception:
        return None


def _extract_attr(page: Any, selector: str, attr: str) -> str | None:
    try:
        el = page.css_first(selector)
        return el.attributes.get(attr) if el else None
    except Exception:
        return None


# ── POST /scrape/profile ─────────────────────────────────────────────
class ProfileRequest(BaseModel):
    url: str
    platform: str
    proxy: str | None = None


@app.post("/scrape/profile")
async def scrape_profile(req: ProfileRequest):
    fetch_result = await _fetch_tiered(req.url, req.proxy)
    html = fetch_result.get("html", "")
    tier_used = fetch_result.get("tier_used", 0)

    if not html:
        return JSONResponse(status_code=502, content={"error": "fetch_failed", "detail": "Could not fetch page."})

    from scrapling.parser import Selector
    page = Selector(html, url=req.url)

    selectors = PROFILE_SELECTORS.get(req.platform, {})
    profile: dict[str, str | None] = {}
    for field, sel in selectors.items():
        if field.endswith("_url"):
            profile[field] = _extract_attr(page, sel, "src")
        elif sel.startswith("meta["):
            profile[field] = _extract_attr(page, sel, "content")
        else:
            profile[field] = _extract_text(page, sel)

    return {"profile": profile, "tier_used": tier_used}


# ── POST /scrape/posts ──────────────────────────────────────────────
class PostsRequest(BaseModel):
    url: str
    platform: str
    limit: int = Field(default=10, ge=1, le=100)
    proxy: str | None = None


@app.post("/scrape/posts")
async def scrape_posts(req: PostsRequest):
    fetch_result = await _fetch_tiered(req.url, req.proxy)
    html = fetch_result.get("html", "")
    tier_used = fetch_result.get("tier_used", 0)

    if not html:
        return JSONResponse(status_code=502, content={"error": "fetch_failed", "detail": "Could not fetch page."})

    from scrapling.parser import Selector
    page = Selector(html, url=req.url)

    selectors = POST_SELECTORS.get(req.platform, {})
    container_sel = selectors.get("container", "article")

    try:
        containers = page.css(container_sel)
    except Exception:
        containers = []

    posts: list[dict[str, Any]] = []
    for card in containers[: req.limit]:
        post: dict[str, Any] = {}
        for field, sel in selectors.items():
            if field == "container":
                continue
            if field in ("url",):
                post[field] = _extract_attr(card, sel, "href")
            elif field in ("thumbnail",):
                post[field] = _extract_attr(card, sel, "src")
            else:
                post[field] = _extract_text(card, sel)
        posts.append(post)

    return {"posts": posts, "count": len(posts), "tier_used": tier_used}
