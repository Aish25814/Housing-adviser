"""
embeddings.py
=============
Manages the creation, persistence, and querying of the ChromaDB
vector store that backs the RAG pipeline.

Responsibilities
----------------
1. Load all text chunks from data_loader.py
2. Encode them with a sentence-transformers model
3. Upsert them into a persistent ChromaDB collection
4. Expose a single query function used by rag.py

Dependencies
------------
  pip install sentence-transformers chromadb
"""

import os
import time
from pathlib import Path
from typing import Any

import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

from data_loader import build_all_chunks

# ── Configuration ────────────────────────────────────────────────────────────
BACKEND_DIR   = Path(__file__).resolve().parent       # Housing-adviser/backend/
VECTOR_DIR    = BACKEND_DIR / "vector_store"          # persistent ChromaDB directory
COLLECTION_NAME = "housing_adviser"

# "all-MiniLM-L6-v2" is fast, lightweight (~80 MB) and produces
# 384-dimensional embeddings — ideal for a local RAG application.
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Number of chunks to return per similarity query
DEFAULT_TOP_K = 8

# ── Module-level singletons ──────────────────────────────────────────────────
# Loaded once on first import / on startup; reused by every request.
_model:      SentenceTransformer | None = None
_collection: chromadb.Collection | None = None


# ═══════════════════════════════════════════════════════════════════════════
# ░░  INITIALISATION  (called once at backend startup)
# ═══════════════════════════════════════════════════════════════════════════

def _get_model() -> SentenceTransformer:
    """Lazy-load the embedding model (downloads on first run, cached after)."""
    global _model
    if _model is None:
        print(f"[embeddings] Loading sentence-transformer: {EMBEDDING_MODEL} …")
        _model = SentenceTransformer(EMBEDDING_MODEL)
        print("[embeddings] Model loaded ✓")
    return _model


def _get_chroma_client() -> chromadb.PersistentClient:
    """Return a persistent ChromaDB client pointed at VECTOR_DIR."""
    VECTOR_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(VECTOR_DIR),
        settings=Settings(anonymized_telemetry=False),
    )
    return client


def init_vector_store(force_rebuild: bool = False) -> chromadb.Collection:
    """
    Initialise (or load) the ChromaDB collection.

    Parameters
    ----------
    force_rebuild : bool
        If True, delete the existing collection and rebuild from scratch.
        Useful after updating datasets.

    Returns
    -------
    chromadb.Collection
        The ready-to-query collection.
    """
    global _collection

    client = _get_chroma_client()
    model  = _get_model()

    # ── Force rebuild: drop existing collection ───────────────────────────
    if force_rebuild:
        try:
            client.delete_collection(COLLECTION_NAME)
            print(f"[embeddings] Existing collection '{COLLECTION_NAME}' deleted.")
        except Exception:
            pass  # collection didn't exist yet

    # ── Try to reuse existing collection ─────────────────────────────────
    try:
        collection = client.get_collection(COLLECTION_NAME)
        count = collection.count()
        if count > 0 and not force_rebuild:
            print(
                f"[embeddings] Reusing existing collection "
                f"'{COLLECTION_NAME}' with {count} vectors ✓"
            )
            _collection = collection
            return collection
    except Exception:
        pass  # collection doesn't exist yet; create it below

    # ── Build a new collection ────────────────────────────────────────────
    print("[embeddings] Building vector store from datasets …")
    t0 = time.time()

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},   # cosine similarity
    )

    chunks = build_all_chunks()
    if not chunks:
        raise RuntimeError("[embeddings] No chunks produced by data_loader!")

    # Batch-encode in groups of 256 to stay memory-friendly
    BATCH = 256
    total_upserted = 0

    for start in range(0, len(chunks), BATCH):
        batch = chunks[start : start + BATCH]

        ids       = [c["id"]   for c in batch]
        texts     = [c["text"] for c in batch]
        metadatas = [c["metadata"] for c in batch]

        # ── Encode ──────────────────────────────────────────────────────
        vectors = model.encode(
            texts,
            show_progress_bar=False,
            batch_size=64,
            normalize_embeddings=True,   # L2-normalise → cosine = dot product
        ).tolist()

        # ── Upsert into ChromaDB ──────────────────────────────────────
        # Convert all metadata values to ChromaDB-compatible types
        safe_metadatas = []
        for m in metadatas:
            safe = {}
            for k, v in m.items():
                if isinstance(v, (str, int, float, bool)):
                    safe[k] = v
                else:
                    safe[k] = str(v)   # fallback: stringify complex values
            safe_metadatas.append(safe)

        collection.upsert(
            ids=ids,
            documents=texts,
            embeddings=vectors,
            metadatas=safe_metadatas,
        )
        total_upserted += len(batch)
        print(f"[embeddings]   Upserted {total_upserted}/{len(chunks)} vectors …")

    elapsed = time.time() - t0
    print(
        f"[embeddings] Vector store ready — "
        f"{total_upserted} vectors in {elapsed:.1f}s ✓"
    )

    _collection = collection
    return collection


