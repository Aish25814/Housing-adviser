"""
data_loader.py
==============
Loads, cleans, and converts all three datasets into text chunks
that are fed into the RAG embedding pipeline.

Datasets handled:
  1. Bengaluru_House_Data.csv      → housing listings
  2. bangalore_companies.xlsx      → IT company office locations
  3. pollution_disease_mapping.csv → pollutant-to-disease mapping

Public API
----------
  build_all_chunks()  → list[dict]   # main entry point used by embeddings.py
  load_house_data()   → pd.DataFrame
  load_company_data() → pd.DataFrame
  load_pollution_data() → pd.DataFrame
  get_area_stats(df)  → pd.DataFrame  # per-area aggregated stats
"""

import re
import pandas as pd
import numpy as np
from pathlib import Path

# ── Path resolution ──────────────────────────────────────────────────────────
# This file lives at:  Housing-adviser/backend/data_loader.py
# Datasets live at:    Housing-adviser/backend/dataset/
BASE_DIR = Path(__file__).resolve().parent   # Housing-adviser/backend/
DATA_DIR = BASE_DIR / "dataset"


# ═══════════════════════════════════════════════════════════════════════════
# ░░  PRIVATE HELPERS
# ═══════════════════════════════════════════════════════════════════════════

def _parse_sqft(val) -> float | None:
    """
    Parse total_sqft values that may be:
      - plain numbers        : "1200"
      - ranges               : "1200 - 1500"  → average
      - non-standard units   : "34.46Sq. Meter", "4125Perch"  → strip suffix
    """
    if pd.isna(val):
        return None
    val = str(val).strip()

    # Handle "X - Y" ranges → take the average
    if " - " in val:
        parts = val.split(" - ")
        try:
            return (float(parts[0].strip()) + float(parts[1].strip())) / 2
        except ValueError:
            pass

    # Strip all non-numeric chars (keep digits and decimal point)
    numeric = re.sub(r"[^0-9.]", "", val)
    try:
        return float(numeric) if numeric else None
    except ValueError:
        return None


def _extract_bhk(size: str) -> int | None:
    """
    Extract the bedroom count from strings like:
      '2 BHK', '3 Bedroom', '1 RK'
    Returns None if the value cannot be parsed.
    """
    if pd.isna(size):
        return None
    match = re.search(r"(\d+)", str(size))
    return int(match.group(1)) if match else None


# ═══════════════════════════════════════════════════════════════════════════
# ░░  CURATED DOMAIN KNOWLEDGE  (supplementary static maps)
# ═══════════════════════════════════════════════════════════════════════════

# Pollution level per Bengaluru area (Low / Medium / High)
# Source: publicly available AQI reports + expert knowledge
AREA_POLLUTION: dict[str, str] = {
    # --- Low pollution ---
    "Electronic City": "Low",
    "Electronics City Phase 1": "Low",
    "Electronic City Phase Ii": "Low",
    "Koramangala": "Low",
    "Hsr Layout": "Low",
    "Sarjapur Road": "Low",
    "Indiranagar": "Low",
    "Yelahanka": "Low",
    "Jayanagar": "Low",
    "Jp Nagar": "Low",
    "Banashankari": "Low",
    "Hennur Road": "Low",
    "Thanisandra": "Low",
    "Kanakpura Road": "Low",
    "Devanahalli": "Low",
    "Bannerghatta Road": "Low",
    "Bellandur": "Low",
    "Hebbal Kempapura": "Low",
    "Whitefield": "Low",
    # --- Medium pollution ---
    "Marathahalli": "Medium",
    "Hebbal": "Medium",
    "Rajaji Nagar": "Medium",
    "Malleshwaram": "Medium",
    "Vijayanagar": "Medium",
    "Mysore Road": "Medium",
    "Hosur Road": "Medium",
    "Bommanahalli": "Medium",
    "Kr Puram": "Medium",
    "Old Madras Road": "Medium",
    # --- High pollution ---
    "Peenya": "High",
    "Yeshwanthpur": "High",
    "Tumkur Road": "High",
    "Magadi Road": "High",
    "Bommasandra Industrial Area": "High",
    "Kr Puram": "High",
}

