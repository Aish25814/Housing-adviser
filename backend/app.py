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
import httpx
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


# ── Area Environment (WAQI live AQI + water + noise + house stats) ────────────

# Noise level estimates per Bengaluru area (dB, CPCB urban survey data)
AREA_NOISE_LEVEL: dict[str, dict] = {
    "Peenya":                      {"level": "High",   "db": 75, "desc": "Industrial zone with heavy machinery and traffic"},
    "Yeshwanthpur":                {"level": "High",   "db": 72, "desc": "Commercial hub with dense traffic"},
    "Tumkur Road":                 {"level": "High",   "db": 74, "desc": "Major highway corridor"},
    "Magadi Road":                 {"level": "High",   "db": 71, "desc": "Industrial and commercial mix"},
    "Bommasandra Industrial Area": {"level": "High",   "db": 76, "desc": "Heavy industrial area"},
    "Kr Puram":                    {"level": "High",   "db": 70, "desc": "Railway junction and commercial area"},
    "Old Madras Road":             {"level": "High",   "db": 69, "desc": "Major arterial road with heavy traffic"},
    "Marathahalli":                {"level": "Medium", "db": 65, "desc": "IT corridor with moderate traffic"},
    "Hebbal":                      {"level": "Medium", "db": 63, "desc": "Tech park area with flyover traffic"},
    "Rajaji Nagar":                {"level": "Medium", "db": 64, "desc": "Commercial and residential mix"},
    "Malleshwaram":                {"level": "Medium", "db": 62, "desc": "Busy market and residential area"},
    "Vijayanagar":                 {"level": "Medium", "db": 61, "desc": "Mixed residential and commercial"},
    "Mysore Road":                 {"level": "Medium", "db": 66, "desc": "Major highway with moderate traffic"},
    "Hosur Road":                  {"level": "Medium", "db": 64, "desc": "IT corridor with regular traffic"},
    "Bommanahalli":                {"level": "Medium", "db": 60, "desc": "Developing commercial area"},
    "Indiranagar":                 {"level": "Medium", "db": 62, "desc": "Upscale commercial and residential"},
    "Hsr Layout":                  {"level": "Medium", "db": 58, "desc": "Planned residential with some commercial"},
    "Sarjapur Road":               {"level": "Medium", "db": 60, "desc": "Growing IT corridor"},
    "Electronic City":             {"level": "Low",    "db": 52, "desc": "Planned IT township, well-regulated"},
    "Electronics City Phase 1":    {"level": "Low",    "db": 51, "desc": "Planned IT campus zone"},
    "Electronic City Phase Ii":    {"level": "Low",    "db": 50, "desc": "Planned IT campus zone"},
    "Koramangala":                 {"level": "Low",    "db": 55, "desc": "Upscale residential with managed traffic"},
    "Whitefield":                  {"level": "Low",    "db": 54, "desc": "Gated communities and IT parks"},
    "Yelahanka":                   {"level": "Low",    "db": 48, "desc": "Suburban residential, low traffic"},
    "Jayanagar":                   {"level": "Low",    "db": 50, "desc": "Well-planned residential layout"},
    "Jp Nagar":                    {"level": "Low",    "db": 51, "desc": "Residential layout with parks"},
    "Banashankari":                {"level": "Low",    "db": 49, "desc": "Quiet residential neighbourhood"},
    "Hennur Road":                 {"level": "Low",    "db": 52, "desc": "Developing residential corridor"},
    "Thanisandra":                 {"level": "Low",    "db": 50, "desc": "Suburban residential area"},
    "Kanakpura Road":              {"level": "Low",    "db": 47, "desc": "Semi-rural residential corridor"},
    "Devanahalli":                 {"level": "Low",    "db": 45, "desc": "Airport zone, mostly residential"},
    "Bannerghatta Road":           {"level": "Low",    "db": 53, "desc": "Green corridor near national park"},
    "Bellandur":                   {"level": "Low",    "db": 54, "desc": "IT and residential mix"},
    "Hebbal Kempapura":            {"level": "Low",    "db": 52, "desc": "Residential near tech parks"},
}

# WAQI AQI scale (US AQI 0–500)
WAQI_AQI_LEVELS = [
    {"max": 50,  "label": "Good",                 "color": "#4caf7d"},
    {"max": 100, "label": "Moderate",              "color": "#e8c84a"},
    {"max": 150, "label": "Unhealthy (Sensitive)", "color": "#f0843a"},
    {"max": 200, "label": "Unhealthy",             "color": "#e05c5c"},
    {"max": 300, "label": "Very Unhealthy",        "color": "#9b5de5"},
    {"max": 500, "label": "Hazardous",             "color": "#7d2e2e"},
]

def _waqi_level(aqi: int) -> dict:
    for lvl in WAQI_AQI_LEVELS:
        if aqi <= lvl["max"]:
            return lvl
    return WAQI_AQI_LEVELS[-1]