# ═══════════════════════════════════════════════════════════════════════════
# ░░  QUERY  (called by rag.py on every user request)
# ═══════════════════════════════════════════════════════════════════════════

def query_vector_store(
    query_text: str,
    top_k: int = DEFAULT_TOP_K,
    filter_metadata: dict | None = None,
) -> list[dict]:
    """
    Perform a semantic similarity search and return the top-k results.

    Parameters
    ----------
    query_text      : Natural-language query from the user.
    top_k           : Number of results to retrieve.
    filter_metadata : Optional ChromaDB `where` filter, e.g.
                      {"type": "area"} or {"pollution_level": "Low"}.

    Returns
    -------
    list of dicts, each containing:
        text       : str   – the matched document text
        metadata   : dict  – structured metadata stored at index time
        distance   : float – cosine distance (lower = more similar)
        score      : float – similarity score 0–1 (higher = more similar)
    """
    global _collection

    # Ensure the vector store is initialised
    if _collection is None:
        _collection = init_vector_store()

    model = _get_model()

    # Encode the query (same normalisation as index time)
    query_vec = model.encode(
        [query_text],
        normalize_embeddings=True,
    ).tolist()

    # Build ChromaDB query kwargs
    query_kwargs: dict[str, Any] = {
        "query_embeddings": query_vec,
        "n_results":        min(top_k, _collection.count() or top_k),
        "include":          ["documents", "metadatas", "distances"],
    }
    if filter_metadata:
        query_kwargs["where"] = filter_metadata

    results = _collection.query(**query_kwargs)

    # ── Flatten results into a clean list ─────────────────────────────────
    docs      = results.get("documents",  [[]])[0]
    metas     = results.get("metadatas",  [[]])[0]
    distances = results.get("distances",  [[]])[0]

    hits = []
    for doc, meta, dist in zip(docs, metas, distances):
        # Convert cosine distance → similarity score in [0, 1]
        score = max(0.0, 1.0 - dist)
        hits.append({
            "text":     doc,
            "metadata": meta,
            "distance": round(float(dist),  4),
            "score":    round(float(score), 4),
        })

    return hits


# ─────────────────────────────────────────────────────────────────────────────
# Quick self-test:  python embeddings.py
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    init_vector_store(force_rebuild=False)

    test_queries = [
        "low pollution areas in Bengaluru for asthma patients",
        "affordable 2 BHK near Electronic City",
        "best areas near Whitefield IT park",
        "areas to avoid with high air pollution",
    ]

    for q in test_queries:
        print(f"\n🔍 Query: {q}")
        hits = query_vector_store(q, top_k=3)
        for i, h in enumerate(hits, 1):
            print(f"  {i}. [{h['score']:.3f}] {h['text'][:120]} …")