# Health condition → areas to PREFER (low pollution) and AVOID (high pollution)
HEALTH_AREA_MAP: dict[str, dict] = {
    "asthma": {
        "prefer": ["Electronic City", "Koramangala", "Hsr Layout", "Bellandur",
                   "Sarjapur Road", "Jayanagar", "Yelahanka", "Banashankari",
                   "Whitefield", "Devanahalli"],
        "avoid":  ["Peenya", "Yeshwanthpur", "Tumkur Road", "Magadi Road",
                   "Bommasandra Industrial Area"],
    },
    "copd": {
        "prefer": ["Electronic City", "Koramangala", "Hsr Layout", "Bellandur",
                   "Sarjapur Road", "Kanakpura Road", "Bannerghatta Road"],
        "avoid":  ["Peenya", "Tumkur Road", "Magadi Road"],
    },
    "allergy": {
        "prefer": ["Electronic City", "Yelahanka", "Devanahalli", "Banashankari",
                   "Jp Nagar", "Kanakpura Road"],
        "avoid":  ["Peenya", "Kr Puram", "Yeshwanthpur"],
    },
}

# Nearby IT companies per area
AREA_IT_HUBS: dict[str, list[str]] = {
    "Electronic City": ["Infosys", "Wipro", "HCL Technologies", "Siemens",
                        "Tech Mahindra", "Bosch"],
    "Electronics City Phase 1": ["Infosys Campus", "Wipro"],
    "Electronic City Phase Ii": ["HP", "Tata Elxsi", "Capgemini"],
    "Whitefield": ["ITPL", "SAP Labs", "IBM", "Oracle", "Mphasis",
                   "Cognizant", "Dell EMC"],
    "Marathahalli": ["Accenture", "Amazon", "Microsoft", "Cisco"],
    "Koramangala": ["Flipkart HQ", "Ola", "Myntra", "Swiggy"],
    "Bellandur": ["Samsung R&D Institute", "Cisco Systems"],
    "Hsr Layout": ["Flipkart", "Ola", "BigBasket", "Zomato"],
    "Sarjapur Road": ["RGA Tech Park", "Wipro"],
    "Hebbal": ["Manyata Tech Park", "Embassy Tech Village",
               "HP India", "Tata Consultancy Services"],
    "Devanahalli": ["Aerospace SEZ", "BIAL IT Park", "Embassy Manyata"],
    "Yelahanka": ["Cessna Business Park", "NAL"],
    "Yeshwanthpur": ["World Trade Center", "Software Technology Parks of India"],
    "Indiranagar": ["Startups", "IBM Studio"],
    "Old Madras Road": ["EPIP Zone", "Brigade Magnum"],
}


# ═══════════════════════════════════════════════════════════════════════════
# ░░  DATASET LOADERS
# ═══════════════════════════════════════════════════════════════════════════

