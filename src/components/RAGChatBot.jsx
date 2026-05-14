import { useState, useRef, useEffect } from "react";
import { ANTHROPIC_MODEL, COMPANIES, COLORS } from "../data/constants.js";
import { retrieveCandidates } from "../data/houseData.js";

const CHAT_STEPS = [
  { key: "area",        question: "Welcome! 🏠 I'm your smart house-finding assistant. Let's find your perfect home in Bangalore!\n\nWhich area of Bangalore are you looking to rent in?\n(e.g., Koramangala, Indiranagar, Whitefield, Jayanagar, or 'anywhere')" },
  { key: "budget",      question: "Great choice! 💰 What is your monthly rent budget?\n\nPlease share a range like '10-20 lakhs' or a max amount like 'under 15 lakhs'." },
  { key: "bhk",         question: "Perfect! 🛏️ How many bedrooms do you need?\n(1BHK / 2BHK / 3BHK / 4BHK or more)" },
  { key: "amenities",   question: "Nice! 🏊 What amenities are important to you?\n\nChoose from: AC, Parking, Gym, Swimming Pool, Garden, Lift, Security, Power Backup.\n\n(You can list multiple, or say 'basic only')" },
  { key: "health",      question: "Almost there! 🏥 Do you have any health considerations? For example:\n• Need to be near a specific hospital\n• Family member with special needs\n• Prefer low pollution areas\n\n(Or type 'none' if not applicable)" },
  { key: "company",     question: "Last question! 🏢 What is the location of your workplace/office in Bangalore? I'll calculate distances for you.\n\n(e.g., Koramangala, Electronic City, Whitefield — or type 'not applicable')" },
];

// ── Noise levels by area (simulated based on Bangalore zones) ──
const NOISE_LEVELS = {
  "Electronic City":   { level: 55, label: "Moderate", color: "#e8c84a", desc: "IT corridor, moderate traffic" },
  "Whitefield":        { level: 62, label: "Moderate", color: "#e8c84a", desc: "Growing area, construction noise" },
  "Koramangala":       { level: 68, label: "High",     color: "#f0843a", desc: "Busy commercial + nightlife zone" },
  "Indiranagar":       { level: 65, label: "High",     color: "#f0843a", desc: "Restaurant hub, evening noise" },
  "MG Road":           { level: 72, label: "High",     color: "#e05c5c", desc: "Peak commercial district" },
  "Jayanagar":         { level: 50, label: "Low",      color: "#4caf7d", desc: "Quiet residential locality" },
  "Marathahalli":      { level: 70, label: "High",     color: "#f0843a", desc: "ORR traffic congestion" },
  "HSR Layout":        { level: 52, label: "Low",      color: "#4caf7d", desc: "Planned layout, parks nearby" },
  "Sarjapur":          { level: 48, label: "Low",      color: "#4caf7d", desc: "Suburban, peaceful" },
  "Hebbal":            { level: 60, label: "Moderate", color: "#e8c84a", desc: "Flyover area, moderate traffic" },
  "Banashankari":      { level: 53, label: "Low",      color: "#4caf7d", desc: "Residential, temple area" },
  "Rajajinagar":       { level: 58, label: "Moderate", color: "#e8c84a", desc: "Old Bangalore, moderate" },
  "Yelahanka":         { level: 45, label: "Low",      color: "#4caf7d", desc: "Near air force base, quiet" },
  "Bellandur":         { level: 64, label: "Moderate", color: "#e8c84a", desc: "IT hub, traffic on ORR" },
  "Bommanahalli":      { level: 66, label: "High",     color: "#f0843a", desc: "Highway proximity, noisy" },
};

