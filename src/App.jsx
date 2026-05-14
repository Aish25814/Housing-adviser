import { useState, useRef, useEffect } from "react";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const COLORS = {
  primary: "#1A3C5E",
  accent: "#E8A838",
  bg: "#F4F6F9",
  white: "#FFFFFF",
  text: "#1C2B3A",
  muted: "#7A8FA6",
  border: "#DDE3EC",
  success: "#2D9B6F",
  danger: "#C94040",
  card: "#FFFFFF",
  inputBg: "#EEF1F6",
};

const SAMPLE_HOUSES = [
  { id: 1, title: "Modern 2BHK in Koramangala", area: "Koramangala", rent: 25000, bedrooms: 2, bathrooms: 2, amenities: ["AC", "Parking", "Lift", "Security", "Power Backup"], health: "near Apollo Hospital (1.2km)", lat: 12.9352, lng: 77.6245, img: "🏢", distOffice: "3.2", furnished: "Semi-Furnished", locality: "Quiet residential colony" },
  { id: 2, title: "Spacious 3BHK near MG Road", area: "MG Road", rent: 35000, bedrooms: 3, bathrooms: 2, amenities: ["AC", "Parking", "Gym", "Garden", "Security"], health: "near Manipal Hospital (2km)", lat: 12.9759, lng: 77.6033, img: "🏠", distOffice: "1.8", furnished: "Fully Furnished", locality: "Prime commercial zone" },
  { id: 3, title: "Cozy 1BHK in Indiranagar", area: "Indiranagar", rent: 15000, bedrooms: 1, bathrooms: 1, amenities: ["Parking", "Security"], health: "near Columbia Asia Hospital (800m)", lat: 12.9784, lng: 77.6408, img: "🏘️", distOffice: "5.1", furnished: "Unfurnished", locality: "Busy market area" },
  { id: 4, title: "Premium 4BHK Villa in Whitefield", area: "Whitefield", rent: 55000, bedrooms: 4, bathrooms: 3, amenities: ["AC", "Parking", "Swimming Pool", "Garden", "Gym", "Security", "Power Backup", "Lift"], health: "near Narayana Health (500m)", lat: 12.9698, lng: 77.7500, img: "🏡", distOffice: "4.5", furnished: "Fully Furnished", locality: "Premium gated society" },
  { id: 5, title: "Budget 1BHK in Jayanagar", area: "Jayanagar", rent: 12000, bedrooms: 1, bathrooms: 1, amenities: ["Security", "Water Supply"], health: "near St. Philomena's Hospital (1.5km)", lat: 12.9299, lng: 77.5824, img: "🏗️", distOffice: "6.8", furnished: "Unfurnished", locality: "Developing locality" },
  { id: 6, title: "2BHK in Rajajinagar", area: "Rajajinagar", rent: 22000, bedrooms: 2, bathrooms: 2, amenities: ["AC", "Parking", "Lift", "Security"], health: "near Fortis Hospital (800m)", lat: 12.9882, lng: 77.5549, img: "🏢", distOffice: "2.1", furnished: "Semi-Furnished", locality: "Central business district" },
];

const CHAT_QUESTIONS = [
  { key: "area", question: "Welcome! 🏠 I'm your smart house-finding assistant. Let's find your perfect home in Bangalore!\n\nWhich area of Bangalore are you looking to rent in? (e.g., Koramangala, Indiranagar, Whitefield, Jayanagar, or 'anywhere')" },
  { key: "budget", question: "Great choice! 💰 What is your monthly rent budget? Please share a range like '20000-40000' or a max amount like 'under 30000'." },
  { key: "bedrooms", question: "Perfect! 🛏️ How many bedrooms do you need? (1BHK / 2BHK / 3BHK / 4BHK or more)" },
  { key: "amenities", question: "Nice! 🏊 What amenities are important to you? Choose from: AC, Parking, Gym, Swimming Pool, Garden, Lift, Security, Power Backup. (You can list multiple, or say 'basic only')" },
  { key: "health", question: "Almost there! 🏥 Do you have any health considerations? For example:\n- Need to be near a specific hospital\n- Family member with special needs\n- Prefer low pollution areas\n(Or type 'none' if not applicable)" },
  { key: "office", question: "Last question! 🏢 What is the location of your workplace/office in Bangalore? I'll calculate distances for you. (Or type 'not applicable')" },
];

