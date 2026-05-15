import { useState, useRef, useEffect } from "react";
import {
  COMPANIES, COLORS, AQI_LEVELS, AREA_NOISE_LEVEL,
  parseHealthConditions, computeHealthPenalty,
} from "../data/constants.js";
import { retrieveCandidates, getStaticAqi } from "../data/houseData.js";

const CHAT_STEPS = [
  { key: "area",      question: "Welcome! 🏠 I'm your smart house-finding assistant. Let's find your perfect home in Bangalore!\n\nWhich area of Bangalore are you looking to rent in?\n(e.g., Koramangala, Indiranagar, Whitefield, Jayanagar, or 'anywhere')" },
  { key: "budget",    question: "Great choice! 💰 What is your monthly rent budget?\n\nPlease share a range like '10-20 lakhs' or a max amount like 'under 15 lakhs'." },
  { key: "bhk",       question: "Perfect! 🛏️ How many bedrooms do you need?\n(1BHK / 2BHK / 3BHK / 4BHK or more)" },
  { key: "amenities", question: "Nice! 🏊 What amenities are important to you?\n\nChoose from: AC, Parking, Gym, Swimming Pool, Garden, Lift, Security, Power Backup.\n\n(You can list multiple, or say 'basic only')" },
  { key: "health",    question: "Almost there! 🏥 Do you have any health considerations?\n\nSupported: asthma, COPD, heart condition, kidney issues, allergy, neurological, respiratory, cancer risk.\n\n(Or type 'none' if not applicable)" },
  { key: "company",   question: "Last question! 🏢 What is the location of your workplace/office in Bangalore?\n\n(e.g., Koramangala, Electronic City, Whitefield — or type 'not applicable')" },
];

// ── Noise helper ──────────────────────────────────────────────────────────────
export function getNoiseLevel(loc) {
  if (!loc) return { level: 58, label: "Moderate", color: "#e8c84a", desc: "Average urban noise" };
  for (const [area, data] of Object.entries(AREA_NOISE_LEVEL)) {
    if (loc.toLowerCase().includes(area.toLowerCase()))
      return {
        level: data.db,
        label: data.level,
        color: { Low: "#4caf7d", Medium: "#e8c84a", High: "#e05c5c" }[data.level] || "#e8c84a",
        desc: data.desc,
      };
  }
  return { level: 58, label: "Moderate", color: "#e8c84a", desc: "Average urban noise" };
}

// ── AQI helpers ───────────────────────────────────────────────────────────────
function aqiLevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS.at(-1);
}

const _waqiCache = {};

async function fetchWaqiAqi(lat, lng, loc) {
  if (_waqiCache[loc]) return _waqiCache[loc];
  const token = localStorage.getItem("waqi_token") || "";
  if (!token) return { aqi: 70, pm25: null, label: "Moderate", color: "#e8c84a", live: false, iaqi: {} };
  try {
    const res  = await fetch(`https://api.waqi.info/feed/geo:${lat};${lng}/?token=${token}`);
    const json = await res.json();
    if (json.status === "ok") {
      const aqi  = json.data.aqi;
      const iaqi = json.data.iaqi || {};
      const lvl  = aqiLevel(aqi);
      const result = { aqi, pm25: iaqi.pm25?.v ?? null, label: lvl.label, color: lvl.color, live: true, iaqi };
      _waqiCache[loc] = result;
      return result;
    }
  } catch (_) {}
  return { aqi: 70, pm25: null, label: "Moderate", color: "#e8c84a", live: false, iaqi: {} };
}

export function getAirQuality() {
  return { aqi: 70, pm25: null, label: "Moderate", color: "#e8c84a", live: false, iaqi: {} };
}

// ── Budget / BHK parsers ──────────────────────────────────────────────────────
function parseBudget(text) {
  const t = text.toLowerCase().replace(/lakhs?|lakh|₹|,/gi, "").trim();
  const range = t.match(/(\d+\.?\d*)\s*[-–to]+\s*(\d+\.?\d*)/);
  if (range) return { budgetMin: parseFloat(range[1]), budgetMax: parseFloat(range[2]) };
  const under = t.match(/under\s+(\d+\.?\d*)|less\s+than\s+(\d+\.?\d*)|<\s*(\d+\.?\d*)/);
  if (under) return { budgetMin: 0, budgetMax: parseFloat(under[1] || under[2] || under[3]) };
  const num = t.match(/(\d+\.?\d*)/);
  if (num) return { budgetMin: 0, budgetMax: parseFloat(num[1]) };
  return { budgetMin: 0, budgetMax: 9999 };
}

function parseBhk(text) {
  const nums = [...text.matchAll(/(\d+)/g)].map(m => parseInt(m[1]));
  const list = nums.map(n => n >= 5 ? 5 : n).filter(n => n >= 1 && n <= 5);
  return list.length > 0 ? list : [1, 2, 3, 4, 5];
}

function findCompany(text) {
  const t = text.toLowerCase();
  return COMPANIES.find(c => t.includes(c.name.toLowerCase()) || t.includes(c.area.toLowerCase())) || null;
}

// ── Health-aware scoring ──────────────────────────────────────────────────────
function scoreHouse(house, conditions) {
  const distScore     = 1 / (house.dist + 0.1);
  const healthPenalty = computeHealthPenalty(house, conditions, house.airQuality, house.noiseLevel?.level);
  return distScore * (1 - healthPenalty);
}