// ── Air quality by area (simulated) ──
const AIR_QUALITY = {
  "Electronic City":   { aqi: 82,  pm25: 34, label: "Moderate",   color: "#e8c84a" },
  "Whitefield":        { aqi: 95,  pm25: 42, label: "Moderate",   color: "#e8c84a" },
  "Koramangala":       { aqi: 78,  pm25: 30, label: "Moderate",   color: "#e8c84a" },
  "Indiranagar":       { aqi: 75,  pm25: 28, label: "Moderate",   color: "#e8c84a" },
  "MG Road":           { aqi: 110, pm25: 52, label: "Unhealthy (Sensitive)", color: "#f0843a" },
  "Jayanagar":         { aqi: 55,  pm25: 18, label: "Moderate",   color: "#e8c84a" },
  "Marathahalli":      { aqi: 120, pm25: 58, label: "Unhealthy (Sensitive)", color: "#f0843a" },
  "HSR Layout":        { aqi: 60,  pm25: 20, label: "Moderate",   color: "#e8c84a" },
  "Sarjapur":          { aqi: 88,  pm25: 36, label: "Moderate",   color: "#e8c84a" },
  "Hebbal":            { aqi: 72,  pm25: 26, label: "Moderate",   color: "#e8c84a" },
  "Banashankari":      { aqi: 48,  pm25: 15, label: "Good",       color: "#4caf7d" },
  "Rajajinagar":       { aqi: 65,  pm25: 22, label: "Moderate",   color: "#e8c84a" },
  "Yelahanka":         { aqi: 42,  pm25: 12, label: "Good",       color: "#4caf7d" },
  "Bellandur":         { aqi: 105, pm25: 48, label: "Unhealthy (Sensitive)", color: "#f0843a" },
  "Bommanahalli":      { aqi: 98,  pm25: 44, label: "Moderate",   color: "#e8c84a" },
};

export function getNoiseLevel(loc) {
  if (!loc) return { level: 58, label: "Moderate", color: "#e8c84a", desc: "Average urban noise" };
  for (const [area, data] of Object.entries(NOISE_LEVELS)) {
    if (loc.toLowerCase().includes(area.toLowerCase())) return data;
  }
  return { level: 58, label: "Moderate", color: "#e8c84a", desc: "Average urban noise" };
}

export function getAirQuality(loc) {
  if (!loc) return { aqi: 70, pm25: 25, label: "Moderate", color: "#e8c84a" };
  for (const [area, data] of Object.entries(AIR_QUALITY)) {
    if (loc.toLowerCase().includes(area.toLowerCase())) return data;
  }
  return { aqi: 70, pm25: 25, label: "Moderate", color: "#e8c84a" };
}