def load_house_data() -> pd.DataFrame:
    """
    Load and clean Bengaluru_House_Data.csv.

    Cleaning steps
    --------------
    1. Normalise column names.
    2. Parse `total_sqft` (handles ranges & non-standard units).
    3. Extract numeric BHK count from the `size` column.
    4. Drop rows with missing price / location / sqft / bhk.
    5. Compute price_per_sqft.
    6. Fill missing bath / balcony with sensible defaults.
    """
    # houses_geocoded.csv = original Bengaluru_House_Data + lat/lng columns
    path = DATA_DIR / "houses_geocoded.csv"
    df   = pd.read_csv(path, low_memory=False)

    # ── Normalise column names ──────────────────────────────────────────────
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
    )

    # ── Location cleanup ────────────────────────────────────────────────────
    df["location"] = (
        df["location"]
        .str.strip()
        .str.title()          # "electronic city" → "Electronic City"
    )

    # ── Parse total_sqft ────────────────────────────────────────────────────
    df["total_sqft"] = df["total_sqft"].apply(_parse_sqft)

    # ── Extract BHK count ───────────────────────────────────────────────────
    df["bhk"] = df["size"].apply(_extract_bhk)

    # ── Drop rows missing critical fields ───────────────────────────────────
    df = df.dropna(subset=["price", "location", "total_sqft", "bhk"])
    df = df[(df["total_sqft"] > 50) & (df["price"] > 0)]   # sanity filter

    # ── Rename price column ─────────────────────────────────────────────────
    df.rename(columns={"price": "price_lakhs"}, inplace=True)

    # ── Derived column: price per sqft ──────────────────────────────────────
    df["price_per_sqft"] = (df["price_lakhs"] * 1_00_000) / df["total_sqft"]

    # ── Fill numeric gaps ───────────────────────────────────────────────────
    df["bath"]    = df["bath"].fillna(df["bhk"]).astype(int)
    df["balcony"] = df["balcony"].fillna(0).astype(int)

    return df.reset_index(drop=True)


def load_company_data() -> pd.DataFrame:
    """
    Load bangalore_companies.xlsx.
    Dynamically identifies 'company name' and 'location' columns
    using keyword matching so it works even if column names differ.
    """
    path = DATA_DIR / "bangalore_companies.xlsx"
    df   = pd.read_excel(path)

    # Normalise column names
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
    )

    # Identify company-name column
    name_col = next(
        (c for c in df.columns if any(k in c for k in ["company", "name", "firm"])),
        df.columns[0]   # fallback: first column
    )

    # Identify location column
    loc_col = next(
        (c for c in df.columns if any(k in c for k in ["location", "area", "address", "office"])),
        df.columns[1] if len(df.columns) > 1 else name_col   # fallback: second column
    )

    df.rename(columns={name_col: "company_name", loc_col: "office_location"}, inplace=True)

    df = df.dropna(subset=["company_name"])
    df["company_name"]    = df["company_name"].astype(str).str.strip()
    df["office_location"] = (
        df.get("office_location", pd.Series(["Unknown"] * len(df)))
        .fillna("Unknown")
        .astype(str)
        .str.strip()
        .str.title()
    )

    return df.reset_index(drop=True)


def load_pollution_data() -> pd.DataFrame:
    """
    Load pollution_disease_mapping.csv.
    Columns: parameter, category, unit, range_min, range_max,
             severity, probable_diseases, notes
    """
    path = DATA_DIR / "pollution_disease_mapping.csv"
    df   = pd.read_csv(path)
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
    )
    df = df.dropna(subset=["parameter"])
    return df.reset_index(drop=True)


# ═══════════════════════════════════════════════════════════════════════════
# ░░  ROW → TEXT CONVERTERS
# ═══════════════════════════════════════════════════════════════════════════

def house_to_text(row: pd.Series) -> str:
    """Converts a single house row into a searchable text description."""
    loc   = row.get("location", "Unknown")
    # bhk may already be a parsed column in houses_geocoded.csv
    bhk   = int(row.get("bhk", 0))
    sqft  = float(row.get("total_sqft", 0))
    price = float(row.get("price_lakhs", 0))
    bath  = int(row.get("bath", 0))
    bal   = int(row.get("balcony", 0))
    atype = row.get("area_type", "Built-up Area")
    avail = row.get("availability", "Ready To Move")
    ppsf  = float(row.get("price_per_sqft", 0))
    poll  = AREA_POLLUTION.get(loc, "Unknown")
    it    = ", ".join(AREA_IT_HUBS.get(loc, ["General IT Corridor"]))

    return (
        f"Location: {loc}, Bengaluru. "
        f"Property: {bhk} BHK {atype}, {sqft:.0f} sq.ft. "
        f"Price: Rs.{price:.2f} Lakhs (Rs.{ppsf:.0f}/sq.ft). "
        f"Bathrooms: {bath}, Balconies: {bal}. "
        f"Availability: {avail}. "
        f"Pollution level in this area: {poll}. "
        f"Nearby IT companies: {it}."
    )


