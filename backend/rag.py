"""
rag.py
======
Retrieval-Augmented Generation (RAG) pipeline for the Housing Adviser.

Architecture overview
---------------------
  User query
       │
       ▼
  [1] Classify query intent   → detect budget / pollution / health / company clues
       │
       ▼
  [2] Semantic retrieval       → embeddings.query_vector_store()
       │
       ▼
  [3] Context assembly         → build a clean context string from retrieved chunks
       │
       ▼
  [4] Response generation      → LLM (or rule-based fallback)
       │
       ▼
  Structured JSON response

LLM Strategy
------------
- Primary:  Google Gemini API  (free tier, no credit card required)
             Set GEMINI_API_KEY in backend/.env  (or as an environment variable)
- Fallback: Local rule-based generator (works 100 % offline)

This ensures the system always returns a useful answer even without
an API key.
"""

import os
import re
import json
import math
import httpx
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from embeddings import query_vector_store, init_vector_store
from data_loader import (
    load_house_data,
    get_area_stats,
    AREA_POLLUTION,
    AREA_IT_HUBS,
    HEALTH_AREA_MAP,
)

# ── Load .env ────────────────────────────────────────────────────────────────
load_dotenv(Path(__file__).parent / ".env")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")


# ═══════════════════════════════════════════════════════════════════════════
# ░░  INTENT CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════

class QueryIntent:
    """Holds the detected intent signals from the user query."""
    def __init__(self):
        self.wants_low_pollution   : bool        = False
        self.health_condition      : str | None  = None     # "asthma", "copd", "allergy"
        self.max_budget_lakhs      : float | None= None     # upper price cap
        self.min_budget_lakhs      : float | None= None
        self.near_company          : str | None  = None     # e.g. "infosys"
        self.near_area             : str | None  = None     # e.g. "electronic city"
        self.bhk_preference        : int | None  = None
        self.is_affordable_query   : bool        = False
        self.is_company_query      : bool        = False
        self.is_pollution_query    : bool        = False
        self.is_health_query       : bool        = False


def classify_intent(query: str) -> QueryIntent:
    """
    Rule-based intent classification.
    Extracts signals from the natural-language user query.
    """
    q   = query.lower()
    out = QueryIntent()

    # ── Pollution intent ──────────────────────────────────────────────────
    if any(w in q for w in ["pollution", "air quality", "aqi", "clean air", "polluted"]):
        out.is_pollution_query = True
    if any(w in q for w in ["low pollution", "less pollution", "clean", "fresh air",
                             "pollution free", "no pollution"]):
        out.wants_low_pollution = True

    # ── Health intent ─────────────────────────────────────────────────────
    health_keywords = ["asthma", "copd", "allergy", "allergic", "respiratory",
                       "health", "lung", "breathing", "heart", "elderly", "senior",
                       "child", "children", "baby", "pregnant"]
    if any(w in q for w in health_keywords):
        out.is_health_query = True
        out.wants_low_pollution = True      # health queries always prefer clean air

    if "asthma" in q or "respiratory" in q or "breathing" in q:
        out.health_condition = "asthma"
    elif "copd" in q or "lung" in q:
        out.health_condition = "copd"
    elif "allerg" in q:
        out.health_condition = "allergy"

    # ── Budget intent ─────────────────────────────────────────────────────
    if any(w in q for w in ["affordable", "cheap", "budget", "low cost",
                             "economical", "inexpensive"]):
        out.is_affordable_query = True

    # Extract explicit amounts  e.g. "under 50 lakhs", "below 80L", "50-100 lakhs"
    budget_match = re.search(
        r"(?:under|below|less than|max|upto|within)\s*₹?\s*(\d+\.?\d*)\s*(?:lakhs?|l\b)?",
        q,
    )
    if budget_match:
        out.max_budget_lakhs = float(budget_match.group(1))

    range_match = re.search(
        r"(\d+\.?\d*)\s*(?:lakhs?|l)?\s*[-–to]+\s*(\d+\.?\d*)\s*(?:lakhs?|l)?",
        q,
    )
    if range_match:
        out.min_budget_lakhs = float(range_match.group(1))
        out.max_budget_lakhs = float(range_match.group(2))

    # ── BHK preference ────────────────────────────────────────────────────
    bhk_match = re.search(r"(\d)\s*(?:bhk|bedroom|bed room|room)", q)
    if bhk_match:
        out.bhk_preference = int(bhk_match.group(1))

    # ── Company / area near intent ────────────────────────────────────────
    company_keywords = ["near", "close to", "close by", "next to", "adjacent",
                        "proximity", "commute", "office", "workplace"]
    if any(w in q for w in company_keywords):
        out.is_company_query = True

    # Detect well-known Bengaluru tech areas
    known_areas = [
        "electronic city", "whitefield", "koramangala", "marathahalli",
        "hsr layout", "bellandur", "sarjapur", "indiranagar", "hebbal",
        "yelahanka", "jp nagar", "banashankari", "devanahalli", "manyata",
        "itpl", "ecospace", "bagmane",
    ]
    for area in known_areas:
        if area in q:
            out.near_area = area
            out.is_company_query = True
            break

    # Detect company names
    known_companies = [
        "infosys", "wipro", "tcs", "ibm", "oracle", "microsoft",
        "amazon", "accenture", "cisco", "sap", "intel", "flipkart",
        "mphasis", "hcl", "samsung", "cognizant", "capgemini",
    ]
    for company in known_companies:
        if company in q:
            out.near_company = company
            out.is_company_query = True
            break

    return out


