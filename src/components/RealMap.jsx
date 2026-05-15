import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { aqiLevel, getWaterRisk, getNearbyServices } from "../data/constants.js";

const COLORS_MAP = ["#E8A838","#5b8dee","#7ec8a4","#c97ae8","#e87a7a"];

// ── OSM Nominatim: find nearest amenity to a lat/lng ─────────────────────────
// Returns { name, lat, lng } or null. Uses a 3 km viewbox around the point.
const _osmCache = {};
async function findNearestAmenity(lat, lng, amenity) {
  const key = `${amenity}_${lat.toFixed(3)}_${lng.toFixed(3)}`;
  if (_osmCache[key] !== undefined) return _osmCache[key];

  const delta = 0.03; // ~3 km box
  const viewbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
  const url = `https://nominatim.openstreetmap.org/search?` +
    `amenity=${amenity}&format=json&limit=1` +
    `&viewbox=${viewbox}&bounded=1` +
    `&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "GharDhundo/1.0 (educational project)" },
    });
    const data = await res.json();
    if (data.length > 0) {
      const r = data[0];
      const result = { name: r.display_name.split(",")[0], lat: parseFloat(r.lat), lng: parseFloat(r.lon) };
      _osmCache[key] = result;
      return result;
    }
  } catch (_) {}

  _osmCache[key] = null;
  return null;
}

// ── Custom div icons ──────────────────────────────────────────────────────────
function makeServiceIcon(emoji, bg) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:30px;height:30px;border-radius:50%;
      background:${bg};border:2.5px solid #fff;
      display:flex;align-items:center;justify-content:center;
      font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,0.35);
    ">${emoji}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
}

const HOSPITAL_ICON = makeServiceIcon("🏥", "#e05c5c");
const POLICE_ICON   = makeServiceIcon("🚔", "#1A3C5E");

// ── Jitter overlapping pins ───────────────────────────────────────────────────
function jitterCoords(results) {
  const STEP = 0.0015, seen = {};
  return results.map(h => {
    const key = `${h.lat.toFixed(3)}_${h.lng.toFixed(3)}`;
    const n = seen[key] = (seen[key] ?? 0) + 1;
    if (n === 1) return { ...h, jLat: h.lat, jLng: h.lng };
    const angle = (n - 1) * (2 * Math.PI / 6);
    return { ...h, jLat: h.lat + STEP * Math.sin(angle), jLng: h.lng + STEP * Math.cos(angle) };
  });
}

export default function RealMap({ results, company }) {
  const mapRef     = useRef(null);
  const instanceRef = useRef(null);
  const layerRef   = useRef(null);   // house + route markers
  const svcLayerRef = useRef(null);  // hospital + police markers (separate so they stay on top)

  // ── Init map once ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (instanceRef.current) return;
    const map = L.map(mapRef.current, { zoomControl: true }).setView([12.9716, 77.5946], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    instanceRef.current = map;
    layerRef.current    = L.layerGroup().addTo(map);
    svcLayerRef.current = L.layerGroup().addTo(map); // added after so it renders on top
  }, []);

  // ── Re-draw whenever results change ───────────────────────────────────────
  useEffect(() => {
    let isActive = true;
    const map      = instanceRef.current;
    const layer    = layerRef.current;
    const svcLayer = svcLayerRef.current;
    if (!map || !layer || !svcLayer) return;

    layer.clearLayers();
    svcLayer.clearLayers();

    if (!company || !results || results.length === 0) return;

    // ── Company marker ──────────────────────────────────────────────────────
    L.circleMarker([company.lat, company.lng], {
      radius: 12, color: "#e8a045", fillColor: "#e8a045", fillOpacity: 1, weight: 3,
    }).addTo(layer)
      .bindPopup(`<b>🏢 ${company.name}</b><br><span style="font-size:11px">${company.area}</span>`);

    const jittered = jitterCoords(results);
    const bounds   = [[company.lat, company.lng]];

    // Track which hospital/police coords we've already placed to avoid duplicates
    const placedHospitals = new Set();
    const placedPolice    = new Set();

    jittered.forEach((h, i) => {
      const c        = COLORS_MAP[i] || "#aaa";
      const size     = i === 0 ? 42 : 34;
      const lvl      = h.aqiData?.aqi ? aqiLevel(h.aqiData.aqi) : null;
      const aqiColor = lvl?.color || "#444";
      const waterData = getWaterRisk(h.loc);
      const fallback  = getNearbyServices(h.loc); // static fallback names

      // ── House pin ─────────────────────────────────────────────────────────
      const pulse = i === 0
        ? `<div style="position:absolute;inset:-8px;border-radius:50%;border:3px solid ${c};opacity:.5;animation:pulse 1.8s ease-out infinite;"></div>`
        : "";
      const aqiMini = h.aqiData?.aqi
        ? `<div style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:${aqiColor};color:#000;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.5)">${h.aqiData.aqi}</div>`
        : "";

      const houseIcon = L.divIcon({
        className: "",
        html: `<div style="position:relative;width:${size}px;height:${size}px;">
          ${pulse}
          <div style="position:absolute;inset:0;background:${c};color:${i===0?"#000":"#fff"};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${i===0?15:13}px;font-weight:700;box-shadow:0 3px 14px rgba(0,0,0,.4);border:${i===0?"3px solid #fff":"2px solid rgba(255,255,255,.35)"}">
            ${i + 1}
          </div>
          ${aqiMini}
        </div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });

      const popupHtml = `
        <b>#${i + 1} ${h.loc}</b><br>
        ₹${h.price}L · ${h.bhk} BHK · ${h.sqft} sqft<br>
        <span style="color:#5b8dee;font-size:11px">📍 ${h.dist} km to workplace</span>
        ${lvl ? `<br><span style="color:${aqiColor}">AQI ${h.aqiData.aqi} · ${lvl.label}</span>` : ""}
        <br><span style="color:#f0843a;font-size:10px">💧 Water: ${waterData.risk} risk${waterData.issues.length ? " — " + waterData.issues.join(", ") : ""}</span>
        <br><span style="color:#e05c5c;font-size:10px">🏥 ${fallback.hospital}</span>
        <br><span style="color:#1A3C5E;font-size:10px">🚔 ${fallback.police}</span>
        ${h.soc ? `<br><i style="font-size:10px">${h.soc}</i>` : ""}
      `;

      L.marker([h.jLat, h.jLng], { icon: houseIcon })
        .addTo(layer)
        .bindPopup(popupHtml);

      // ── OSRM road route ───────────────────────────────────────────────────
      fetch(`https://router.project-osrm.org/route/v1/driving/${company.lng},${company.lat};${h.jLng},${h.jLat}?overview=full&geometries=geojson`)
        .then(r => r.json())
        .then(data => {
          if (!isActive) return;
          if (data.routes?.length > 0) {
            L.geoJSON(data.routes[0].geometry, {
              style: { color: c, weight: i === 0 ? 6 : 4, opacity: 1.0 },
            }).addTo(layer);
          } else throw new Error();
        })
        .catch(() => {
          if (!isActive) return;
          L.polyline([[company.lat, company.lng], [h.jLat, h.jLng]], {
            color: c, weight: i === 0 ? 3 : 2, opacity: i === 0 ? 0.7 : 0.4, dashArray: "4 6",
          }).addTo(layer);
        });

      bounds.push([h.jLat, h.jLng]);

      // ── OSM: fetch nearest hospital & police for this house ───────────────
      // Only place one hospital/police marker per unique OSM location
      Promise.all([
        findNearestAmenity(h.jLat, h.jLng, "hospital"),
        findNearestAmenity(h.jLat, h.jLng, "police"),
      ]).then(([hospital, police]) => {
        if (!isActive) return;

        if (hospital) {
          const hKey = `${hospital.lat.toFixed(4)}_${hospital.lng.toFixed(4)}`;
          if (!placedHospitals.has(hKey)) {
            placedHospitals.add(hKey);
            L.marker([hospital.lat, hospital.lng], { icon: HOSPITAL_ICON })
              .addTo(svcLayer)
              .bindPopup(
                `<b>🏥 ${hospital.name}</b><br>` +
                `<span style="font-size:10px;color:#e05c5c">Nearest hospital to ${h.loc}</span>`
              );
          }
        }

        if (police) {
          const pKey = `${police.lat.toFixed(4)}_${police.lng.toFixed(4)}`;
          if (!placedPolice.has(pKey)) {
            placedPolice.add(pKey);
            L.marker([police.lat, police.lng], { icon: POLICE_ICON })
              .addTo(svcLayer)
              .bindPopup(
                `<b>🚔 ${police.name}</b><br>` +
                `<span style="font-size:10px;color:#1A3C5E">Nearest police station to ${h.loc}</span>`
              );
          }
        }
      });
    });

    map.fitBounds(bounds, { padding: [50, 50] });

    return () => { isActive = false; };
  }, [results, company]);

  return (
    <div style={{ position: "relative", flex: 1 }}>
      <style>{`@keyframes pulse{0%{transform:scale(1);opacity:.6;}70%{transform:scale(1.9);opacity:0;}100%{transform:scale(1.9);opacity:0;}}`}</style>
      <div ref={mapRef} style={{ width: "100%", height: "100%", minHeight: 320 }} />

      {/* Legend */}
      {results && results.length > 0 && (
        <div style={{
          position: "absolute", bottom: 10, left: 10, zIndex: 1000,
          background: "rgba(255,255,255,0.92)", borderRadius: 10, padding: "7px 10px",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)", fontSize: 11, display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#e05c5c", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>🏥</div>
            <span style={{ color: "#e05c5c", fontWeight: 600 }}>Hospital</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#1A3C5E", border: "2px solid #fff", boxShadow: "0 1px 4px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>🚔</div>
            <span style={{ color: "#1A3C5E", fontWeight: 600 }}>Police Station</span>
          </div>
        </div>
      )}

      {(!results || results.length === 0) && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(244,246,249,0.8)", zIndex: 1000, flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 40 }}>🗺️</div>
          <p style={{ color: "#7A8FA6", fontSize: 14 }}>Use the chat to get house recommendations, then they'll appear here!</p>
        </div>
      )}
    </div>
  );
}