def company_to_text(row: pd.Series) -> str:
    """Converts a company row into a searchable text description."""
    name = row.get("company_name", "Unknown Company")
    loc  = row.get("office_location", "Unknown Location")
    return (
        f"IT company {name} has its office in {loc}, Bengaluru. "
        f"Employees of {name} should look for housing near {loc} "
        f"for short commute distance."
    )


def pollution_to_text(row: pd.Series) -> str:
    """Converts a pollution-disease mapping row into a searchable text description."""
    param    = row.get("parameter", "Unknown")
    category = row.get("category", "")
    unit     = row.get("unit", "")
    rmin     = row.get("range_min", 0)
    rmax     = row.get("range_max", 9999)
    severity = row.get("severity", "Unknown")
    diseases = row.get("probable_diseases", "None")
    notes    = row.get("notes", "")

    return (
        f"Air/Water quality indicator: {param} ({category}), unit: {unit}. "
        f"When {param} is between {rmin} and {rmax} the severity is '{severity}'. "
        f"Health risks at this level: {diseases}. "
        f"Note: {notes}. "
        f"People with health conditions like asthma, COPD, or allergies should "
        f"avoid areas with high {param} levels."
    )


# ═══════════════════════════════════════════════════════════════════════════
# ░░  AREA-LEVEL AGGREGATION
# ═══════════════════════════════════════════════════════════════════════════