function parseBudget(text) {
  // User gives budget in Lakhs (e.g. "10-20 lakhs", "under 15 lakhs", "50")
  // CSV price column is also in Lakhs — direct comparison works.
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

export default function RAGChatBot({ houses, onResults }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: CHAT_STEPS[0].question }]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [prefs, setPrefs] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const analyzeWithRAG = async (allPrefs) => {
    setLoading(true);

    const workplaceInput = allPrefs.company || "";
    const isNotApplicable = /not applicable|n\/a|na|none/i.test(workplaceInput);
    const company = isNotApplicable ? null : findCompany(workplaceInput);
    const { budgetMin, budgetMax } = parseBudget(allPrefs.budget || "0-9999");
    const bhkList = parseBhk(allPrefs.bhk || "1 2 3");
    const areaKeyword = (allPrefs.area || "").toLowerCase() === "anywhere" ? "" : allPrefs.area;
    const companyCoords = company || { lat: 12.9716, lng: 77.5946, name: workplaceInput || "Bangalore", area: workplaceInput || "CBD" };

    console.log("[RAG] prefs:", allPrefs);
    console.log("[RAG] houses available:", houses.length);
    console.log("[RAG] budget:", budgetMin, "–", budgetMax);
    console.log("[RAG] bhkList:", bhkList);
    console.log("[RAG] areaKeyword:", areaKeyword);

    // Always get candidates — if budget/area filter yields nothing, fall back to no filters
    let candidates = retrieveCandidates(houses, { budgetMin, budgetMax, bhkList, areaKeyword }, companyCoords, 20);
    console.log("[RAG] candidates after filter:", candidates.length);

    if (candidates.length === 0) {
      // Relax all filters — just get closest 20 houses
      candidates = retrieveCandidates(houses, { budgetMin: 0, budgetMax: 9999, bhkList: [], areaKeyword: "" }, companyCoords, 20);
      console.log("[RAG] candidates after relaxed filter:", candidates.length);
    }

    const top20 = candidates.slice(0, 20).map(h => ({
      ...h,
      airQuality: getAirQuality(h.loc),
      noiseLevel: getNoiseLevel(h.loc),
    }));

    console.log("[RAG] top20:", top20.length);

    // Always call onResults with whatever we have — even if AI fails
    const fallbackTop5 = top20.slice(0, 5);

    const workplaceDisplay = isNotApplicable ? "Not applicable" : (company ? `${company.name} at ${company.area}` : workplaceInput);
    const prompt = `You are a real estate assistant for Bangalore, India.

User preferences:
- Preferred area: ${allPrefs.area || "Anywhere"}
- Budget: ${allPrefs.budget || "Not specified"}
- BHK: ${bhkList.join(", ")}
- Desired amenities: ${allPrefs.amenities || "Basic"}
- Health considerations: ${allPrefs.health || "None"}
- Workplace: ${workplaceDisplay}

Retrieved candidate houses:
${JSON.stringify(top20.map(h => ({
  id: h.id, loc: h.loc, bhk: h.bhk, sqft: h.sqft, bath: h.bath,
  price: h.price, dist_km: h.dist, society: h.soc,
  water_risk: h.waterData?.risk,
  air_aqi: h.airQuality.aqi, air_label: h.airQuality.label,
  noise_db: h.noiseLevel.level, noise_label: h.noiseLevel.label,
})), null, 2)}

Pick TOP 5 best matches. Respond ONLY with JSON (no markdown):
{
  "ranked_ids": [id1, id2, id3, id4, id5],
  "summary": "2-3 sentence explanation",
  "tips": ["tip1", "tip2", "tip3"]
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(clean);
      const ranked = result.ranked_ids.map(id => top20.find(h => h.id === id)).filter(Boolean);
      const top5 = ranked.length >= 5 ? ranked.slice(0, 5) : [...ranked, ...top20.filter(h => !ranked.find(r => r.id === h.id))].slice(0, 5);
      onResults(top5, companyCoords);
      setMessages(prev => [...prev, {
        role: "assistant",
        text: `✅ Found your top 5 homes!\n\n${result.summary}\n\n💡 Tips:\n${result.tips.map(t => `• ${t}`).join("\n")}`
      }]);
    } catch (err) {
      console.log("[RAG] AI failed, using fallback:", err?.message);
      onResults(fallbackTop5, companyCoords);
      setMessages(prev => [...prev, {
        role: "assistant",
        text: `✅ Found your top 5 homes in Bangalore! Check the Results & Map tabs.\n\nEach result includes air quality (AQI), noise levels (dB), and water risk.`
      }]);
    }

    setDone(true);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", text: userMsg }];
    const newPrefs = { ...prefs, [CHAT_STEPS[step].key]: userMsg };
    setPrefs(newPrefs);

    const nextStep = step + 1;
    if (nextStep < CHAT_STEPS.length) {
      setMessages([...newMessages, { role: "assistant", text: CHAT_STEPS[nextStep].question }]);
      setStep(nextStep);
    } else {
      setMessages([...newMessages, { role: "assistant", text: "🔍 Analysing your requirements — searching through real Bangalore listings, checking air quality, noise levels, water safety, and distance to your workplace..." }]);
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
              fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap"
            }}>{msg.text}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 4, padding: 10 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.primary, animation: `bounce 1s ${i * 0.2}s infinite` }} />
            ))}
          </div>
        )}
        <div ref={endRef} />
      </div>
      {!done && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}`, display: "flex", gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Type your answer..." disabled={loading}
            style={{ flex: 1, padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, outline: "none", background: COLORS.inputBg }} />
          <button onClick={handleSend} disabled={loading}
            style={{ padding: "10px 16px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 16 }}>➤</button>
        </div>
      )}
      {done && (
        <div style={{ padding: "10px 14px", borderTop: `1px solid ${COLORS.border}`, textAlign: "center" }}>
          <button onClick={() => { setDone(false); setStep(0); setPrefs({}); setMessages([{ role: "assistant", text: CHAT_STEPS[0].question }]); }}
            style={{ padding: "8px 20px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13 }}>
            🔄 Start New Search
          </button>
        </div>
      )}
    </div>
  );
}