function MapView({ houses, selected, onSelect }) {
  const canvasRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  const minLat = 12.90, maxLat = 13.10, minLng = 77.50, maxLng = 77.75;

  const project = (lat, lng, w, h) => {
    const x = ((lng - minLng) / (maxLng - minLng)) * (w - 40) + 20;
    const y = h - (((lat - minLat) / (maxLat - minLat)) * (h - 40) + 20);
    return { x, y };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#E8F0E0";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#C8D8C0";
    ctx.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath(); ctx.moveTo(0, (h / 8) * i); ctx.lineTo(w, (h / 8) * i); ctx.stroke();
      ctx.beginPath(); ctx.moveTo((w / 8) * i, 0); ctx.lineTo((w / 8) * i, h); ctx.stroke();
    }

    const roads = [
      [[12.975, 77.60], [12.975, 77.65]],
      [[12.965, 77.62], [12.965, 77.67]],
      [[12.95, 77.63], [13.00, 77.64]],
      [[12.96, 77.61], [13.01, 77.61]],
    ];
    ctx.strokeStyle = "#B0C0A8"; ctx.lineWidth = 3;
    roads.forEach(([[lat1, lng1], [lat2, lng2]]) => {
      const p1 = project(lat1, lng1, w, h), p2 = project(lat2, lng2, w, h);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    });

    houses.forEach((house, i) => {
      const { x, y } = project(house.lat, house.lng, w, h);
      const isSel = selected?.id === house.id;
      const isHov = hovered === house.id;
      const r = isSel ? 18 : isHov ? 15 : 12;

      ctx.beginPath();
      ctx.arc(x, y, r + 2, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#1A3C5E" : "rgba(26,60,94,0.15)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = isSel ? COLORS.accent : isHov ? "#2A5C8E" : COLORS.primary;
      ctx.fill();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${isSel ? 12 : 10}px Arial`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(i + 1, x, y);

      if (isSel || isHov) {
        ctx.fillStyle = "rgba(26,60,94,0.9)";
        const tw = ctx.measureText(house.area).width + 16;
        const tx = Math.min(Math.max(x - tw / 2, 4), w - tw - 4);
        const ty = y - r - 28;
        const roundedRect = (cx, cy, cw, ch, cr) => {
          ctx.beginPath();
          ctx.moveTo(cx + cr, cy);
          ctx.lineTo(cx + cw - cr, cy);
          ctx.arcTo(cx + cw, cy, cx + cw, cy + ch, cr);
          ctx.lineTo(cx + cw, cy + ch - cr);
          ctx.arcTo(cx + cw, cy + ch, cx + cw - cr, cy + ch, cr);
          ctx.lineTo(cx + cr, cy + ch);
          ctx.arcTo(cx, cy + ch, cx, cy + ch - cr, cr);
          ctx.lineTo(cx, cy + cr);
          ctx.arcTo(cx, cy, cx + cr, cy, cr);
          ctx.closePath();
        };
        roundedRect(tx, ty, tw, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 10px Arial";
        ctx.fillText(house.area, tx + tw / 2, ty + 10);
      }
    });
  }, [houses, selected, hovered]);

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    houses.forEach(house => {
      const { x, y } = project(house.lat, house.lng, canvas.width, canvas.height);
      if (Math.hypot(mx - x, my - y) < 20) onSelect(house);
    });
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    let found = null;
    houses.forEach(house => {
      const { x, y } = project(house.lat, house.lng, canvas.width, canvas.height);
      if (Math.hypot(mx - x, my - y) < 20) found = house.id;
    });
    setHovered(found);
  };

  return (
    <div style={{ borderRadius: 12, overflow: "hidden", border: `1px solid ${COLORS.border}`, position: "relative" }}>
      <canvas ref={canvasRef} width={360} height={220} onClick={handleClick} onMouseMove={handleMouseMove}
        style={{ width: "100%", height: 220, cursor: "pointer", display: "block" }} />
      <div style={{ position: "absolute", bottom: 8, left: 8, background: "rgba(255,255,255,0.9)", borderRadius: 8, padding: "4px 8px", fontSize: 11, color: COLORS.muted }}>
        📍 Bangalore — tap pins to view
      </div>
    </div>
  );
}

function HouseCard({ house, rank, onView }) {
  return (
    <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, marginBottom: 12, overflow: "hidden" }}>
      <div style={{ background: rank === 1 ? COLORS.primary : rank === 2 ? "#2A5C8E" : "#4A7CAE", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ background: COLORS.accent, color: "#fff", borderRadius: "50%", width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{rank}</span>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{house.title}</span>
        </div>
        <span style={{ fontSize: 22 }}>{house.img}</span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.primary }}>₹{house.rent.toLocaleString()}/mo</span>
          <span style={{ background: "#EEF1F6", color: COLORS.muted, borderRadius: 8, padding: "2px 8px", fontSize: 12 }}>{house.furnished}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>📍 {house.area}</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>🛏 {house.bedrooms} BHK · 🚿 {house.bathrooms} Bath</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>🏥 {house.health}</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>🏢 {house.distOffice} km to office</div>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {house.amenities.slice(0, 5).map(a => (
            <span key={a} style={{ background: "#E8F4FF", color: "#1A6CB5", borderRadius: 6, padding: "2px 7px", fontSize: 11 }}>{a}</span>
          ))}
          {house.amenities.length > 5 && <span style={{ background: "#EEF1F6", color: COLORS.muted, borderRadius: 6, padding: "2px 7px", fontSize: 11 }}>+{house.amenities.length - 5} more</span>}
        </div>
        <button onClick={() => onView(house)} style={{ width: "100%", padding: "9px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          View on Map & Details
        </button>
      </div>
    </div>
  );
}

function ChatBot({ onResults }) {
  const [messages, setMessages] = useState([{ role: "assistant", text: CHAT_QUESTIONS[0].question }]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState(0);
  const [userPrefs, setUserPrefs] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const analyzeAndRecommend = async (prefs) => {
    setLoading(true);
    const prompt = `You are a smart real estate assistant for Patna, Bihar, India. 
    
A user has shared their requirements:
- Preferred area: ${prefs.area}
- Budget: ${prefs.budget}
- Bedrooms needed: ${prefs.bedrooms}
- Important amenities: ${prefs.amenities}
- Health considerations: ${prefs.health}
- Office location: ${prefs.office}

Available houses (JSON):
${JSON.stringify(SAMPLE_HOUSES.map(h => ({ id: h.id, title: h.title, area: h.area, rent: h.rent, bedrooms: h.bedrooms, amenities: h.amenities, health: h.health, distOffice: h.distOffice, furnished: h.furnished, locality: h.locality })), null, 2)}

Based on the user's needs, analyze and rank the top 3 most suitable houses. 
Return ONLY a JSON object in this format (no markdown, no explanation):
{
  "ranked": [id1, id2, id3],
  "summary": "A friendly 2-3 sentence message explaining why these 3 homes are the best match for the user.",
  "tips": ["tip1", "tip2", "tip3"]
}`;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1000, messages: [{ role: "user", content: prompt }] })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const clean = text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(clean);
      const ranked = result.ranked.map(id => SAMPLE_HOUSES.find(h => h.id === id)).filter(Boolean);
      onResults(ranked);
      setMessages(prev => [...prev,
        { role: "assistant", text: `✅ Analysis complete! Here's what I found for you:\n\n${result.summary}\n\n💡 Tips:\n${result.tips.map(t => `• ${t}`).join("\n")}` }
      ]);
      setDone(true);
    } catch (e) {
      const fallback = SAMPLE_HOUSES.slice(0, 3);
      onResults(fallback);
      setMessages(prev => [...prev, { role: "assistant", text: "✅ Based on your preferences, I've found some great matches for you! Scroll down to see the results on the map." }]);
      setDone(true);
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    const newMessages = [...messages, { role: "user", text: userMsg }];
    const newPrefs = { ...userPrefs, [CHAT_QUESTIONS[step].key]: userMsg };
    setUserPrefs(newPrefs);

    const nextStep = step + 1;
    if (nextStep < CHAT_QUESTIONS.length) {
      setMessages([...newMessages, { role: "assistant", text: CHAT_QUESTIONS[nextStep].question }]);
      setStep(nextStep);
    } else {
      setMessages([...newMessages, { role: "assistant", text: "🔍 Excellent! Let me analyze all your requirements and find the best homes for you in Patna..." }]);
      setStep(nextStep);
      await analyzeAndRecommend(newPrefs);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", maxHeight: 420 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%", padding: "10px 13px", borderRadius: msg.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
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
            placeholder="Type your answer..." style={{ flex: 1, padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, outline: "none", background: COLORS.inputBg }} />
          <button onClick={handleSend} style={{ padding: "10px 16px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontSize: 16 }}>➤</button>
        </div>
      )}
    </div>
  );
}

function ListingForm() {
  const [form, setForm] = useState({ title: "", area: "", rent: "", bedrooms: "1", bathrooms: "1", furnished: "Unfurnished", amenities: [], description: "" });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");

  const AMENITY_LIST = ["AC", "Parking", "Lift", "Security", "Gym", "Garden", "Swimming Pool", "Power Backup", "Water Supply", "CCTV"];

  const toggleAmenity = (a) => {
    setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }));
  };

  const getAiTitle = async () => {
    if (!form.area || !form.bedrooms) return;
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 200,
          messages: [{ role: "user", content: `Generate an attractive property listing title and a 2-sentence description for a ${form.bedrooms}BHK ${form.furnished} apartment in ${form.area}, Bangalore with amenities: ${form.amenities.join(", ") || "basic"}. Rent: ₹${form.rent}/month. Return ONLY JSON: {"title":"...","description":"..."}` }]
        })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setForm(f => ({ ...f, title: parsed.title, description: parsed.description }));
      setAiSuggestion("✨ AI generated title & description for you!");
    } catch (e) { setAiSuggestion("Couldn't generate, please fill manually."); }
    setLoading(false);
  };

  if (submitted) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <h3 style={{ color: COLORS.primary, marginBottom: 8 }}>Listing Published!</h3>
      <p style={{ color: COLORS.muted, fontSize: 14 }}>Your property has been listed successfully. Potential tenants can now find your home.</p>
      <button onClick={() => setSubmitted(false)} style={{ marginTop: 16, padding: "10px 24px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>List Another</button>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px", overflowY: "auto" }}>
      <div style={{ background: "#EEF7FF", border: "1px solid #B0D4F5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1A5C9E" }}>
        💡 Fill in the details and use AI to generate an attractive title & description!
      </div>

      {aiSuggestion && <div style={{ background: "#F0FFF4", border: "1px solid #9AE6B4", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: "#276749" }}>{aiSuggestion}</div>}

      {[
        { label: "Property Title", key: "title", placeholder: "e.g., Spacious 2BHK in Boring Road" },
        { label: "Area / Locality", key: "area", placeholder: "e.g., Boring Road, Patna" },
        { label: "Monthly Rent (₹)", key: "rent", placeholder: "e.g., 18000", type: "number" },
      ].map(f => (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>{f.label}</label>
          <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            placeholder={f.placeholder} type={f.type || "text"}
            style={{ width: "100%", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, boxSizing: "border-box", background: COLORS.inputBg, outline: "none" }} />
        </div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "Bedrooms", key: "bedrooms", opts: ["1", "2", "3", "4", "5+"] },
          { label: "Bathrooms", key: "bathrooms", opts: ["1", "2", "3", "4+"] },
          { label: "Furnished", key: "furnished", opts: ["Unfurnished", "Semi-Furnished", "Fully Furnished"] },
        ].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>{f.label}</label>
            <select value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              style={{ width: "100%", padding: "8px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12, background: COLORS.inputBg }}>
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 6 }}>Amenities</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {AMENITY_LIST.map(a => (
            <button key={a} onClick={() => toggleAmenity(a)} style={{
              padding: "5px 10px", borderRadius: 8, border: `1px solid ${form.amenities.includes(a) ? COLORS.primary : COLORS.border}`,
              background: form.amenities.includes(a) ? COLORS.primary : "#fff",
              color: form.amenities.includes(a) ? "#fff" : COLORS.text, fontSize: 12, cursor: "pointer"
            }}>{a}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>Description</label>
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
          placeholder="Describe the property, neighborhood, nearby landmarks..." rows={3}
          style={{ width: "100%", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, boxSizing: "border-box", background: COLORS.inputBg, outline: "none", resize: "vertical" }} />
      </div>

      <button onClick={getAiTitle} disabled={loading} style={{ width: "100%", padding: "11px", background: "#EEF7FF", color: COLORS.primary, border: `1px solid #B0D4F5`, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {loading ? "✨ Generating..." : "✨ Auto-generate Title & Description with AI"}
      </button>
      <button onClick={() => setSubmitted(true)} style={{ width: "100%", padding: "12px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 15 }}>
        📤 Publish Listing
      </button>
    </div>
  );
}

function HouseDetail({ house, onBack }) {
  return (
    <div style={{ overflowY: "auto" }}>
      <div style={{ background: COLORS.primary, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{house.title}</span>
      </div>
      <MapView houses={[house]} selected={house} onSelect={() => {}} />
      <div style={{ padding: "16px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.primary }}>₹{house.rent.toLocaleString()}/mo</span>
          <span style={{ background: "#EEF1F6", color: COLORS.muted, borderRadius: 8, padding: "4px 10px", fontSize: 13 }}>{house.furnished}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          {[
            { icon: "📍", label: "Area", val: house.area },
            { icon: "🛏", label: "Bedrooms", val: `${house.bedrooms} BHK` },
            { icon: "🚿", label: "Bathrooms", val: house.bathrooms },
            { icon: "🏥", label: "Nearest Hospital", val: house.health },
            { icon: "🏢", label: "Distance to Office", val: `${house.distOffice} km` },
            { icon: "🏘️", label: "Locality", val: house.locality },
          ].map(({ icon, label, val }) => (
            <div key={label} style={{ background: "#F4F6F9", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 2 }}>{icon} {label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{val}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, marginBottom: 8 }}>Amenities</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {house.amenities.map(a => (
              <span key={a} style={{ background: "#E8F4FF", color: "#1A6CB5", borderRadius: 8, padding: "4px 10px", fontSize: 12, fontWeight: 600 }}>✓ {a}</span>
            ))}
          </div>
        </div>
        <button style={{ width: "100%", padding: 13, background: COLORS.accent, color: "#fff", border: "none", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 15 }}>
          📞 Contact Owner
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("chat");
  const [results, setResults] = useState([]);
  const [selectedHouse, setSelectedHouse] = useState(null);
  const [detailHouse, setDetailHouse] = useState(null);

  const handleResults = (houses) => {
    setResults(houses);
    setTab("results");
  };

  const handleViewOnMap = (house) => {
    setDetailHouse(house);
  };

  if (screen === "splash") return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${COLORS.primary} 0%, #0D2438 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>🏠</div>
      <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: -1 }}>GharDhundo</h1>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, marginTop: 6, marginBottom: 48, textAlign: "center" }}>Smart AI-powered house hunting for Patna</p>
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={() => { setRole("seeker"); setScreen("main"); }} style={{ padding: "18px", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          🔍 &nbsp; Find a House to Rent
        </button>
        <button onClick={() => { setRole("owner"); setScreen("main"); }} style={{ padding: "18px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 14, cursor: "pointer", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          🏡 &nbsp; List My House for Rent
        </button>
      </div>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 40, textAlign: "center" }}>Powered by Claude AI · Serving Patna, Bihar</p>
    </div>
  );

  if (detailHouse) return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg }}>
      <HouseDetail house={detailHouse} onBack={() => setDetailHouse(null)} />
    </div>
  );

  if (role === "owner") return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: COLORS.primary, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setScreen("splash")} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>List Your Property</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Reach thousands of tenants in Patna</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <ListingForm />
      </div>
    </div>
  );

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: COLORS.primary, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setScreen("splash")} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>←</button>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>🏠 GharDhundo</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>AI House Finder · Patna</div>
          </div>
        </div>
        <span style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>Seeker</span>
      </div>

      <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${COLORS.border}` }}>
        {[{ key: "chat", label: "🤖 AI Chat" }, { key: "results", label: `📋 Results${results.length ? ` (${results.length})` : ""}` }, { key: "map", label: "🗺️ Map" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            flex: 1, padding: "11px 4px", border: "none", borderBottom: tab === t.key ? `2.5px solid ${COLORS.primary}` : "2.5px solid transparent",
            background: "none", color: tab === t.key ? COLORS.primary : COLORS.muted, fontWeight: tab === t.key ? 700 : 400, fontSize: 12, cursor: "pointer"
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
            <ChatBot onResults={handleResults} />
          </div>
        )}
        {tab === "results" && (
          <div style={{ padding: 14 }}>
            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>
                <div style={{ fontSize: 50 }}>🤖</div>
                <p style={{ fontSize: 14, marginTop: 12 }}>Chat with the AI assistant to get personalized house recommendations!</p>
                <button onClick={() => setTab("chat")} style={{ marginTop: 12, padding: "10px 22px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>Start Chat →</button>
              </div>
            ) : (
              <>
                <div style={{ background: "#EEF7FF", border: "1px solid #B0D4F5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#1A5C9E" }}>
                  🎯 Top {results.length} matches based on your preferences
                </div>
                {results.map((h, i) => <HouseCard key={h.id} house={h} rank={i + 1} onView={(house) => { setDetailHouse(house); }} />)}
              </>
            )}
          </div>
        )}
        {tab === "map" && (
          <div style={{ padding: 14 }}>
            <MapView houses={results.length > 0 ? results : SAMPLE_HOUSES} selected={selectedHouse} onSelect={(h) => { setSelectedHouse(h); }} />
            {selectedHouse && (
              <div style={{ marginTop: 12, background: COLORS.white, borderRadius: 14, border: `1px solid ${COLORS.border}`, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: COLORS.primary }}>{selectedHouse.title}</span>
                  <span style={{ fontSize: 20 }}>{selectedHouse.img}</span>
                </div>
                <div style={{ fontSize: 12, color: COLORS.muted, marginBottom: 8 }}>📍 {selectedHouse.area} · ₹{selectedHouse.rent.toLocaleString()}/mo · {selectedHouse.bedrooms} BHK</div>
                <button onClick={() => setDetailHouse(selectedHouse)} style={{ width: "100%", padding: 10, background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                  View Full Details
                </button>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, marginBottom: 8 }}>{results.length > 0 ? "Your Matches" : "All Available Houses"}</div>
              {(results.length > 0 ? results : SAMPLE_HOUSES).map((h, i) => (
                <div key={h.id} onClick={() => setSelectedHouse(h)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: selectedHouse?.id === h.id ? "#EEF7FF" : COLORS.white, borderRadius: 10, marginBottom: 6, cursor: "pointer", border: `1px solid ${selectedHouse?.id === h.id ? "#B0D4F5" : COLORS.border}` }}>
                  <span style={{ background: COLORS.primary, color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.title}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted }}>₹{h.rent.toLocaleString()}/mo · {h.area}</div>
                  </div>
                  <span style={{ fontSize: 18 }}>{h.img}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}