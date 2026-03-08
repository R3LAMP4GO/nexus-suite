from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any

import numpy as np
import redis.asyncio as aioredis
import psycopg2
from psycopg2 import pool
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

# ── globals ──────────────────────────────────────────────────────────
redis_client: aioredis.Redis | None = None
db_pool: pool.SimpleConnectionPool | None = None
embed_model: SentenceTransformer | None = None


# ── lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    global redis_client, db_pool, embed_model

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)

    db_url = os.environ.get("DATABASE_URL", "")
    if db_url:
        db_pool = pool.SimpleConnectionPool(1, 5, dsn=db_url)

    embed_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

    yield

    if redis_client:
        await redis_client.aclose()
    if db_pool:
        db_pool.closeall()


# ── app ──────────────────────────────────────────────────────────────
app = FastAPI(title="ML Sidecar", lifespan=lifespan)


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

    try:
        conn = db_pool.getconn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        db_pool.putconn(conn)
        checks["db"] = "ok"
    except Exception as e:
        checks["db"] = f"error: {e}"

    status = "healthy" if all(v == "ok" for v in checks.values()) else "degraded"
    code = 200 if status == "healthy" else 503
    return JSONResponse(status_code=code, content={"status": status, **checks})


# ── embeddings ───────────────────────────────────────────────────────
class EmbeddingsRequest(BaseModel):
    texts: list[str]


@app.post("/embeddings")
async def embeddings(req: EmbeddingsRequest):
    vectors: np.ndarray = embed_model.encode(req.texts, normalize_embeddings=True)
    return {"embeddings": vectors.tolist()}
