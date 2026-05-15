import { useEffect, useState } from "react";
import Papa from "papaparse";
import { haversine, getWaterRisk, AREA_NOISE_LEVEL, DISEASE_POLLUTANTS } from "./constants.js";

let _cachedHouses = null;

export function useHouses() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (_cachedHouses) { setHouses(_cachedHouses); setLoading(false); return; }
    Papa.parse("/houses_geocoded.csv?v=" + Date.now(), {
      download: true, header: true, dynamicTyping: true,
      complete(results) {
        const valid = results.data.map((row, i) => ({
          id: i,
          loc: String(row.location || "").trim(),
          bhk: parseInt(row.bhk || 0),
          sqft: parseFloat(row.total_sqft || 0),
          bath: parseInt(row.bath || 0),
          price: parseFloat(row.price || 0),
          lat: parseFloat(row.lat || row.latitude || 0),
          lng: parseFloat(row.lng || row.longitude || 0),
          soc: String(row.society || "").trim(),
        })).filter(h =>
          isFinite(h.lat) && isFinite(h.lng) &&
          h.lat > 12.7 && h.lat < 13.2 && h.lng > 77.3 && h.lng < 77.9 &&
          h.price > 0 && h.bhk > 0
        );
        _cachedHouses = valid;
        setHouses(valid);
        setLoading(false);
      }
    });
  }, []);

  return { houses, loading };
}

// ── Static AQI per area (fallback when no WAQI token) ────────────────────────
// Based on CPCB / IQAir historical data for Bengaluru areas
const AREA_STATIC_AQI = {
  // Low AQI (Good / Moderate) — safe for sensitive groups
  "Yelahanka":              42,
  "Devanahalli":            45,
  "Kanakpura Road":         48,
  "Banashankari":           50,
  "Jayanagar":              52,
  "Jp Nagar":               53,
  "Bannerghatta Road":      54,
  "Electronic City":        58,
  "Electronics City Phase 1": 58,
  "Electronic City Phase Ii": 58,
  "Koramangala":            62,
  "Whitefield":             65,
  "Hsr Layout":             65,
  "Hebbal Kempapura":       68,
  "Thanisandra":            68,
  "Hennur Road":            70,
  "Bellandur":              72,
  // Medium AQI (Moderate / Unhealthy for Sensitive)
  "Indiranagar":            75,
  "Sarjapur Road":          78,
  "Hebbal":                 80,
  "Rajaji Nagar":           85,
  "Malleshwaram":           88,
  "Vijayanagar":            90,
  "Hosur Road":             92,
  "Bommanahalli":           95,
  "Marathahalli":           105,
  "Mysore Road":            108,
  // High AQI — avoid for health conditions
  "Kr Puram":               125,
  "Old Madras Road":        130,
  "Yeshwanthpur":           140,
  "Magadi Road":            145,
  "Tumkur Road":            150,
  "Peenya":                 165,
  "Bommasandra Industrial Area": 170,
};

/**
 * Get static AQI for a location string (partial match).
 * Returns a synthetic aqiData object compatible with computeHealthPenalty.
 */
export function getStaticAqi(loc) {
  if (!loc) return { aqi: 80, live: false, iaqi: {} };
  const locLower = loc.toLowerCase();
  for (const [area, aqi] of Object.entries(AREA_STATIC_AQI)) {
    if (locLower.includes(area.toLowerCase())) return { aqi, live: false, iaqi: {} };
  }
  return { aqi: 80, live: false, iaqi: {} };
}

/**
 * Get static noise dB for a location string.
 */
function getStaticNoise(loc) {
  if (!loc) return 60;
  const locLower = loc.toLowerCase();
  for (const [area, data] of Object.entries(AREA_NOISE_LEVEL)) {
    if (locLower.includes(area.toLowerCase())) return data.db;
  }
  return 60;
}

/**
 * Compute a static health penalty (0–1) using only area-level data.
 * Used during candidate retrieval before WAQI data is available.
 * For health conditions, AQI is the primary signal.
 */
