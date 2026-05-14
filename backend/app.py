"""
app.py
======
FastAPI application — the main entry point for the Housing Adviser backend.

Endpoints
---------
  GET  /                 → health ping (no auth required)
  GET  /health           → detailed health status of all sub-systems
  POST /chat             → RAG chatbot (natural-language query → answer)
  POST /recommend        → structured recommendations with optional filters
  GET  /areas            → list all known Bengaluru areas with stats
  GET  /areas/{name}     → details for a specific area
  GET  /companies        → list IT companies and their Bengaluru locations
  GET  /pollution-guide  → pollutant reference data
  POST /rebuild-index    → force-rebuild the ChromaDB vector store

Usage
-----
  cd backend
  uvicorn app:app --reload --host 0.0.0.0 --port 8000

Environment variables (optional)
---------------------------------
  GEMINI_API_KEY   → enables LLM-generated responses (falls back to rule-based if absent)
  PORT             → override default port (useful for hosting platforms)
"""

import os
import sys
import math
import time
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

# ── Ensure the backend directory is on sys.path ──────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))

from embeddings import init_vector_store, query_vector_store
from rag import run_rag_pipeline, classify_intent
from data_loader import (
    load_house_data,
    load_company_data,
    load_pollution_data,
    get_area_stats,
    AREA_POLLUTION,
    AREA_IT_HUBS,
)

# ── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("housing_adviser")


# ═══════════════════════════════════════════════════════════════════════════
# ░░  APPLICATION STARTUP / SHUTDOWN
# ═══════════════════════════════════════════════════════════════════════════