# ═══════════════════════════════════════════════════════════════════════════
# ░░  RULE-BASED RESPONSE GENERATOR  (offline fallback)
# ═══════════════════════════════════════════════════════════════════════════

def _build_rule_based_response(
    query: str,
    intent: QueryIntent,
    retrieved_chunks: list[dict],
    recommendations: list[dict],
) -> str:
    """
    Build a coherent, context-rich answer without any LLM API call.
    Uses the retrieved chunks + intent signals to craft the response.
    """
    lines: list[str] = []

    # ── Greeting paragraph ────────────────────────────────────────────────
    if intent.is_health_query:
        lines.append(
            f"Based on your health concern "
            f"({'**' + intent.health_condition + '**' if intent.health_condition else 'health conditions'}), "
            f"I've filtered housing areas in Bengaluru that have **lower pollution levels** "
            f"and are suitable for sensitive individuals. "
            f"Here are my top recommendations:"
        )
    elif intent.is_affordable_query:
        budget_str = (
            f"under ₹{intent.max_budget_lakhs:.0f} Lakhs"
            if intent.max_budget_lakhs
            else "within your budget"
        )
        lines.append(
            f"Looking for **affordable housing** {budget_str} in Bengaluru? "
            f"Here are the best value-for-money areas based on current listings:"
        )
    elif intent.is_company_query:
        target = intent.near_area or intent.near_company or "your workplace"
        lines.append(
            f"To minimise your commute distance to **{target.title()}**, "
            f"these Bengaluru areas offer the best combination of short commute, "
            f"available listings, and livability:"
        )
    elif intent.is_pollution_query:
        lines.append(
            "Here are Bengaluru areas ranked by **air quality and pollution levels**, "
            "along with their housing affordability:"
        )
    else:
        lines.append(
            "Based on your query, here are the most suitable residential areas "
            "in Bengaluru:"
        )

    lines.append("")

    # ── Recommendation bullets ────────────────────────────────────────────
    if recommendations:
        for i, rec in enumerate(recommendations[:5], 1):
            loc      = rec.get("location", "Unknown")
            avg_p    = rec.get("avg_price_lakhs", 0)
            poll     = rec.get("pollution_level", "Unknown")
            it_cos   = rec.get("it_companies", "")
            listings = rec.get("listing_count", 0)
            score    = rec.get("recommendation_score", 0)
            conf     = rec.get("confidence_label", "")

            poll_emoji = {"Low": "🟢", "Medium": "🟡", "High": "🔴"}.get(poll, "⚪")

            lines.append(
                f"**{i}. {loc}** {poll_emoji}"
            )
            lines.append(
                f"   • Avg. price: ₹{avg_p:.1f} Lakhs  |  "
                f"Pollution: {poll}  |  "
                f"Listings: {listings}  |  "
                f"Confidence: {conf} ({score:.0%})"
            )
            if it_cos and it_cos != "General IT Corridor":
                nearby = it_cos.split(", ")[:3]
                lines.append(
                    f"   • Nearby IT: {', '.join(nearby)}"
                )
            lines.append("")

    # ── Health warning ────────────────────────────────────────────────────
    if intent.health_condition:
        cond = intent.health_condition
        health_data = HEALTH_AREA_MAP.get(cond, {})
        avoid = health_data.get("avoid", [])
        if avoid:
            lines.append(
                f"⚠️ **Areas to avoid** for {cond} patients: "
                + ", ".join(avoid[:4]) + "."
            )
            lines.append("")

    # ── General tips ──────────────────────────────────────────────────────
    lines.append("---")
    lines.append("**💡 Tips for house hunting in Bengaluru:**")
    if intent.is_affordable_query:
        lines.append("- Consider areas on the outskirts for better rates per sq.ft.")
        lines.append("- Electronic City and Sarjapur Road offer good IT connectivity at lower prices.")
    if intent.is_health_query:
        lines.append("- Verify real-time AQI at https://aqicn.org before finalising.")
        lines.append("- Areas near lakes (Bellandur, Yelahanka) have cleaner micro-climates.")
    if intent.is_company_query:
        lines.append("- Factor in peak-hour traffic — 5 km can mean 45 min during rush hour.")
        lines.append("- Check BMTC / Metro connectivity from the area to your office.")
    lines.append("- Always visit the locality at different times of day before signing a lease.")

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# ░░  LLM-BASED RESPONSE GENERATOR  (uses Gemini if key is present)
# ═══════════════════════════════════════════════════════════════════════════

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent?key={key}"
)