def get_area_stats(house_df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate house data to produce one summary row per Bengaluru area.

    Columns in the output
    ---------------------
    location, avg_price_lakhs, median_price_lakhs,
    min_price_lakhs, max_price_lakhs,
    avg_sqft, median_ppsf, listing_count,
    pollution_level, it_companies
    """
    stats = (
        house_df.groupby("location", as_index=False)
        .agg(
            avg_price_lakhs   = ("price_lakhs",    "mean"),
            median_price_lakhs= ("price_lakhs",    "median"),
            min_price_lakhs   = ("price_lakhs",    "min"),
            max_price_lakhs   = ("price_lakhs",    "max"),
            avg_sqft          = ("total_sqft",     "mean"),
            median_ppsf       = ("price_per_sqft", "median"),
            listing_count     = ("price_lakhs",    "count"),
        )
    )

    # Enrich with curated knowledge
    stats["pollution_level"] = (
        stats["location"].map(AREA_POLLUTION).fillna("Unknown")
    )
    stats["it_companies"] = stats["location"].map(AREA_IT_HUBS).apply(
        lambda x: ", ".join(x) if isinstance(x, list) else "General IT Corridor"
    )

    return stats


# ═══════════════════════════════════════════════════════════════════════════
# ░░  MAIN CHUNK BUILDER  (used by embeddings.py)
# ═══════════════════════════════════════════════════════════════════════════

def build_all_chunks() -> list[dict]:
    """
    Build all text chunks from the three datasets.

    Returns
    -------
    list of dicts, each with keys:
        id       : str   – unique identifier
        text     : str   – human-readable description for embedding
        metadata : dict  – structured data stored alongside the vector
    """
    chunks: list[dict] = []

    # ── 1. Area-level housing summaries ──────────────────────────────────
    print("[data_loader] Loading house data …")
    house_df   = load_house_data()
    area_stats = get_area_stats(house_df)

    for _, row in area_stats.iterrows():
        loc  = row["location"]
        text = (
            f"Bengaluru area: {loc}. "
            f"Average house price: Rs.{row['avg_price_lakhs']:.2f} Lakhs "
            f"(range Rs.{row['min_price_lakhs']:.1f}L - Rs.{row['max_price_lakhs']:.1f}L). "
            f"Median price per sq.ft: Rs.{row['median_ppsf']:.0f}. "
            f"Average flat size: {row['avg_sqft']:.0f} sq.ft. "
            f"Total property listings available: {row['listing_count']}. "
            f"Pollution level: {row['pollution_level']}. "
            f"Nearby IT companies: {row['it_companies']}."
        )
        chunks.append({
            "id": f"area_{loc.lower().replace(' ', '_').replace('/', '_')}",
            "text": text,
            "metadata": {
                "type": "area",
                "location": loc,
                "avg_price_lakhs":    round(float(row["avg_price_lakhs"]), 2),
                "median_price_lakhs": round(float(row["median_price_lakhs"]), 2),
                "min_price_lakhs":    round(float(row["min_price_lakhs"]), 2),
                "max_price_lakhs":    round(float(row["max_price_lakhs"]), 2),
                "avg_sqft":           round(float(row["avg_sqft"]), 1),
                "median_ppsf":        round(float(row["median_ppsf"]), 0),
                "listing_count":      int(row["listing_count"]),
                "pollution_level":    row["pollution_level"],
                "it_companies":       row["it_companies"],
            }
        })

    # ── 2. Individual house listings (sampled for DB size) ────────────────
    sample_df = house_df.sample(
        min(800, len(house_df)), random_state=42
    ).reset_index(drop=True)

    for idx, row in sample_df.iterrows():
        # Include lat/lng in metadata if available (houses_geocoded.csv has them)
        meta: dict = {
            "type":            "house",
            "location":        row["location"],
            "bhk":             int(row["bhk"]),
            "price_lakhs":     round(float(row["price_lakhs"]), 2),
            "total_sqft":      round(float(row["total_sqft"]), 1),
            "bath":            int(row["bath"]),
            "availability":    str(row.get("availability", "Unknown")),
            "pollution_level": AREA_POLLUTION.get(row["location"], "Unknown"),
        }
        if "lat" in row and not pd.isna(row["lat"]):
            meta["lat"] = round(float(row["lat"]), 6)
            meta["lng"] = round(float(row["lng"]), 6)

        chunks.append({
            "id":       f"house_{idx}",
            "text":     house_to_text(row),
            "metadata": meta,
        })

    print(f"[data_loader] House chunks: {len(chunks)}")

    # ── 3. Company / IT office data ───────────────────────────────────────
    try:
        print("[data_loader] Loading company data …")
        comp_df = load_company_data()
        for idx, row in comp_df.iterrows():
            chunks.append({
                "id": f"company_{idx}",
                "text": company_to_text(row),
                "metadata": {
                    "type":     "company",
                    "company":  row["company_name"],
                    "location": row["office_location"],
                }
            })
        print(f"[data_loader] Company chunks added: {len(comp_df)}")
    except Exception as exc:
        print(f"[data_loader] WARNING – company data skipped: {exc}")

    # ── 4. Pollution / disease mapping ────────────────────────────────────
    try:
        print("[data_loader] Loading pollution data …")
        poll_df = load_pollution_data()
        for idx, row in poll_df.iterrows():
            chunks.append({
                "id": f"pollution_{idx}",
                "text": pollution_to_text(row),
                "metadata": {
                    "type":      "pollution",
                    "parameter": str(row.get("parameter", "")),
                    "severity":  str(row.get("severity", "")),
                    "diseases":  str(row.get("probable_diseases", "")),
                    "category":  str(row.get("category", "")),
                }
            })
        print(f"[data_loader] Pollution chunks added: {len(poll_df)}")
    except Exception as exc:
        print(f"[data_loader] WARNING – pollution data skipped: {exc}")

    print(f"[data_loader] Total chunks built: {len(chunks)}")
    return chunks


# ─────────────────────────────────────────────────────────────────────────────
# Quick self-test: run  python data_loader.py
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    chunks = build_all_chunks()
    print(f"\n✅  Total chunks: {len(chunks)}\n")
    for c in chunks[:5]:
        print(f"  [{c['id']}] {c['text'][:130]} …\n")