# Module-level cache so we load data only once
_startup_done = False
_area_stats_cache: list[dict] = []
_companies_cache:  list[dict] = []
_pollution_cache:  list[dict] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once at startup:
      1. Initialise ChromaDB (or load existing index).
      2. Pre-load area / company / pollution data into memory.
    """
    global _startup_done, _area_stats_cache, _companies_cache, _pollution_cache

    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  Housing Adviser Backend — Starting up")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    t0 = time.time()

    try:
        # ── 1. Vector store ───────────────────────────────────────────────
        logger.info("Initialising vector store (first run may take ~60s) …")
        init_vector_store(force_rebuild=False)
        logger.info("Vector store ready ✓")

        # ── 2. Pre-load tabular data ──────────────────────────────────────
        logger.info("Loading tabular datasets …")
        house_df          = load_house_data()
        area_df           = get_area_stats(house_df)
        _area_stats_cache = _serialise_df(area_df)

        try:
            comp_df          = load_company_data()
            _companies_cache = comp_df.to_dict("records")
        except Exception as e:
            logger.warning(f"Company data not loaded: {e}")

        try:
            poll_df          = load_pollution_data()
            _pollution_cache = poll_df.to_dict("records")
        except Exception as e:
            logger.warning(f"Pollution data not loaded: {e}")

        _startup_done = True
        logger.info(f"Startup complete in {time.time() - t0:.1f}s ✓")
        logger.info(f"  • Areas indexed : {len(_area_stats_cache)}")
        logger.info(f"  • Companies     : {len(_companies_cache)}")
        logger.info(f"  • Pollution rows: {len(_pollution_cache)}")

    except Exception as exc:
        logger.error(f"Startup FAILED: {exc}")
        # Don't crash — let health endpoint report the issue

    yield  # ── App runs here ──────────────────────────────────────────────

    logger.info("Housing Adviser Backend — Shutting down")


# ═══════════════════════════════════════════════════════════════════════════
# ░░  FASTAPI APP
# ═══════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title        = "Housing Adviser API",
    description  = "AI-powered housing recommendation system for Bengaluru using RAG.",
    version      = "1.0.0",
    lifespan     = lifespan,
    docs_url     = "/docs",
    redoc_url    = "/redoc",
)

# ── CORS: Allow all origins so the React dev server can call this API ─────────
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],     # Tighten in production
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ═══════════════════════════════════════════════════════════════════════════
# ░░  REQUEST / RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════

class ChatRequest(BaseModel):
    """Request body for the /chat endpoint."""
    query: str = Field(
        ...,
        min_length = 3,
        max_length = 500,
        description = "Natural-language housing query",
        examples   = ["Suggest affordable low pollution areas near Electronic City"],
    )
    top_k: int = Field(
        default     = 10,
        ge          = 1,
        le          = 20,
        description = "Number of chunks to retrieve from vector store",
    )
    top_n: int = Field(
        default     = 5,
        ge          = 1,
        le          = 10,
        description = "Number of area recommendations to return",
    )

    @field_validator("query")
    @classmethod
    def strip_query(cls, v: str) -> str:
        return v.strip()


class RecommendRequest(BaseModel):
    """Request body for the /recommend endpoint."""
    query: str = Field(
        default     = "Best residential areas in Bengaluru",
        max_length  = 500,
    )
    max_budget_lakhs:  float | None = Field(default=None, ge=5,   le=10000)
    min_budget_lakhs:  float | None = Field(default=None, ge=0)
    bhk:               int   | None = Field(default=None, ge=1, le=10)
    health_condition:  str   | None = Field(default=None, description="asthma | copd | allergy")
    near_area:         str   | None = Field(default=None, description="e.g. Electronic City")
    low_pollution_only: bool        = Field(default=False)
    top_n:             int          = Field(default=5, ge=1, le=10)


class RebuildRequest(BaseModel):
    confirm: bool = Field(..., description="Must be True to confirm rebuild")


# ═══════════════════════════════════════════════════════════════════════════
# ░░  HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _serialise_df(df) -> list[dict]:
    """Convert DataFrame to list of dicts, making all values JSON-safe."""
    records = df.to_dict("records")
    safe = []
    for rec in records:
        safe_rec = {}
        for k, v in rec.items():
            if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                safe_rec[k] = None
            elif hasattr(v, "item"):          # numpy scalar
                safe_rec[k] = v.item()
            elif isinstance(v, list):
                safe_rec[k] = v
            else:
                safe_rec[k] = v
        safe.append(safe_rec)
    return safe


def _safe_json(obj: Any) -> Any:
    """Recursively make an object JSON-serialisable."""
    if isinstance(obj, dict):
        return {k: _safe_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_safe_json(i) for i in obj]
    if isinstance(obj, float) and (math.isnan(obj) or math.isinf(obj)):
        return None
    if hasattr(obj, "item"):   # numpy scalar
        return obj.item()
    return obj


# ═══════════════════════════════════════════════════════════════════════════
# ░░  ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════

# ── Root ─────────────────────────────────────────────────────────────────────

@app.get("/", tags=["System"])
async def root():
    """Quick ping endpoint — confirms the API is reachable."""
    return {
        "service": "Housing Adviser API",
        "version": "1.0.0",
        "status":  "running",
        "docs":    "/docs",
    }


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["System"])
@app.get("/health-check", tags=["System"])
async def health_check():
    """
    Detailed health status of all sub-systems.
    Returns HTTP 200 if everything is operational, 503 otherwise.
    """
    issues: list[str] = []
    details: dict     = {}

    # Vector store
    try:
        hits = query_vector_store("test", top_k=1)
        details["vector_store"] = {"status": "ok", "test_hits": len(hits)}
    except Exception as e:
        details["vector_store"] = {"status": "error", "detail": str(e)}
        issues.append("vector_store")

    # Dataset caches
    details["area_stats"] = {
        "status": "ok" if _area_stats_cache else "empty",
        "count":  len(_area_stats_cache),
    }
    details["companies"] = {
        "status": "ok" if _companies_cache else "empty",
        "count":  len(_companies_cache),
    }
    details["pollution"] = {
        "status": "ok" if _pollution_cache else "empty",
        "count":  len(_pollution_cache),
    }

    # Gemini API key
    details["llm"] = {
        "provider": "Gemini",
        "key_set":  bool(os.getenv("GEMINI_API_KEY")),
        "fallback": "Rule-based generator (always available)",
    }

    status_code = 200 if not issues else 503
    return JSONResponse(
        status_code = status_code,
        content = {
            "status":  "healthy" if not issues else "degraded",
            "issues":  issues,
            "details": details,
            "startup_complete": _startup_done,
        }
    )


# ── Chat (RAG chatbot) ────────────────────────────────────────────────────────

@app.post("/chat", tags=["AI"])
async def chat(request: ChatRequest):
    """
    RAG-powered chatbot endpoint.

    Accepts a natural-language query and returns:
    - A markdown-formatted response
    - Structured area recommendations
    - Detected intent breakdown

    Example queries:
    - "Suggest low pollution areas for asthma patients"
    - "Best 2 BHK near Electronic City under 60 lakhs"
    - "Affordable areas with good IT connectivity"
    """
    logger.info(f"/chat  query={request.query!r}")

    try:
        result = run_rag_pipeline(
            query           = request.query,
            top_k_retrieve  = request.top_k,
            top_n_recommend = request.top_n,
        )
        return _safe_json(result)

    except Exception as exc:
        logger.error(f"/chat error: {exc}", exc_info=True)
        raise HTTPException(
            status_code = 500,
            detail      = f"RAG pipeline error: {str(exc)}",
        )


# ── Recommend ─────────────────────────────────────────────────────────────────

@app.post("/recommend", tags=["AI"])
async def recommend(request: RecommendRequest):
    """
    Structured recommendation endpoint with explicit filter parameters.

    Unlike /chat (which parses a free-text query), this endpoint lets the
    frontend pass structured filters directly for precise filtering.
    """
    logger.info(f"/recommend  {request.model_dump()}")

    try:
        # Build an enriched query from the structured filters
        parts = [request.query]
        if request.max_budget_lakhs:
            parts.append(f"budget under {request.max_budget_lakhs} lakhs")
        if request.health_condition:
            parts.append(f"{request.health_condition} friendly area")
        if request.low_pollution_only:
            parts.append("low pollution area")
        if request.near_area:
            parts.append(f"near {request.near_area}")
        if request.bhk:
            parts.append(f"{request.bhk} BHK")

        enriched_query = ", ".join(parts)

        result = run_rag_pipeline(
            query           = enriched_query,
            top_k_retrieve  = 12,
            top_n_recommend = request.top_n,
        )

        # Apply post-filter: pollution level
        if request.low_pollution_only:
            result["recommendations"] = [
                r for r in result["recommendations"]
                if r.get("pollution_level") == "Low"
            ]

        # Apply post-filter: budget cap
        if request.max_budget_lakhs:
            result["recommendations"] = [
                r for r in result["recommendations"]
                if (r.get("avg_price_lakhs") or 9999) <= request.max_budget_lakhs * 1.25
            ]

        return _safe_json(result)

    except Exception as exc:
        logger.error(f"/recommend error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ── Areas list ────────────────────────────────────────────────────────────────

@app.get("/areas", tags=["Data"])
async def list_areas(
    pollution: str | None = Query(
        default     = None,
        description = "Filter by pollution level: Low | Medium | High",
    ),
    min_listings: int = Query(default=1, ge=1),
    sort_by: str      = Query(
        default     = "listing_count",
        description = "Sort field: listing_count | avg_price_lakhs | median_ppsf",
    ),
):
    """
    Return all known Bengaluru areas with aggregated housing statistics.
    Supports filtering by pollution level and sorting.
    """
    if not _area_stats_cache:
        raise HTTPException(status_code=503, detail="Data not yet loaded")

    data = _area_stats_cache.copy()

    # Apply filters
    if pollution:
        allowed = {"Low", "Medium", "High"}
        if pollution not in allowed:
            raise HTTPException(status_code=400, detail=f"pollution must be one of {allowed}")
        data = [a for a in data if a.get("pollution_level") == pollution]

    data = [a for a in data if (a.get("listing_count") or 0) >= min_listings]

    # Sort
    valid_sorts = {"listing_count", "avg_price_lakhs", "median_ppsf",
                   "min_price_lakhs", "max_price_lakhs"}
    if sort_by not in valid_sorts:
        sort_by = "listing_count"

    data.sort(key=lambda x: x.get(sort_by) or 0, reverse=True)

    return {
        "total":  len(data),
        "areas":  data,
        "filters": {"pollution": pollution, "min_listings": min_listings},
    }


# ── Area detail ───────────────────────────────────────────────────────────────

@app.get("/areas/{area_name}", tags=["Data"])
async def get_area(area_name: str):
    """
    Detailed information for a specific Bengaluru area.
    Includes housing stats, pollution level, IT companies, and health notes.
    """
    if not _area_stats_cache:
        raise HTTPException(status_code=503, detail="Data not yet loaded")

    # Case-insensitive search
    q = area_name.strip().lower()
    match = next(
        (a for a in _area_stats_cache if a.get("location", "").lower() == q),
        None
    )

    if match is None:
        # Partial match fallback
        match = next(
            (a for a in _area_stats_cache if q in a.get("location", "").lower()),
            None
        )

    if match is None:
        raise HTTPException(status_code=404, detail=f"Area '{area_name}' not found")

    loc = match.get("location", "")

    # Enrich with company list
    it_companies = AREA_IT_HUBS.get(loc, [])

    # Add semantic context
    semantic_hits = query_vector_store(
        f"housing in {loc} Bengaluru",
        top_k=5,
        filter_metadata={"type": "area"}
    )

    return _safe_json({
        **match,
        "it_companies_list": it_companies,
        "semantic_context":  [h["text"][:200] for h in semantic_hits],
    })


# ── Companies ─────────────────────────────────────────────────────────────────

@app.get("/companies", tags=["Data"])
async def list_companies(
    location: str | None = Query(default=None, description="Filter by office location"),
):
    """
    List all IT companies and their Bengaluru office locations.
    Useful for the frontend company-proximity search feature.
    """
    if not _companies_cache:
        raise HTTPException(status_code=503, detail="Company data not loaded")

    data = _companies_cache.copy()

    if location:
        q    = location.strip().lower()
        data = [c for c in data if q in str(c.get("office_location", "")).lower()]

    return {"total": len(data), "companies": data}


# ── Pollution guide ───────────────────────────────────────────────────────────

@app.get("/pollution-guide", tags=["Data"])
async def pollution_guide(
    category: str | None  = Query(default=None, description="Air | Water"),
    severity: str | None  = Query(default=None, description="Good | Moderate | Unhealthy …"),
    parameter: str | None = Query(default=None, description="PM2.5 | AQI | NO2 …"),
):
    """
    Return the pollution-to-disease mapping reference table.
    Supports filtering by category, severity level, and parameter name.
    """
    if not _pollution_cache:
        raise HTTPException(status_code=503, detail="Pollution data not loaded")

    data = _pollution_cache.copy()

    if category:
        data = [r for r in data if str(r.get("category", "")).lower() == category.lower()]
    if severity:
        data = [r for r in data if str(r.get("severity", "")).lower() == severity.lower()]
    if parameter:
        q    = parameter.strip().lower()
        data = [r for r in data if q in str(r.get("parameter", "")).lower()]

    return {"total": len(data), "records": data}


# ── Semantic search ───────────────────────────────────────────────────────────

@app.get("/search", tags=["AI"])
async def semantic_search(
    q: str = Query(..., min_length=3, description="Search query"),
    top_k: int = Query(default=8, ge=1, le=20),
    type_filter: str | None = Query(
        default     = None,
        description = "Filter by chunk type: area | house | company | pollution",
    ),
):
    """
    Raw semantic search against the vector store.
    Returns the top-k most similar document chunks.
    Useful for debugging and frontend 'explore' features.
    """
    filter_meta = {"type": type_filter} if type_filter else None
    try:
        hits = query_vector_store(q, top_k=top_k, filter_metadata=filter_meta)
        return {
            "query":   q,
            "results": _safe_json(hits),
            "total":   len(hits),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── Rebuild index (admin) ─────────────────────────────────────────────────────

@app.post("/rebuild-index", tags=["Admin"])
async def rebuild_index(
    request: RebuildRequest,
    background_tasks: BackgroundTasks,
):
    """
    Trigger a full rebuild of the ChromaDB vector store.
    This re-reads all datasets and re-embeds all chunks.

    ⚠️  This is a slow operation (~60–120 seconds depending on hardware).
    It runs in the background; the endpoint returns immediately.
    """
    if not request.confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to proceed")

    def _rebuild():
        global _area_stats_cache
        logger.info("[rebuild] Starting vector store rebuild …")
        try:
            init_vector_store(force_rebuild=True)
            logger.info("[rebuild] Vector store rebuilt ✓")
        except Exception as exc:
            logger.error(f"[rebuild] FAILED: {exc}")

    background_tasks.add_task(_rebuild)

    return {"status": "rebuild_started", "message": "Rebuilding in background. Check /health for status."}


# ═══════════════════════════════════════════════════════════════════════════
# ░░  MAIN
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))
    uvicorn.run(
        "app:app",
        host       = "0.0.0.0",
        port       = port,
        reload     = True,
        log_level  = "info",
    )
