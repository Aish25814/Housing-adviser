import { useState, useEffect } from "react";
import {
  COLORS, AQI_LEVELS, POLLUTANT_META, AREA_NOISE_LEVEL,
  WATER_RISKS, getWaterRisk,
} from "../data/constants.js";

// ── Helpers ───────────────────────────────────────────────────────────────────
function aqiLevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS.at(-1);
}

function noiseForLoc(loc) {
  if (!loc) return { level: "Medium", db: 60, desc: "Typical urban noise level" };
  for (const [area, info] of Object.entries(AREA_NOISE_LEVEL)) {
    if (loc.toLowerCase().includes(area.toLowerCase())) return info;
  }
  return { level: "Medium", db: 60, desc: "Typical urban noise level" };
}

function waterForLoc(loc) {
  const raw = getWaterRisk(loc);
  // getWaterRisk returns { risk: "HIGH"|"MEDIUM"|"LOW", issues: [...] }
  const meta = {
    HIGH:   { score: 30, color: "#e05c5c", desc: "Industrial runoff or groundwater contamination reported in this area." },
    MEDIUM: { score: 60, color: "#e8c84a", desc: "Generally safe but occasional TDS/hardness issues reported." },
    LOW:    { score: 90, color: "#4caf7d", desc: "Water supply meets standard safety parameters." },
  };
  const m = meta[raw.risk] || meta.LOW;
  return { ...raw, ...m };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function EnvBar({ label, value, max, color, unit = "" }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: COLORS.text, marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700, color }}>{value}{unit}</span>
      </div>
      <div style={{ background: "#EEF1F6", borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function ScoreBadge({ label, value, color, icon }) {
  return (
    <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 10px", textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 10, color: COLORS.muted, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AreaReport({ house, houses, onBack }) {
  const [airData, setAirData] = useState(null);
  const [airLoading, setAirLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState(() => localStorage.getItem("waqi_token") || "");
  const [waqiToken, setWaqiToken] = useState(() => localStorage.getItem("waqi_token") || "");

  // Derived client-side data — no backend needed
  const noiseInfo  = noiseForLoc(house.loc);
  const waterInfo  = waterForLoc(house.loc);
  const noiseColor = { Low: "#4caf7d", Medium: "#e8c84a", High: "#e05c5c" }[noiseInfo.level] || COLORS.muted;

  // House count stats from the full houses array
  const areaHouses = houses
    ? houses.filter(h => h.loc?.toLowerCase() === house.loc?.toLowerCase())
    : [];
  const houseStats = areaHouses.length > 0 ? {
    total:    areaHouses.length,
    avgPrice: (areaHouses.reduce((s, h) => s + h.price, 0) / areaHouses.length).toFixed(1),
    minPrice: Math.min(...areaHouses.map(h => h.price)).toFixed(1),
    maxPrice: Math.max(...areaHouses.map(h => h.price)).toFixed(1),
    avgSqft:  Math.round(areaHouses.reduce((s, h) => s + h.sqft, 0) / areaHouses.length),
  } : null;

  // ── Fetch WAQI live AQI ───────────────────────────────────────────────────
  const fetchAqi = async (token) => {
    if (!token) return;
    setAirLoading(true);
    try {
      const res  = await fetch(`https://api.waqi.info/feed/geo:${house.lat};${house.lng}/?token=${token}`);
      const json = await res.json();
      if (json.status === "ok") {
        const d    = json.data;
        const aqi  = d.aqi;
        const iaqi = d.iaqi || {};
        const lvl  = aqiLevel(aqi);
        setAirData({
          aqi,
          label:       lvl.label,
          color:       lvl.color,
          description: `AQI ${aqi} — ${lvl.label}. ${aqi > 100 ? "Sensitive groups should limit outdoor activity." : "Air quality is acceptable for most people."}`,
          components: {
            pm2_5: iaqi.pm25?.v ?? null,
            pm10:  iaqi.pm10?.v ?? null,
            no2:   iaqi.no2?.v  ?? null,
            so2:   iaqi.so2?.v  ?? null,
            o3:    iaqi.o3?.v   ?? null,
            co:    iaqi.co?.v   ?? null,
          },
          live: true,
          source: "WAQI (World Air Quality Index) — live",
        });
      }
    } catch (_) { /* token invalid or network issue — stay on static */ }
    setAirLoading(false);
  };

  useEffect(() => { fetchAqi(waqiToken); }, [house]);

  const saveToken = () => {
    const t = tokenInput.trim();
    localStorage.setItem("waqi_token", t);
    setWaqiToken(t);
    fetchAqi(t);
  };

  // Static fallback air data from house object (set by RAGChatBot via WAQI or hardcoded)
  const staticAir = house.airQuality
    ? { ...house.airQuality, live: false, source: "Cached area AQI data" }
    : null;

  const air = airData || staticAir;

  const getNoiseIcon = (l) => ({ Low: "🔇", Medium: "🔉", High: "🔊" }[l] || "🔉");
  const getAirIcon   = (l) => ({
    Good: "😊", Moderate: "🙂", "Unhealthy (Sensitive)": "😐",
    Unhealthy: "😷", "Very Unhealthy": "🤢", Hazardous: "☠️",
  }[l] || "😐");
  const getWaterIcon = (r) => ({ LOW: "💧", MEDIUM: "🚰", HIGH: "⚠️" }[r] || "💧");

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <div style={{ background: COLORS.primary, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 16 }}>📊 Area Report</div>
          <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 12 }}>{house.loc} · {house.bhk} BHK · ₹{Math.round(house.price * 100)}K</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px" }}>

        {/* WAQI token input */}
        {!airData && (
          <div style={{ background: "#FFF8E1", border: "1px solid #FFE082", borderRadius: 10, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#F57F17", marginBottom: 4 }}>
              🔑 {waqiToken ? (airLoading ? "Fetching live AQI…" : "Token saved — reconnect to refresh") : "Connect WAQI for live AQI"}
            </div>
            <div style={{ fontSize: 11, color: "#7A6000", marginBottom: 8 }}>
              Same token as map.html. Free at{" "}
              <a href="https://aqicn.org/data-platform/token/" target="_blank" rel="noreferrer" style={{ color: "#1A5C9E" }}>
                aqicn.org/data-platform/token
              </a>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && saveToken()}
                placeholder="Paste WAQI token…"
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12, background: COLORS.inputBg, outline: "none" }}
              />
              <button onClick={saveToken} disabled={airLoading} style={{ padding: "8px 14px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                {airLoading ? "…" : "Connect"}
              </button>
            </div>
          </div>
        )}

        {/* Live status badge */}
        <div style={{ background: airData ? "#E8F5E9" : "#F4F6F9", border: `1px solid ${airData ? "#A5D6A7" : COLORS.border}`, borderRadius: 10, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: airData ? "#2E7D32" : COLORS.muted }}>
          {airData ? "🟢 Live AQI from WAQI API (same as map.html)" : "🟡 Showing cached/static AQI — connect WAQI token above for live data"}
        </div>

        {/* House count summary */}
        {houseStats && (
          <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.primary, marginBottom: 10 }}>🏘️ Housing in {house.loc}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { label: "Total Listings", val: houseStats.total.toLocaleString(),                                    icon: "🏠" },
                { label: "Avg Price",      val: `₹${houseStats.avgPrice}L`,                                           icon: "💰" },
                { label: "Price Range",    val: `₹${houseStats.minPrice}L – ₹${houseStats.maxPrice}L`,                icon: "📊" },
                { label: "Avg Size",       val: `${houseStats.avgSqft} sqft`,                                         icon: "📐" },
              ].map(({ label, val, icon }) => (
                <div key={label} style={{ background: "#F4F6F9", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, color: COLORS.muted }}>{icon} {label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text, marginTop: 2 }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Score badges */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <ScoreBadge
            label="Air Quality"
            value={air ? air.label : "—"}
            color={air ? air.color : COLORS.muted}
            icon={getAirIcon(air?.label)}
          />
          <ScoreBadge
            label="Water Risk"
            value={waterInfo.risk}
            color={waterInfo.color}
            icon={getWaterIcon(waterInfo.risk)}
          />
          <ScoreBadge
            label="Noise"
            value={noiseInfo.level}
            color={noiseColor}
            icon={getNoiseIcon(noiseInfo.level)}
          />
        </div>

        {/* Air Quality Detail */}
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.primary }}>💨 Air Quality Index</div>
            {air && (
              <span style={{ background: air.color + "22", color: air.color, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
                AQI {air.aqi} · {air.label}
              </span>
            )}
          </div>

          {air ? (
            <>
              <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.5 }}>{air.description}</p>
              {/* AQI gradient gauge */}
              <div style={{ position: "relative", height: 8, borderRadius: 4, background: "linear-gradient(90deg,#4caf7d,#e8c84a,#f0843a,#e05c5c,#9b5de5,#7d2e2e)", marginBottom: 14 }}>
                <div style={{ position: "absolute", top: -4, left: `${Math.min(98, (air.aqi / 500) * 100)}%`, width: 3, height: 16, background: "#fff", borderRadius: 2, transform: "translateX(-50%)", boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }} />
              </div>

              {/* Pollutant breakdown — only shown when live WAQI data available */}
              {air.components && Object.values(air.components).some(v => v != null) && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.text, marginBottom: 8 }}>Pollutant Breakdown</div>
                  {Object.entries(air.components).map(([key, val]) => {
                    if (val == null) return null;
                    const meta = POLLUTANT_META[key === "pm2_5" ? "pm25" : key];
                    if (!meta) return null;
                    const color = val >= meta.danger ? "#e05c5c" : val >= meta.warn ? "#f0843a" : "#4caf7d";
                    return <EnvBar key={key} label={`${meta.label} (${meta.who})`} value={val} max={meta.max} color={color} unit={` ${meta.unit}`} />;
                  })}
                </>
              )}
              <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>Source: {air.source}</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: COLORS.muted, padding: "10px 0" }}>
              {airLoading ? "Fetching live AQI…" : "Connect WAQI token above to see live air quality data."}
            </div>
          )}
        </div>

        {/* Water Quality Detail */}
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.primary }}>💧 Water Quality</div>
            <span style={{ background: waterInfo.color + "22", color: waterInfo.color, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
              {waterInfo.risk} RISK
            </span>
          </div>
          <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.5 }}>{waterInfo.desc}</p>

          {waterInfo.issues?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {waterInfo.issues.map(issue => (
                <span key={issue} style={{ background: "#FFF0F0", color: "#C94040", border: "1px solid #FFCDD2", borderRadius: 6, padding: "3px 8px", fontSize: 11 }}>⚠️ {issue}</span>
              ))}
            </div>
          )}

          <EnvBar label="Water Safety Score" value={waterInfo.score} max={100} color={waterInfo.color} unit="%" />
          <div style={{ fontSize: 11, color: COLORS.muted }}>Source: BWSSB / local water quality reports</div>
        </div>

        {/* Noise Level Detail */}
        <div style={{ background: COLORS.white, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.primary }}>🔊 Noise Level</div>
            <span style={{ background: noiseColor + "22", color: noiseColor, borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
              {noiseInfo.level} · ~{noiseInfo.db} dB
            </span>
          </div>
          <p style={{ fontSize: 12, color: COLORS.muted, marginBottom: 10, lineHeight: 1.5 }}>{noiseInfo.desc}</p>
          <EnvBar label="Estimated Noise Level" value={noiseInfo.db} max={90} color={noiseColor} unit=" dB" />
          <div style={{
            background: noiseInfo.db > 55 ? "#FFF0F0" : "#F0FFF4",
            border: `1px solid ${noiseInfo.db > 55 ? "#FFCDD2" : "#A5D6A7"}`,
            borderRadius: 8, padding: "8px 10px", fontSize: 12,
            color: noiseInfo.db > 55 ? COLORS.danger : COLORS.success,
          }}>
            {noiseInfo.db > 55
              ? "⚠️ Exceeds WHO recommended limit of 55 dB for residential areas"
              : "✅ Within WHO recommended limit of 55 dB for residential areas"}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 8 }}>Source: CPCB Bengaluru urban noise survey estimates</div>
        </div>

        {/* Summary */}
        <div style={{ background: COLORS.primary, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", marginBottom: 8 }}>📋 Summary for {house.loc}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", lineHeight: 1.9 }}>
            {air && <div>💨 Air: {air.label} (AQI {air.aqi}){air.live ? " 🟢 live" : ""}</div>}
            <div>💧 Water: {waterInfo.risk} risk{waterInfo.issues?.length ? ` — ${waterInfo.issues.join(", ")}` : ""}</div>
            <div>🔊 Noise: {noiseInfo.level} (~{noiseInfo.db} dB)</div>
            {houseStats && <div>🏠 {houseStats.total} listings · avg ₹{houseStats.avgPrice}L</div>}
          </div>
        </div>

        <div style={{ fontSize: 11, color: COLORS.muted, textAlign: "center", paddingBottom: 20 }}>
          Air: WAQI API · Water: BWSSB reports · Noise: CPCB estimates
        </div>
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}