function buildSummary(top5, conditions) {
  if (conditions.length === 0) {
    return `Found ${top5.length} homes sorted by proximity to your workplace and water safety.`;
  }
  const condStr = conditions.join(", ");
  const best  = top5[0];
  const aqi   = best.airQuality?.aqi ?? "—";
  const noise = best.noiseLevel?.level ?? "—";
  return `Top results prioritise low AQI, safe water, and low noise for your condition(s): ${condStr}. Best match: ${best.loc} (AQI ${aqi}, noise ~${noise} dB, ${best.dist} km from workplace).`;
}

const HEALTH_TIPS = {
  asthma:       "Carry rescue inhaler. Avoid peak traffic hours (8–10 am, 6–9 pm). Use HEPA air purifier indoors.",
  copd:         "Prefer AC car over two-wheeler. Avoid construction zones and industrial areas.",
  heart:        "PM2.5 raises cardiac risk. Avoid morning outdoor exercise on high-AQI days.",
  respiratory:  "Use N95 mask when AQI > 100. Steam inhalation may help on bad air days.",
  allergy:      "Check pollen + AQI daily. Keep windows closed on high-AQI days.",
  neurological: "Use certified water filter. Avoid areas near e-waste zones.",
  kidney:       "Avoid borewell water. Use RO+UV filter. Annual kidney function test recommended.",
  cancer:       "Chronic PM2.5 > 35 µg/m³ raises lung cancer risk. Use HEPA purifier.",
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function RAGChatBot({ houses, onResults }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: CHAT_STEPS[0].question }]);
  const [input, setInput]       = useState("");
  const [step, setStep]         = useState(0);
  const [prefs, setPrefs]       = useState({});
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const analyzeWithRAG = async (allPrefs) => {
    setLoading(true);

    // 1. Parse preferences
    const workplaceInput  = allPrefs.company || "";
    const isNA            = /not applicable|n\/a|na|none/i.test(workplaceInput);
    const company         = isNA ? null : findCompany(workplaceInput);
    const { budgetMin, budgetMax } = parseBudget(allPrefs.budget || "0-9999");
    const bhkList         = parseBhk(allPrefs.bhk || "1 2 3");
    const areaKeyword     = (allPrefs.area || "").toLowerCase() === "anywhere" ? "" : allPrefs.area;
    const companyCoords   = company || { lat: 12.9716, lng: 77.5946, name: workplaceInput || "Bangalore", area: workplaceInput || "CBD" };
    const conditions      = parseHealthConditions(allPrefs.health || "");

    console.log("[RAG] conditions:", conditions);

    // 2. Retrieve candidates
    let candidates = retrieveCandidates(houses, { budgetMin, budgetMax, bhkList, areaKeyword }, companyCoords, 40);
    if (candidates.length === 0)
      candidates = retrieveCandidates(houses, { budgetMin: 0, budgetMax: 9999, bhkList: [], areaKeyword: "" }, companyCoords, 40);

    // 3. Attach noise (instant, client-side)
    const withNoise = candidates.map(h => ({ ...h, noiseLevel: getNoiseLevel(h.loc) }));

    // 4. Fetch live WAQI AQI in parallel
    const aqiResults = await Promise.all(withNoise.map(h => fetchWaqiAqi(h.lat, h.lng, h.loc)));
    const withAqi    = withNoise.map((h, i) => ({ ...h, airQuality: aqiResults[i] }));

    // 5. Health-aware scoring & sort
    const scored = withAqi
      .map(h => ({ ...h, finalScore: scoreHouse(h, conditions) }))
      .sort((a, b) => b.finalScore - a.finalScore);

    const top5   = scored.slice(0, 5);
    const summary = buildSummary(top5, conditions);
    const tips    = conditions.length > 0
      ? conditions.map(c => HEALTH_TIPS[c]).filter(Boolean)
      : ["Check water quality before finalising.", "Visit during peak hours to assess noise.", "Confirm distance to nearest hospital."];

    onResults(top5, companyCoords);
    setMessages(prev => [...prev, {
      role: "assistant",
      text: `✅ Found your top 5 homes!\n\n${summary}\n\n💡 Health Tips:\n${tips.map(t => `• ${t}`).join("\n")}`,
    }]);

    setDone(true);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg  = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", text: userMsg }];
    const newPrefs    = { ...prefs, [CHAT_STEPS[step].key]: userMsg };
    setPrefs(newPrefs);

    const nextStep = step + 1;
    if (nextStep < CHAT_STEPS.length) {
      setMessages([...newMessages, { role: "assistant", text: CHAT_STEPS[nextStep].question }]);
      setStep(nextStep);
    } else {
      setMessages([...newMessages, { role: "assistant", text: "🔍 Analysing your requirements — checking air quality, noise levels, water safety, and distance to your workplace…" }]);
      setStep(nextStep);
      await analyzeWithRAG(newPrefs);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: 420 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 13px",
              borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              background: msg.role === "user" ? COLORS.primary : "#EEF1F6",
              color: msg.role === "user" ? "#fff" : COLORS.text,
              fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
            }}>{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: 10 }}>
            {[0,1,2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.primary, animation: `bounce 1s ${i*0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!done && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 8 }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Type your answer..." disabled={loading}
            style={{ flex: 1, padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, outline: "none", background: COLORS.inputBg }}
          />
          <button onClick={handleSend} disabled={loading}
            style={{ padding: "10px 16px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 16 }}>➤</button>
        </div>
      )}

      {done && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
          <button
            onClick={() => { setDone(false); setStep(0); setPrefs({}); setMessages([{ role: "assistant", text: CHAT_STEPS[0].question }]); }}
            style={{ padding: "8px 20px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
            🔄 Start New Search
          </button>
        </div>
      )}
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}