SYSTEM_PROMPT = """You are an expert Housing Adviser for Bengaluru (Bangalore), India.
Your role is to help users find the best residential areas based on:
- Budget / affordability
- Air pollution levels and health conditions
- Proximity to IT companies and tech parks
- Commute convenience
- Environmental quality

Always:
- Be specific about Bengaluru localities
- Mention pollution levels (Low / Medium / High)
- Reference actual IT companies near recommended areas
- Give practical, actionable advice
- Respond in clear, well-structured markdown
- Keep responses concise but complete (under 400 words)

Never:
- Hallucinate property prices — use only the provided context
- Recommend High-pollution areas to health-sensitive users
- Give generic advice that ignores the user's specific constraints
"""


def _call_gemini(query: str, context: str, intent: QueryIntent) -> str | None:
    """
    Call the Gemini API and return the generated response text,
    or None if the call fails (triggers fallback).
    """
    if not GEMINI_API_KEY:
        return None

    intent_notes = []
    if intent.max_budget_lakhs:
        intent_notes.append(f"User budget cap: ₹{intent.max_budget_lakhs} Lakhs")
    if intent.health_condition:
        intent_notes.append(f"User health condition: {intent.health_condition}")
    if intent.near_area:
        intent_notes.append(f"User wants to be near: {intent.near_area}")
    if intent.wants_low_pollution:
        intent_notes.append("User prefers low-pollution areas")
    if intent.bhk_preference:
        intent_notes.append(f"User wants {intent.bhk_preference} BHK")

    user_prompt = f"""SYSTEM CONTEXT (from datasets):
{context}

USER CONSTRAINTS:
{chr(10).join(intent_notes) if intent_notes else 'None specified'}

USER QUERY:
{query}

Please provide a helpful, specific housing recommendation for Bengaluru.
Use the context above. Format with markdown headings and bullet points.
"""

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 600,
            "temperature":     0.4,
        },
    }

    try:
        resp = httpx.post(
            GEMINI_URL.format(key=GEMINI_API_KEY),
            json=payload,
            timeout=15.0,
        )
        resp.raise_for_status()
        data = resp.json()
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            return parts[0].get("text", "") if parts else None
    except Exception as exc:
        print(f"[rag] Gemini API error: {exc}")

    return None


