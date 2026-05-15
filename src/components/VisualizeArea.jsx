import React, { useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Legend, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { getWaterRisk, AREA_NOISE_LEVEL, COLORS, POLLUTANT_META, DISEASE_POLLUTANTS } from "../data/constants.js";

const AREA_STATIC_AQI = {
  "Yelahanka": 42, "Devanahalli": 45, "Kanakpura Road": 48, "Banashankari": 50, "Jayanagar": 52,
  "Jp Nagar": 53, "Bannerghatta Road": 54, "Electronic City": 58, "Electronics City Phase 1": 58,
  "Electronic City Phase Ii": 58, "Koramangala": 62, "Whitefield": 65, "Hsr Layout": 65,
  "Hebbal Kempapura": 68, "Thanisandra": 68, "Hennur Road": 70, "Bellandur": 72, "Indiranagar": 75,
  "Sarjapur Road": 78, "Hebbal": 80, "Rajaji Nagar": 85, "Malleshwaram": 88, "Vijayanagar": 90,
  "Hosur Road": 92, "Bommanahalli": 95, "Marathahalli": 105, "Mysore Road": 108, "Kr Puram": 125,
  "Old Madras Road": 130, "Yeshwanthpur": 140, "Magadi Road": 145, "Tumkur Road": 150, "Peenya": 165,
  "Bommasandra Industrial Area": 170,
};

function getAqi(loc) {
  if (!loc) return 80;
  const locLower = loc.toLowerCase();
  for (const [area, aqi] of Object.entries(AREA_STATIC_AQI)) {
    if (locLower.includes(area.toLowerCase())) return aqi;
  }
  return 80;
}

function getNoiseDb(loc) {
  if (!loc) return 60;
  const locLower = loc.toLowerCase();
  for (const [area, data] of Object.entries(AREA_NOISE_LEVEL || {})) {
    if (locLower.includes(area.toLowerCase())) return data.db;
  }
  return 60;
}

function generatePollutants(aqi, loc) {
  const jitter = (loc.length % 5) / 10;
  const factor = aqi / 150; 
  const raw = {
    pm25: factor * POLLUTANT_META.pm25.danger * (1 + jitter*0.2),
    pm10: factor * POLLUTANT_META.pm10.danger * (0.8 + jitter*0.3),
    no2:  factor * POLLUTANT_META.no2.danger * (0.5 + jitter*0.5),
    so2:  factor * POLLUTANT_META.so2.danger * (0.4 + jitter*0.6),
    o3:   factor * POLLUTANT_META.o3.danger * (0.6 + jitter*0.2),
    co:   factor * POLLUTANT_META.co.danger * (0.7 + jitter*0.4),
  };
  return raw;
}

function buildPollutantChartData(raw, avgRaw) {
  return Object.keys(raw).map(p => {
    const meta = POLLUTANT_META[p];
    const val = raw[p];
    const avgVal = avgRaw[p];
    const norm = Math.min(100, (val / meta.danger) * 70);
    const avgNorm = Math.min(100, (avgVal / meta.danger) * 70);
    return {
      subject: meta.label,
      Area: Math.round(norm),
      Bangalore: Math.round(avgNorm),
      rawValue: Math.round(val * 10) / 10,
      unit: meta.unit,
      danger: val >= meta.danger,
      warn: val >= meta.warn && val < meta.danger
    };
  });
}

function predictDiseases(rawPollutants) {
  const risks = [];
  for (const [disease, meta] of Object.entries(DISEASE_POLLUTANTS)) {
    const triggers = [];
    for (const p of meta.air) {
      if (rawPollutants[p] > POLLUTANT_META[p].warn) {
        triggers.push(POLLUTANT_META[p].label);
      }
    }
    if (triggers.length > 0) {
      const name = disease.charAt(0).toUpperCase() + disease.slice(1);
      risks.push({ name, triggers });
    }
  }
  return risks.slice(0, 2); // Top 2 diseases as requested
}

function getRecommendations(raw) {
  const isBadAir = raw.aqi > 100;
  const isBadNoise = raw.noise > 65;
  const isBadWater = raw.water === "HIGH" || raw.water === "MEDIUM";
  const society = []; const gov = []; const personal = [];
  if (isBadAir) {
    society.push("Organize carpooling groups to reduce local vehicular emissions.");
    society.push("Plant native broad-leaf trees in community spaces to act as dust screens.");
    gov.push("Implement strict emission checks for commercial vehicles passing through the area.");
    gov.push("Pave dirt roads and improve street sweeping to reduce re-suspended PM10 dust.");
    personal.push("Avoid outdoor exercise during peak traffic hours (8AM-11AM, 6PM-9PM).");
    personal.push("Use HEPA air purifiers indoors and keep windows closed on high-AQI days.");
  } else {
    society.push("Maintain existing green belts and parks to preserve the good air quality.");
  }
  if (isBadNoise) {
    society.push("Enforce strict silent hours (10 PM - 6 AM) within residential layouts.");
    gov.push("Install noise barriers along adjacent major highways or flyovers.");
    personal.push("Use acoustic sealants on windows and heavy curtains to block street noise.");
  }
  if (isBadWater) {
    society.push("Install community-level Reverse Osmosis (RO) or advanced filtration plants.");
    society.push("Implement strict rainwater harvesting to reduce dependence on contaminated groundwater.");
    gov.push("Upgrade local sewage treatment plants to prevent lake/groundwater contamination.");
    personal.push("Always boil or filter water before consumption. Do not rely solely on tap water.");
    personal.push("Check TDS levels regularly using a home TDS meter.");
  }
  if (society.length === 0) society.push("Continue community cleanliness drives to maintain the excellent environment.");
  if (gov.length === 0) gov.push("Regularly monitor local environment metrics to ensure they stay within safe limits.");
  if (personal.length === 0) personal.push("Enjoy the safe environment, but stay prepared for seasonal changes.");
  return { society, gov, personal };
}

const PollutantTooltip = ({ active, payload }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div style={{ background: "#fff", border: "1px solid #DDE3EC", padding: "10px", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
        <div style={{ fontWeight: 700, color: "#1C2B3A", marginBottom: 6 }}>{data.subject}</div>
        <div style={{ fontSize: 12, color: data.danger ? "#e05c5c" : data.warn ? "#f0843a" : "#4caf7d", fontWeight: 600 }}>
          Area: {data.rawValue} {data.unit}
        </div>
        <div style={{ fontSize: 11, color: "#7A8FA6", marginTop: 4 }}>
          {data.danger ? "⚠️ Dangerous Level" : data.warn ? "⚡ Warning Level" : "✅ Safe Level"}
        </div>
      </div>
    );
  }
  return null;
};

export default function VisualizeArea({ houses = [] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [analyzedArea, setAnalyzedArea] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const cityAnalysis = React.useMemo(() => {
    if (!houses.length) return { best: [], worst: [] };
    const counts = {};
    houses.forEach(h => { counts[h.loc] = (counts[h.loc] || 0) + 1; });
    const allData = Object.entries(AREA_STATIC_AQI).map(([area, aqi]) => ({
      area,
      aqi,
      housingCount: counts[area] || 0
    }));
    const sorted = [...allData].sort((a, b) => a.aqi - b.aqi);
    return {
      best: sorted.slice(0, 5),
      worst: sorted.slice(-5).reverse()
    };
  }, [houses]);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    const loc = searchQuery.trim();
    const aqi = getAqi(loc);
    const noise = getNoiseDb(loc);
    const water = getWaterRisk(loc);
    const normAqi = Math.min(100, (aqi / 150) * 100);
    const normNoise = Math.min(100, ((noise - 30) / 50) * 100);
    const normWater = water.risk === "HIGH" ? 100 : water.risk === "MEDIUM" ? 60 : 20;
    const rawPollutants = generatePollutants(aqi, loc);
    const avgRawPollutants = generatePollutants(80, "Bangalore");
    const pollutantChart = buildPollutantChartData(rawPollutants, avgRawPollutants);
    const diseases = predictDiseases(rawPollutants);
    const recommendations = getRecommendations({ aqi, noise, water: water.risk });

    setAnalyzedArea({
      name: loc,
      raw: { aqi, noise, water: water.risk, issues: water.issues },
      diseases,
      pollutantChart,
      recommendations,
      chartData: [
        { subject: 'Air Pollution (AQI)', Area: normAqi, Bangalore: 55, fullMark: 100 },
        { subject: 'Noise Pollution', Area: normNoise, Bangalore: 60, fullMark: 100 },
        { subject: 'Water Scarcity/Risk', Area: normWater, Bangalore: 50, fullMark: 100 },
      ]
    });
  };

  return (
    <div style={{ flex: 1, padding: "20px 16px", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, color: "#1A3C5E", marginBottom: 6, marginTop: 0 }}>Area Visualization</h2>
        <p style={{ fontSize: 13, color: "#7A8FA6", margin: 0 }}>
          Compare a specific neighborhood's environmental problems against the Bangalore average.
        </p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="e.g., Koramangala, Bellandur, Peenya"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          style={{ flex: 1, padding: "10px 14px", border: "1px solid #DDE3EC", borderRadius: 10, fontSize: 14, outline: "none" }}
        />
        <button
          onClick={handleSearch}
          style={{ padding: "0 20px", background: "#1A3C5E", color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer" }}
        >
          Analyze
        </button>
      </div>

      {analyzedArea ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EEF1F6", padding: 16 }}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, color: "#1C2B3A" }}>{analyzedArea.name} vs Bangalore</h3>
              <div style={{ fontSize: 12, color: "#7A8FA6", marginTop: 4 }}>Macro Environment (Larger area = Worse)</div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={analyzedArea.chartData}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#4B5563", fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name={analyzedArea.name} dataKey="Area" stroke="#E8A838" fill="#E8A838" fillOpacity={0.5} />
                  <Radar name="Bangalore Avg" dataKey="Bangalore" stroke="#4A7CAE" fill="#4A7CAE" fillOpacity={0.3} />
                  <Tooltip wrapperStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12, marginTop: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EEF1F6", padding: 16 }}>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <h3 style={{ margin: 0, color: "#1C2B3A" }}>Specific Pollutants</h3>
              <div style={{ fontSize: 12, color: "#7A8FA6", marginTop: 4 }}>PM2.5, PM10, Gases</div>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="65%" data={analyzedArea.pollutantChart}>
                  <PolarGrid stroke="#E5E7EB" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: "#4B5563", fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name={analyzedArea.name} dataKey="Area" stroke="#e05c5c" fill="#e05c5c" fillOpacity={0.4} />
                  <Radar name="Bangalore Avg" dataKey="Bangalore" stroke="#4caf7d" fill="#4caf7d" fillOpacity={0.2} />
                  <Tooltip content={<PollutantTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, marginTop: 10 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ background: "#FDF5F5", borderRadius: 16, border: "1px solid #FCD2D2", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 24 }}>🏥</span>
              <div>
                <h3 style={{ margin: 0, color: "#9B2C2C", fontSize: 15 }}>Potential Health Risks</h3>
                <div style={{ fontSize: 11, color: "#C53030" }}>Aggravated by local pollution levels</div>
              </div>
            </div>
            {analyzedArea.diseases.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {analyzedArea.diseases.map((d, i) => (
                  <div key={i} style={{ background: "#fff", padding: "10px 14px", borderRadius: 8, border: "1px solid #FCD2D2" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#9B2C2C", marginBottom: 4 }}>{d.name}</div>
                    <div style={{ fontSize: 11, color: "#E53E3E", display: "flex", alignItems: "center", gap: 6 }}>
                      <span>⚠️ Triggered by high:</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {d.triggers.map(t => (
                          <span key={t} style={{ background: "#FED7D7", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>{t}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: "#F0FFF4", padding: "12px", borderRadius: 8, border: "1px solid #9AE6B4", color: "#276749", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
                ✅ Pollution levels are within safe limits. No major respiratory or health risks predicted.
              </div>
            )}
          </div>

          <div style={{ background: "#F4F9F6", borderRadius: 16, border: "1px solid #D1E8DB", padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 24 }}>💡</span>
              <div>
                <h3 style={{ margin: 0, color: "#1E5631", fontSize: 15 }}>Actionable Recommendations</h3>
                <div style={{ fontSize: 11, color: "#2E8540" }}>Targeted advice to improve the environment</div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ background: "#fff", padding: "12px", borderRadius: 8, border: "1px solid #D1E8DB" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B3A", marginBottom: 6 }}>🛡️ Personal Precautions</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#4B5563", lineHeight: 1.6 }}>
                  {analyzedArea.recommendations.personal.map((rec, i) => <li key={i}>{rec}</li>)}
                </ul>
              </div>
              <div style={{ background: "#fff", padding: "12px", borderRadius: 8, border: "1px solid #D1E8DB" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B3A", marginBottom: 6 }}>🤝 As a Society / Community</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#4B5563", lineHeight: 1.6 }}>
                  {analyzedArea.recommendations.society.map((rec, i) => <li key={i}>{rec}</li>)}
                </ul>
              </div>
              <div style={{ background: "#fff", padding: "12px", borderRadius: 8, border: "1px solid #D1E8DB" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2B3A", marginBottom: 6 }}>🏛️ Government Intervention</div>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "#4B5563", lineHeight: 1.6 }}>
                  {analyzedArea.recommendations.gov.map((rec, i) => <li key={i}>{rec}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", opacity: 0.5 }}>
          <div style={{ fontSize: 48, marginBottom: 10 }}>🕸️</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Enter a neighborhood to visualize</div>
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center", paddingBottom: 20 }}>
        <button
          onClick={() => setShowModal(true)}
          style={{ width: "100%", padding: "14px", background: "#fff", color: "#1A3C5E", border: "2px solid #1A3C5E", borderRadius: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
        >
          📊 Complete Analysis
        </button>
      </div>

      {showModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "#fff", width: "100%", maxWidth: 600, maxHeight: "90vh", borderRadius: 20, overflowY: "auto", position: "relative", padding: "30px 20px" }}>
            <button onClick={() => setShowModal(false)} style={{ position: "absolute", top: 15, right: 15, background: "none", border: "none", fontSize: 24, cursor: "pointer" }}>✕</button>
            <h2 style={{ textAlign: "center", color: "#1A3C5E", marginBottom: 20 }}>City-Wide AQI Analysis</h2>
            <div style={{ marginBottom: 30 }}>
              <h4 style={{ color: "#2D9B6F", marginBottom: 10 }}>🌟 Top 5 Cleanest Areas (Lowest AQI)</h4>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cityAnalysis.best} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="area" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={36}/>
                    <Line yAxisId="left" type="monotone" dataKey="aqi" stroke="#2D9B6F" name="AQI Level" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="housingCount" stroke="#4A7CAE" name="Housing Count" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <h4 style={{ color: "#C94040", marginBottom: 10 }}>⚠️ Top 5 Most Polluted Areas (Highest AQI)</h4>
              <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={cityAnalysis.worst} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="area" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend verticalAlign="top" height={36}/>
                    <Line yAxisId="left" type="monotone" dataKey="aqi" stroke="#C94040" name="AQI Level" strokeWidth={2} />
                    <Line yAxisId="right" type="monotone" dataKey="housingCount" stroke="#4A7CAE" name="Housing Count" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <button onClick={() => setShowModal(false)} style={{ width: "100%", marginTop: 25, padding: "12px", background: "#1A3C5E", color: "#fff", border: "none", borderRadius: 10, fontWeight: 600, cursor: "pointer" }}>Close Analysis</button>
          </div>
        </div>
      )}
    </div>
  );
}
