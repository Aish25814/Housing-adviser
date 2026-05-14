import { useEffect, useState } from "react";
import Papa from "papaparse";
import { haversine, getWaterRisk } from "./constants.js";

let _cachedHouses = null;

export function useHouses() {
  const [houses, setHouses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (_cachedHouses) { setHouses(_cachedHouses); setLoading(false); return; }
    Papa.parse("/houses_geocoded.csv", {
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

/**
 * RAG-style retrieval: filter by user prefs, score by distance + water risk
 * Returns top N candidates for AI re-ranking
 */
export function retrieveCandidates(houses, prefs, companyCoords, topN = 20) {
  const { budgetMin, budgetMax, bhkList, areaKeyword } = prefs;

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

  if (filtered.length === 0) {
    // Relax area filter if no results
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

  const seenBucket = new Set();
  const candidates = [];
  const distScored = filtered
    .map(h => ({ ...h, dist: Math.round(haversine(companyCoords.lat, companyCoords.lng, h.lat, h.lng) * 10) / 10 }))
    .sort((a, b) => a.dist - b.dist);

  for (const h of distScored) {
    if (candidates.length >= topN) break;
    const bucket = `${h.lat.toFixed(2)}_${h.lng.toFixed(2)}`;
    if (!seenBucket.has(bucket)) { seenBucket.add(bucket); candidates.push(h); }
  }

  // Score each candidate (distance + water risk penalty)
  return candidates.map(h => {
    const waterData = getWaterRisk(h.loc);
    const waterPenalty = waterData.risk === "HIGH" ? 0.3 : waterData.risk === "MEDIUM" ? 0.15 : 0;
    const distScore = 1 / (h.dist + 0.1);
    const score = distScore * (1 - waterPenalty);
    return { ...h, waterData, score };
  }).sort((a, b) => b.score - a.score);
}