# ═══════════════════════════════════════════════════════════════════════════
# ░░  RECOMMENDATION ENGINE
# ═══════════════════════════════════════════════════════════════════════════

# Cache area stats so we don't reload on every request
_area_stats_cache: dict | None = None


def _get_area_stats_cached():
    global _area_stats_cache
    if _area_stats_cache is None:
        df         = load_house_data()
        stats_df   = get_area_stats(df)
        _area_stats_cache = stats_df.to_dict("records")
    return _area_stats_cache


def _compute_recommendation_score(
    area: dict,
    intent: QueryIntent,
) -> float:
    """
    Score a candidate area on a 0–1 scale given the user's intent.

    Scoring factors
    ---------------
    - Pollution penalty   : High=−0.4, Medium=−0.2, Low=+0.2
    - Health bonus        : recommended area +0.3, avoid area −0.5
    - Budget match        : within budget +0.2, over budget −0.3
    - IT hub proximity    : has relevant companies +0.2
    - Listing count       : more options → slight bonus
    """
    score = 0.5   # baseline

    pollution = area.get("pollution_level", "Unknown")

    # Pollution scoring
    if pollution == "Low":
        score += 0.2
    elif pollution == "Medium":
        score -= 0.1
    elif pollution == "High":
        score -= 0.4

    # Health condition scoring
    if intent.health_condition:
        health = HEALTH_AREA_MAP.get(intent.health_condition, {})
        loc = area.get("location", "")
        if loc in health.get("prefer", []):
            score += 0.3
        elif loc in health.get("avoid", []):
            score -= 0.5

    # Budget scoring
    avg_price = area.get("avg_price_lakhs", 100)
    if intent.max_budget_lakhs:
        if avg_price <= intent.max_budget_lakhs:
            score += 0.2
        elif avg_price <= intent.max_budget_lakhs * 1.2:
            score += 0.05   # slightly over budget
        else:
            score -= 0.3    # well over budget

    if intent.is_affordable_query:
        # Reward lower-priced areas
        score += max(0, (80 - avg_price) / 200)   # heuristic bonus

    # IT hub proximity scoring
    it_companies = area.get("it_companies", "")
    if intent.near_area and intent.near_area.lower() in area.get("location", "").lower():
        score += 0.4   # exact area match
    elif intent.near_company and intent.near_company.lower() in it_companies.lower():
        score += 0.3   # company found nearby
    elif intent.is_company_query and it_companies != "General IT Corridor":
        score += 0.1

    # Listing count bonus (more choice = slightly better)
    listings = area.get("listing_count", 0)
    score += min(0.1, listings / 500)

    return round(max(0.0, min(1.0, score)), 4)


def _confidence_label(score: float) -> str:
    if score >= 0.80:
        return "Very High"
    if score >= 0.65:
        return "High"
    if score >= 0.50:
        return "Medium"
    return "Low"


def build_recommendations(
    intent: QueryIntent,
    retrieved_chunks: list[dict],
    top_n: int = 5,
) -> list[dict]:
    """
    Combine retrieved context with structured area stats to produce
    ranked housing recommendations.

    Returns a list of area dicts, sorted by recommendation_score DESC.
    """
    area_stats = _get_area_stats_cached()

    # ── Candidate pool ────────────────────────────────────────────────────
    # Start from retrieved area-type chunks (semantically relevant)
    candidate_locations: set[str] = set()
    for chunk in retrieved_chunks:
        if chunk.get("metadata", {}).get("type") == "area":
            loc = chunk["metadata"].get("location", "")
            if loc:
                candidate_locations.add(loc)

    # Score all areas; if candidates found, boost them
    scored: list[dict] = []
    for area in area_stats:
        loc   = area.get("location", "")
        score = _compute_recommendation_score(area, intent)

        # Boost areas that appeared in semantic search results
        if loc in candidate_locations:
            score = min(1.0, score + 0.15)

        scored.append({
            **area,
            "recommendation_score": score,
            "confidence_label":     _confidence_label(score),
        })

    # Sort descending by score
    scored.sort(key=lambda x: x["recommendation_score"], reverse=True)

    return scored[:top_n]


