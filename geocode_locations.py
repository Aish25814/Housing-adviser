"""
One-time geocoding script using OSM Nominatim.
Extracts all unique location strings from houses_geocoded.csv,
queries Nominatim for each (1 req/s as required by usage policy),
and writes areaCoords.json to src/data/.

Usage:
    python geocode_locations.py

Output:
    src/data/areaCoords.json  — { "Location Name": { "lat": 12.xx, "lng": 77.xx }, ... }
"""

import csv
import json
import time
import urllib.request
import urllib.parse
import os
import sys

CSV_PATH   = os.path.join(os.path.dirname(__file__), "public", "houses_geocoded.csv")
OUT_PATH   = os.path.join(os.path.dirname(__file__), "src", "data", "areaCoords.json")
CACHE_PATH = os.path.join(os.path.dirname(__file__), "geocode_cache.json")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 GharDhundo/1.0",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "application/json",
    "Referer": "https://nominatim.openstreetmap.org/",
}

# Bangalore bounding box for result filtering
BBOX = {"lat_min": 12.7, "lat_max": 13.2, "lng_min": 77.3, "lng_max": 77.9}

def load_cache():
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_cache(cache):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=2, ensure_ascii=False)

def geocode(location, cache):
    """Query Nominatim for a location string. Returns (lat, lng) or None."""
    if location in cache:
        return cache[location]

    # Try progressively broader queries
    queries = [
        f"{location}, Bangalore, Karnataka, India",
        f"{location}, Bengaluru, Karnataka, India",
        f"{location}, Bangalore, India",
    ]

    for query in queries:
        encoded = urllib.parse.urlencode({"q": query, "format": "json", "limit": "5"})
        url = f"https://nominatim.openstreetmap.org/search?{encoded}"
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=10) as resp:
                results = json.loads(resp.read().decode("utf-8"))

            # Pick first result within Bangalore bounding box
            for r in results:
                lat = float(r["lat"])
                lng = float(r["lon"])
                if (BBOX["lat_min"] <= lat <= BBOX["lat_max"] and
                        BBOX["lng_min"] <= lng <= BBOX["lng_max"]):
                    result = {"lat": round(lat, 6), "lng": round(lng, 6)}
                    cache[location] = result
                    return result

        except Exception as e:
            print(f"  ⚠ Request error for '{query}': {e}")

        time.sleep(1.1)  # Nominatim rate limit: 1 req/s

    # No result found within Bangalore bounds
    cache[location] = None
    return None

def main():
    # 1. Extract unique locations
    print("📂 Reading CSV...")
    locations = set()
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            loc = row.get("location", "").strip()
            if loc:
                locations.add(loc)

    locations = sorted(locations)
    total = len(locations)
    print(f"✅ Found {total} unique locations\n")

    # 2. Load existing cache (resume support)
    cache = load_cache()
    already_done = sum(1 for loc in locations if loc in cache)
    print(f"📦 Cache has {already_done}/{total} entries — resuming from where we left off\n")

    # 3. Geocode each location
    results = {}
    failed  = []

    for i, loc in enumerate(locations):
        if loc in cache:
            if cache[loc]:
                results[loc] = cache[loc]
            else:
                failed.append(loc)
            # Print progress every 50
            if (i + 1) % 50 == 0:
                print(f"  [{i+1}/{total}] (from cache)...")
            continue

        coords = geocode(loc, cache)

        if coords:
            results[loc] = coords
            status = f"✓ {coords['lat']:.4f}, {coords['lng']:.4f}"
        else:
            failed.append(loc)
            status = "✗ not found"

        print(f"  [{i+1}/{total}] {loc[:50]:<50} {status}")

        # Save cache every 10 requests so we can resume on interruption
        if (i + 1) % 10 == 0:
            save_cache(cache)

        time.sleep(1.1)  # Respect Nominatim rate limit

    # Final cache save
    save_cache(cache)

    # 4. Write output JSON
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f"✅ Geocoded {len(results)}/{total} locations successfully")
    print(f"✗  Failed / outside Bangalore: {len(failed)}")
    print(f"📄 Output written to: {OUT_PATH}")

    if failed:
        print(f"\nFailed locations ({len(failed)}):")
        for loc in failed[:20]:
            print(f"  - {loc}")
        if len(failed) > 20:
            print(f"  ... and {len(failed) - 20} more")

    # Also copy to public/ so the Vite dev server can serve it at /areaCoords.json
    public_path = os.path.join(os.path.dirname(__file__), "public", "areaCoords.json")
    with open(public_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print(f"📄 Also copied to:    {public_path}")
    print("\n✅ Done! Restart the dev server and the app will use OSM coordinates.")

if __name__ == "__main__":
    main()