function staticHealthPenalty(loc, conditions) {
  if (!conditions || conditions.length === 0) return 0;

  const aqiData  = getStaticAqi(loc);
  const noiseDb  = getStaticNoise(loc);
  const waterData = getWaterRisk(loc);

  let totalPenalty = 0;

  for (const cond of conditions) {
    const mapping = DISEASE_POLLUTANTS[cond];
    if (!mapping) continue;

    let p = 0;

    // AQI penalty — primary signal, weighted heavily for air-sensitive conditions
    if (aqiData.aqi > mapping.aqiLimit) {
      // Linear scale: exceeding limit by 50% → 0.5 penalty, capped at 0.7
      p += Math.min(0.7, ((aqiData.aqi - mapping.aqiLimit) / mapping.aqiLimit) * 0.7);
    }

    // Water penalty
    if (mapping.water.length > 0) {
      const issues = (waterData.issues || []).map(i => i.toLowerCase());
      const hits = mapping.water.filter(w => issues.some(i => i.includes(w)));
      if (hits.length > 0) p += waterData.risk === "HIGH" ? 0.35 : 0.15;
    }

    // Noise penalty
    if (noiseDb > mapping.noiseLimit) {
      p += Math.min(0.2, ((noiseDb - mapping.noiseLimit) / mapping.noiseLimit) * 0.2);
    }

    totalPenalty += p;
  }

  return Math.min(0.95, totalPenalty / conditions.length);
}

/**
 * Retrieve and rank candidates with health-aware scoring.
 *
 * Algorithm:
 * 1. Apply hard filters (budget, BHK, area keyword)
 * 2. Compute distance to workplace for every house
 * 3. Compute static health penalty for every house using area AQI/noise/water
 * 4. Combined score = distanceScore × (1 - healthPenalty)
 *    — when health conditions exist, healthPenalty dominates for unsafe areas
 * 5. De-duplicate by location name (not lat/lng bucket) to avoid repeats
 * 6. Return top N
 */
export function retrieveCandidates(houses, prefs, companyCoords, topN = 20, conditions = []) {
  const { budgetMin, budgetMax, bhkList, areaKeyword } = prefs;

  // Step 1: hard filters
  let filtered = houses.filter(h => {
    if (budgetMin && h.price < budgetMin) return false;
    if (budgetMax && h.price > budgetMax) return false;
    if (bhkList && bhkList.length > 0) {
      const bv = h.bhk >= 5 ? 5 : h.bhk;
      if (!bhkList.includes(bv)) return false;
    }
    if (areaKeyword) {
      const kw = areaKeyword.toLowerCase();
      if (!h.loc.toLowerCase().includes(kw) && !h.soc.toLowerCase().includes(kw)) return false;
    }
    return true;
  });

  // Relax area keyword if nothing found
  if (filtered.length === 0) {
    filtered = houses.filter(h => {
      if (budgetMin && h.price < budgetMin) return false;
      if (budgetMax && h.price > budgetMax) return false;
      if (bhkList && bhkList.length > 0) {
        const bv = h.bhk >= 5 ? 5 : h.bhk;
        if (!bhkList.includes(bv)) return false;
      }
      return true;
    });
  }

  // Relax budget too if still nothing
  if (filtered.length === 0) {
    filtered = houses.filter(h => {
      if (bhkList && bhkList.length > 0) {
        const bv = h.bhk >= 5 ? 5 : h.bhk;
        if (!bhkList.includes(bv)) return false;
      }
      return true;
    });
  }

  // Step 2 & 3: score every house
  const scored = filtered.map(h => {
    const dist        = Math.round(haversine(companyCoords.lat, companyCoords.lng, h.lat, h.lng) * 10) / 10;
    const waterData   = getWaterRisk(h.loc);
    const healthPen   = staticHealthPenalty(h.loc, conditions);
    const distScore   = 1 / (dist + 0.5); // +0.5 avoids extreme scores for very close houses
    // When health conditions exist, health penalty is weighted 60%, distance 40%
    const finalScore  = conditions.length > 0
      ? distScore * 0.4 * (1 - healthPen) + (1 - healthPen) * 0.6
      : distScore * (1 - (waterData.risk === "HIGH" ? 0.3 : waterData.risk === "MEDIUM" ? 0.15 : 0));
    return { ...h, dist, waterData, healthPen, finalScore };
  });

  // Step 4: sort by final score descending
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Step 5: de-duplicate by location name — keep only the best-scored house per area
  const seenLoc = new Set();
  const unique  = [];
  for (const h of scored) {
    const locKey = h.loc.toLowerCase().trim();
    if (!seenLoc.has(locKey)) {
      seenLoc.add(locKey);
      unique.push(h);
    }
    if (unique.length >= topN) break;
  }

  return unique;
}