# ═══════════════════════════════════════════════════════════════════════════
# ░░  MAIN RAG FUNCTION  (called by app.py endpoints)
# ═══════════════════════════════════════════════════════════════════════════

def run_rag_pipeline(
    query: str,
    top_k_retrieve: int = 10,
    top_n_recommend: int = 5,
) -> dict[str, Any]:
    """
    Full RAG pipeline: classify → retrieve → score → generate → return.

    Parameters
    ----------
    query           : Raw user query string.
    top_k_retrieve  : How many chunks to retrieve from vector store.
    top_n_recommend : How many area recommendations to include in the response.

    Returns
    -------
    dict with keys:
        query            : str
        response         : str  (markdown-formatted answer)
        recommendations  : list[dict]
        intent           : dict  (detected intent flags)
        sources_used     : int
        llm_used         : bool
    """
    # ── 1. Classify intent ────────────────────────────────────────────────
    intent = classify_intent(query)

    # ── 2. Semantic retrieval ─────────────────────────────────────────────
    retrieved = query_vector_store(query, top_k=top_k_retrieve)

    # ── 3. Build structured recommendations ──────────────────────────────
    recommendations = build_recommendations(intent, retrieved, top_n=top_n_recommend)

    # ── 4. Assemble context string for LLM ───────────────────────────────
    context_parts: list[str] = []

    # Add top retrieved chunks
    for chunk in retrieved[:6]:
        context_parts.append(f"• {chunk['text']}")

    # Add top-3 recommendations as context
    context_parts.append("\n📊 TOP AREAS (from analysis):")
    for rec in recommendations[:3]:
        context_parts.append(
            f"  → {rec['location']}: avg ₹{rec['avg_price_lakhs']:.1f}L, "
            f"pollution={rec['pollution_level']}, "
            f"IT: {rec.get('it_companies', '')[:60]}"
        )

    context = "\n".join(context_parts)

    # ── 5. Generate response ──────────────────────────────────────────────
    llm_used = False
    response = _call_gemini(query, context, intent)

    if response:
        llm_used = True
    else:
        # Offline fallback: rule-based response builder
        response = _build_rule_based_response(query, intent, retrieved, recommendations)

    # ── 6. Serialise intent for JSON ──────────────────────────────────────
    intent_dict = {
        "wants_low_pollution": intent.wants_low_pollution,
        "health_condition":    intent.health_condition,
        "max_budget_lakhs":    intent.max_budget_lakhs,
        "min_budget_lakhs":    intent.min_budget_lakhs,
        "near_company":        intent.near_company,
        "near_area":           intent.near_area,
        "bhk_preference":      intent.bhk_preference,
        "is_affordable":       intent.is_affordable_query,
        "is_company_query":    intent.is_company_query,
        "is_pollution_query":  intent.is_pollution_query,
        "is_health_query":     intent.is_health_query,
    }

    # Serialise recommendations (convert numpy types to Python natives)
    def _safe(v):
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        if hasattr(v, "item"):   # numpy scalar → Python
            return v.item()
        return v

    recs_json = []
    for rec in recommendations:
        recs_json.append({k: _safe(v) for k, v in rec.items()})

    return {
        "query":           query,
        "response":        response,
        "recommendations": recs_json,
        "intent":          intent_dict,
        "sources_used":    len(retrieved),
        "llm_used":        llm_used,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Quick self-test:  python rag.py
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("[rag] Initialising vector store …")
    init_vector_store()

    test_queries = [
        "Suggest low pollution areas for asthma patients",
        "Best areas near Electronic City for IT professionals",
        "Affordable 2 BHK under 60 lakhs in Bengaluru",
        "Areas near Wipro office with good air quality",
        "Low traffic quiet residential areas in Bengaluru",
    ]

    for q in test_queries:
        print(f"\n{'='*60}")
        print(f"Query: {q}")
        result = run_rag_pipeline(q)
        print(f"LLM used: {result['llm_used']}")
        print(f"Sources used: {result['sources_used']}")
        print(f"\nResponse:\n{result['response'][:500]}")
        print(f"\nTop recommendation: {result['recommendations'][0] if result['recommendations'] else 'None'}")