@app.get("/area-environment", tags=["Environment"])
async def area_environment(
    lat: float = Query(..., description="Latitude of the area"),
    lng: float = Query(..., description="Longitude of the area"),
    area_name: str = Query(..., description="Area name for noise/water lookup"),
):
    """
    Returns environmental data for a given location:
    - Air Quality: WAQI API (same token as map.html) — falls back to static data
    - Water quality: curated BWSSB data
    - Noise level: curated CPCB urban survey data
    - House count + price stats from the dataset

    WAQI free token: https://aqicn.org/data-platform/token/
    Set WAQI_TOKEN in backend/.env
    """
    result: dict = {
        "area": area_name,
        "lat": lat,
        "lng": lng,
        "air_quality": None,
        "water_quality": None,
        "noise": None,
        "house_count": None,
        "data_sources": [],
    }

    # ── 1. Air Quality via WAQI geo API ──────────────────────────────────
    waqi_token = os.getenv("WAQI_TOKEN", "").strip()
    if waqi_token:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"https://api.waqi.info/feed/geo:{lat};{lng}/",
                    params={"token": waqi_token},
                )
            if resp.status_code == 200:
                waqi_data = resp.json()
                if waqi_data.get("status") == "ok":
                    d    = waqi_data["data"]
                    aqi  = d["aqi"]
                    iaqi = d.get("iaqi", {})
                    lvl  = _waqi_level(aqi)
                    result["air_quality"] = {
                        "source":     "WAQI (World Air Quality Index) — live",
                        "aqi":        aqi,
                        "label":      lvl["label"],
                        "color":      lvl["color"],
                        "description": f"AQI {aqi} — {lvl['label']}",
                        "components": {
                            "pm2_5": iaqi.get("pm25", {}).get("v"),
                            "pm10":  iaqi.get("pm10", {}).get("v"),
                            "no2":   iaqi.get("no2",  {}).get("v"),
                            "so2":   iaqi.get("so2",  {}).get("v"),
                            "o3":    iaqi.get("o3",   {}).get("v"),
                            "co":    iaqi.get("co",   {}).get("v"),
                        },
                        "live": True,
                    }
                    result["data_sources"].append("WAQI Air Quality API")
                else:
                    logger.warning(f"WAQI status: {waqi_data.get('data')}")
        except Exception as exc:
            logger.warning(f"WAQI call failed: {exc}")

    # Fallback to curated static data
    if result["air_quality"] is None:
        static_poll = AREA_POLLUTION.get(area_name, "Unknown")
        static_map = {
            "Low":     {"aqi": 35,  "label": "Good",                 "color": "#4caf7d"},
            "Medium":  {"aqi": 110, "label": "Moderate",              "color": "#e8c84a"},
            "High":    {"aqi": 165, "label": "Unhealthy (Sensitive)", "color": "#f0843a"},
            "Unknown": {"aqi": 100, "label": "Unknown",               "color": "#7A8FA6"},
        }
        info = static_map.get(static_poll, static_map["Unknown"])
        result["air_quality"] = {
            "source":      "Curated Bengaluru AQI data (static fallback)",
            "aqi":         info["aqi"],
            "label":       info["label"],
            "color":       info["color"],
            "description": f"Based on historical AQI reports for {area_name}. Add WAQI_TOKEN to .env for live data.",
            "components":  None,
            "live":        False,
        }
        result["data_sources"].append("Curated static AQI data")

    # ── 2. Water Quality (curated BWSSB data) ────────────────────────────
    water = "Unknown"
    water_map = {
        "Safe":     {"risk": "LOW",    "score": 90, "color": "#4caf7d",
                     "desc": "BWSSB-supplied water meets safety standards",
                     "issues": [], "parameters": {"tds": "< 500 mg/L", "hardness": "Soft", "ph": "7.0–8.5"}},
        "Moderate": {"risk": "MEDIUM", "score": 60, "color": "#e8c84a",
                     "desc": "Generally safe but occasional TDS/hardness issues reported",
                     "issues": ["TDS", "Hardness"], "parameters": {"tds": "500–900 mg/L", "hardness": "Moderate", "ph": "7.0–8.5"}},
        "Poor":     {"risk": "HIGH",   "score": 30, "color": "#e05c5c",
                     "desc": "Industrial runoff or groundwater contamination reported",
                     "issues": ["Contamination", "High TDS"], "parameters": {"tds": "> 900 mg/L", "hardness": "Hard", "ph": "< 6.5 or > 9"}},
        "Unknown":  {"risk": "LOW",    "score": 50, "color": "#7A8FA6",
                     "desc": "No specific data available for this area",
                     "issues": [], "parameters": {"tds": "Unknown", "hardness": "Unknown", "ph": "Unknown"}},
    }
    winfo = water_map.get(water, water_map["Unknown"])
    result["water_quality"] = {
        "source":      "Bengaluru Water Supply & Sewerage Board (BWSSB) reports",
        "risk":        winfo["risk"],
        "color":       winfo["color"],
        "score":       winfo["score"],
        "description": winfo["desc"],
        "issues":      winfo["issues"],
        "parameters":  winfo["parameters"],
        "live":        False,
    }
    result["data_sources"].append("BWSSB curated data")

    # ── 3. Noise Level (curated CPCB data) ───────────────────────────────
    noise_default = {"level": "Medium", "db": 60, "desc": "Typical urban noise level"}
    noise_info    = AREA_NOISE_LEVEL.get(area_name, noise_default)
    result["noise"] = {
        "source":      "CPCB Bengaluru urban noise survey estimates",
        "level":       noise_info["level"],
        "db_estimate": noise_info["db"],
        "description": noise_info["desc"],
        "who_limit":   55,
        "exceeds_who": noise_info["db"] > 55,
        "live":        False,
    }
    result["data_sources"].append("CPCB noise survey estimates")

    # ── 4. House count from cached area stats ─────────────────────────────
    area_match = next(
        (a for a in _area_stats_cache if a.get("location", "").lower() == area_name.lower()),
        None
    )
    if area_match:
        result["house_count"] = {
            "total_listings":  area_match.get("listing_count", 0),
            "avg_price_lakhs": area_match.get("avg_price_lakhs"),
            "min_price_lakhs": area_match.get("min_price_lakhs"),
            "max_price_lakhs": area_match.get("max_price_lakhs"),
            "avg_sqft":        area_match.get("avg_sqft"),
            "median_ppsf":     area_match.get("median_ppsf"),
        }

    return _safe_json(result)


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
