import { useState } from "react";
import { COLORS, COMPANIES } from "./data/constants.js";
import { useHouses } from "./data/houseData.js";
import RAGChatBot from "./components/RAGChatBot.jsx";
import RealMap from "./components/RealMap.jsx";
import AreaReport from "./components/AreaReport.jsx";
import VisualizeArea from "./components/VisualizeArea.jsx";
import { getWaterRisk } from "./data/constants.js";

const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

// ─── Listing Form ───────────────────────────────────────────────────────────
function ListingForm({ onPublish }) {
  const [form, setForm] = useState({ title: "", area: "", rent: "", bedrooms: "1", bathrooms: "1", furnished: "Unfurnished", amenities: [], description: "", images: [] });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState("");
  const AMENITY_LIST = ["AC", "Parking", "Lift", "Security", "Gym", "Garden", "Swimming Pool", "Power Backup", "Water Supply", "CCTV"];

  const toggleAmenity = (a) => setForm(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }));

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      const newImages = files.map(file => URL.createObjectURL(file));
      setForm(f => ({ ...f, images: [...f.images, ...newImages] }));
    }
  };

  const removeImage = (index) => setForm(f => ({ ...f, images: f.images.filter((_, i) => i !== index) }));

  const getAiTitle = async () => {
    if (!form.area || !form.bedrooms) return;
    setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 200, messages: [{ role: "user", content: `Generate an attractive property listing title and a 2-sentence description for a ${form.bedrooms}BHK ${form.furnished} apartment in ${form.area}, Bangalore with amenities: ${form.amenities.join(", ") || "basic"}. Rent: ₹${form.rent}/month. Return ONLY JSON: {"title":"...","description":"..."}` }] })
      });
      const data = await res.json();
      const text = data.content?.find(b => b.type === "text")?.text || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setForm(f => ({ ...f, title: parsed.title, description: parsed.description }));
      setAiSuggestion("✨ AI generated title & description for you!");
    } catch { setAiSuggestion("Couldn't generate, please fill manually."); }
    setLoading(false);
  };

  if (submitted) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 60 }}>🎉</div>
      <h3 style={{ color: COLORS.primary, marginBottom: 8 }}>Listing Published!</h3>
      <p style={{ color: COLORS.muted, fontSize: 14 }}>Your property has been listed. Potential tenants can now find your home.</p>
      <button onClick={() => setSubmitted(false)} style={{ marginTop: 16, padding: "10px 24px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}>List Another</button>
    </div>
  );

  return (
    <div style={{ padding: "14px 16px", overflowY: "auto" }}>
      <div style={{ background: "#EEF7FF", border: "1px solid #B0D4F5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#1A5C9E" }}>
        💡 Fill in details, upload photos, then use AI to generate an attractive title!
      </div>
      {aiSuggestion && <div style={{ background: "#F0FFF4", border: "1px solid #9AE6B4", borderRadius: 10, padding: 10, marginBottom: 12, fontSize: 12, color: "#276749" }}>{aiSuggestion}</div>}

      {[{ label: "Property Title", key: "title", placeholder: "e.g., Spacious 2BHK in Koramangala" }, { label: "Area / Locality", key: "area", placeholder: "e.g., Koramangala, Bangalore" }, { label: "Monthly Rent (₹)", key: "rent", placeholder: "e.g., 25000", type: "number" }].map(f => (
        <div key={f.key} style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>{f.label}</label>
          <input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} type={f.type || "text"} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, boxSizing: "border-box", background: COLORS.inputBg, outline: "none" }} />
        </div>
      ))}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[{ label: "Bedrooms", key: "bedrooms", opts: ["1","2","3","4","5+"] }, { label: "Bathrooms", key: "bathrooms", opts: ["1","2","3","4+"] }, { label: "Furnished", key: "furnished", opts: ["Unfurnished","Semi-Furnished","Fully Furnished"] }].map(f => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>{f.label}</label>
            <select value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={{ width: "100%", padding: "8px 6px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12, background: COLORS.inputBg }}>
              {f.opts.map(o => <option key={o}>{o}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* Image Upload */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 6 }}>Building Pictures</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {form.images.map((img, idx) => (
            <div key={idx} style={{ position: "relative", width: 80, height: 80, borderRadius: 10, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
              <img src={img} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt="" />
              <button onClick={() => removeImage(idx)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(201,64,64,0.85)", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
          ))}
          <label style={{ width: 80, height: 80, borderRadius: 10, border: `2px dashed ${COLORS.border}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", background: COLORS.inputBg }}>
            <span style={{ fontSize: 24, color: COLORS.muted }}>+</span>
            <span style={{ fontSize: 10, color: COLORS.muted }}>Add Photo</span>
            <input type="file" multiple accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
          </label>
        </div>
      </div>

      {/* Amenities */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 6 }}>Amenities</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {AMENITY_LIST.map(a => (
            <button key={a} onClick={() => toggleAmenity(a)} style={{ padding: "5px 10px", borderRadius: 8, border: `1px solid ${form.amenities.includes(a) ? COLORS.primary : COLORS.border}`, background: form.amenities.includes(a) ? COLORS.primary : "#fff", color: form.amenities.includes(a) ? "#fff" : COLORS.text, fontSize: 12, cursor: "pointer" }}>{a}</button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, color: COLORS.muted, display: "block", marginBottom: 4 }}>Description</label>
        <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the property, neighborhood, nearby landmarks..." rows={3} style={{ width: "100%", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 13, boxSizing: "border-box", background: COLORS.inputBg, outline: "none", resize: "vertical" }} />
      </div>

      <button onClick={getAiTitle} disabled={loading} style={{ width: "100%", padding: "11px", background: "#EEF7FF", color: COLORS.primary, border: `1px solid #B0D4F5`, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {loading ? "✨ Generating..." : "✨ Auto-generate Title & Description with AI"}
      </button>
      <button onClick={() => { onPublish(form); setSubmitted(true); }} style={{ width: "100%", padding: "12px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 15 }}>
        📤 Publish Listing
      </button>
    </div>
  );
}

// ─── Local apartment photos (Pexels, bundled in /public) ─────────────────────
const HOUSE_IMGS = [
  "/house1.jpg","/house2.jpg","/house3.jpg","/house4.jpg",
  "/house5.jpg","/house6.jpg","/house7.jpg","/house9.jpg",
  "/house10.jpg","/house11.jpg","/house12.jpg",
];

function getHouseImages(house) {
  if (house.images && house.images.length > 0) return house.images;
  // Pick 3 different images deterministically from the pool using house.id
  const a = house.id % HOUSE_IMGS.length;
  const b = (house.id * 3 + 2) % HOUSE_IMGS.length;
  const c = (house.id * 7 + 5) % HOUSE_IMGS.length;
  // Deduplicate
  const picks = [...new Set([a, b, c])];
  while (picks.length < 3) picks.push((picks[picks.length - 1] + 1) % HOUSE_IMGS.length);
  return picks.map(i => HOUSE_IMGS[i]);
}

// ─── Comments stored in localStorage keyed by house id ───────────────────────
function loadComments(houseId) {
  try { return JSON.parse(localStorage.getItem(`comments_${houseId}`) || "[]"); }
  catch { return []; }
}
function saveComments(houseId, comments) {
  localStorage.setItem(`comments_${houseId}`, JSON.stringify(comments));
}

// ─── Result Card ─────────────────────────────────────────────────────────────
function HouseCard({ house, rank, onView, onReport }) {
  const [imgIdx, setImgIdx] = useState(0);
  const [imgError, setImgError] = useState(false);
  const [comments, setComments] = useState(() => loadComments(house.id));
  const [commentInput, setCommentInput] = useState("");
  const [showComments, setShowComments] = useState(false);

  const waterData = getWaterRisk(house.loc);
  const wc = waterData.risk === "HIGH" ? "#e05c5c" : waterData.risk === "MEDIUM" ? "#f0843a" : "#4caf7d";
  const air = house.airQuality || { aqi: 70, pm25: 25, label: "Moderate", color: "#e8c84a" };
  const noise = house.noiseLevel || { level: 58, label: "Moderate", color: "#e8c84a", desc: "Average" };
  const images = getHouseImages(house);

  const submitComment = () => {
    const text = commentInput.trim();
    if (!text) return;
    const newComment = { text, time: new Date().toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) };
    const updated = [...comments, newComment];
    setComments(updated);
    saveComments(house.id, updated);
    setCommentInput("");
  };

  const deleteComment = (idx) => {
    const updated = comments.filter((_, i) => i !== idx);
    setComments(updated);
    saveComments(house.id, updated);
  };

  return (
    <div style={{ background: COLORS.white, borderRadius: 14, border: `1px solid ${rank === 1 ? COLORS.accent : COLORS.border}`, marginBottom: 12, overflow: "hidden" }}>

      {/* ── Photo banner ── */}
      <div style={{ position: "relative", height: 180, background: "#D0D8E4", overflow: "hidden" }}>
        {!imgError ? (
          <img
            src={images[imgIdx]}
            alt={`${house.loc} property`}
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#EEF1F6", fontSize: 48 }}>🏠</div>
        )}

        {/* rank badge */}
        <div style={{ position: "absolute", top: 10, left: 10, background: rank === 1 ? COLORS.accent : COLORS.primary, color: "#fff", borderRadius: 8, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>
          #{rank} {rank === 1 ? "🏆 Best Match" : ""}
        </div>

        {/* price badge */}
        <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.65)", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 14, fontWeight: 800 }}>
          ₹{Math.round(house.price * 100)}K
        </div>

        {/* image nav dots */}
        {images.length > 1 && !imgError && (
          <div style={{ position: "absolute", bottom: 10, right: 10, display: "flex", gap: 5, alignItems: "center" }}>
            {images.map((_, i) => (
              <button key={i} onClick={() => { setImgIdx(i); setImgError(false); }}
                style={{ width: i === imgIdx ? 18 : 8, height: 8, borderRadius: 4, border: "none", background: i === imgIdx ? "#fff" : "rgba(255,255,255,0.5)", cursor: "pointer", padding: 0, transition: "width 0.2s" }} />
            ))}
          </div>
        )}

        {/* prev/next arrows */}
        {images.length > 1 && !imgError && (
          <>
            <button onClick={() => { setImgIdx(i => (i - 1 + images.length) % images.length); setImgError(false); }}
              style={{ position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
            <button onClick={() => { setImgIdx(i => (i + 1) % images.length); setImgError(false); }}
              style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.4)", color: "#fff", border: "none", borderRadius: "50%", width: 28, height: 28, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
          </>
        )}
      </div>

      {/* ── header row ── */}
      <div style={{ background: rank === 1 ? COLORS.primary : rank === 2 ? "#2A5C8E" : "#4A7CAE", padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>📍 {house.loc}</span>
        </div>
        <span style={{ background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "2px 8px", fontSize: 12 }}>{house.bhk} BHK · {house.sqft} sqft</span>
      </div>
      <div style={{ padding: "12px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>🛏 {house.bhk} BHK · 🚿 {house.bath} Bath</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>📏 {house.sqft} sqft</div>
          <div style={{ fontSize: 12, color: COLORS.muted }}>🏢 {house.dist} km to office</div>
          {house.soc ? <div style={{ fontSize: 12, color: COLORS.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🏘 {house.soc}</div> : null}
        </div>

        {/* ── Environment Quality Section ── */}
        <div style={{ background: "#F8F9FB", borderRadius: 10, padding: "10px 12px", marginBottom: 10, border: "1px solid #EEF1F6" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COLORS.muted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>Environment Quality</div>
          
          {/* Air Quality */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>🌬️</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>Air Quality</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: air.color }}>AQI {air.aqi} · {air.label}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#E8E8E8", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, (air.aqi / 200) * 100)}%`, background: air.color, transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>PM2.5: {air.pm25} µg/m³</div>
            </div>
          </div>

          {/* Noise Level */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>🔊</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>Noise Level</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: noise.color }}>{noise.level} dB · {noise.label}</span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: "#E8E8E8", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 3, width: `${Math.min(100, ((noise.level - 30) / 50) * 100)}%`, background: noise.color, transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 10, color: COLORS.muted, marginTop: 2 }}>{noise.desc}</div>
            </div>
          </div>

          {/* Water Risk */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14 }}>💧</span>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: wc, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text }}>Water: <strong style={{ color: wc }}>{waterData.risk} risk</strong></span>
              {waterData.issues.length > 0 && <span style={{ fontSize: 10, color: COLORS.muted }}>({waterData.issues.join(", ")})</span>}
            </div>
          </div>
        </div>

        <button onClick={() => onView(house)} style={{ width: "100%", padding: "9px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
          View on Map
        </button>
        <button onClick={() => onReport(house)} style={{ width: "100%", padding: "9px", background: "transparent", color: COLORS.primary, border: `1.5px solid ${COLORS.primary}`, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 13, marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          📊 View Area Report
        </button>

        {/* ── Comments Section ── */}
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowComments(v => !v)}
            style={{ width: "100%", padding: "8px", background: "none", border: `1px solid ${COLORS.border}`, borderRadius: 10, cursor: "pointer", fontSize: 12, color: COLORS.muted, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            💬 {comments.length > 0 ? `${comments.length} Comment${comments.length > 1 ? "s" : ""}` : "Add a Comment"} {showComments ? "▲" : "▼"}
          </button>

          {showComments && (
            <div style={{ marginTop: 8 }}>
              {/* existing comments */}
              {comments.length > 0 && (
                <div style={{ marginBottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {comments.map((c, i) => (
                    <div key={i} style={{ background: "#F4F6F9", borderRadius: 8, padding: "8px 10px", fontSize: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ color: COLORS.text, flex: 1, lineHeight: 1.5 }}>{c.text}</span>
                        <button onClick={() => deleteComment(i)}
                          style={{ background: "none", border: "none", color: COLORS.muted, cursor: "pointer", fontSize: 14, padding: 0, flexShrink: 0 }}>×</button>
                      </div>
                      <div style={{ color: COLORS.muted, fontSize: 10, marginTop: 3 }}>🕐 {c.time}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* input row */}
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={commentInput}
                  onChange={e => setCommentInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitComment()}
                  placeholder="Write a note about this property..."
                  style={{ flex: 1, padding: "8px 10px", border: `1px solid ${COLORS.border}`, borderRadius: 8, fontSize: 12, outline: "none", background: COLORS.inputBg }}
                />
                <button onClick={submitComment}
                  style={{ padding: "8px 12px", background: COLORS.primary, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>Post</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const { houses, loading: housesLoading } = useHouses();
  const [screen, setScreen] = useState("splash");
  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("chat");
  const [results, setResults] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [reportHouse, setReportHouse] = useState(null);

  const [allHouses, setAllHouses] = useState(() => {
    const saved = localStorage.getItem("my_listed_houses");
    return saved ? JSON.parse(saved) : [];
  });

  const handleResults = (houses, company) => {
    setResults(houses);
    setSelectedCompany(company);
    setTab("results");
  };

  const handleNewListing = (newHouse) => {
    const houseWithId = { ...newHouse, id: Date.now(), img: "🏠" };
    const updated = [...allHouses, houseWithId];
    setAllHouses(updated);
    const saved = localStorage.getItem("my_listed_houses");
    const userHouses = saved ? JSON.parse(saved) : [];
    localStorage.setItem("my_listed_houses", JSON.stringify([...userHouses, houseWithId]));
  };

  // ── Area Report page ──────────────────────────────────────────────────────
  if (reportHouse) return (
    <AreaReport house={reportHouse} houses={houses} onBack={() => setReportHouse(null)} />
  );

  if (screen === "splash") return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(135deg, ${COLORS.primary} 0%, #0D2438 100%)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 64, marginBottom: 12 }}>🏠</div>
      <h1 style={{ color: "#fff", fontSize: 30, fontWeight: 900, margin: 0, letterSpacing: -1 }}>GharDhundo</h1>
      <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 15, marginTop: 6, marginBottom: 12, textAlign: "center" }}>Smart AI-powered house hunting for Bangalore</p>
      {housesLoading && <p style={{ color: COLORS.accent, fontSize: 12, marginBottom: 24 }}>⏳ Loading {houses.length > 0 ? houses.length : "..."} listings...</p>}
      {!housesLoading && <p style={{ color: "#4caf7d", fontSize: 12, marginBottom: 24 }}>✅ {houses.length.toLocaleString()} real Bangalore listings loaded</p>}
      <div style={{ width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={() => { setRole("seeker"); setScreen("main"); }} style={{ padding: "18px", background: COLORS.accent, color: "#fff", border: "none", borderRadius: 14, cursor: "pointer", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          🔍 &nbsp; Find a House to Rent
        </button>
        <button onClick={() => { setRole("owner"); setScreen("main"); }} style={{ padding: "18px", background: "rgba(255,255,255,0.12)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.3)", borderRadius: 14, cursor: "pointer", fontWeight: 800, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
          🏡 &nbsp; List My House for Rent
        </button>
      </div>
      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, marginTop: 40, textAlign: "center" }}>RAG + Claude AI · Real Bangalore Dataset</p>
    </div>
  );

  if (role === "owner") return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: COLORS.primary, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setScreen("splash")} style={{ background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" }}>←</button>
        <div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>List Your Property</div>
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 12 }}>Reach thousands of tenants in Bangalore</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <ListingForm onPublish={handleNewListing} />
      </div>
    </div>
  );

  // Seeker view
  return (
    <div style={{ maxWidth: 420, margin: "0 auto", minHeight: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column" }}>
      <div style={{ background: COLORS.primary, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setScreen("splash")} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>←</button>
          <div>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: 17 }}>🏠 GharDhundo</div>
            <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>AI House Finder · Bangalore</div>
          </div>
        </div>
        <span style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 8, padding: "4px 10px", fontSize: 11 }}>
          {houses.length.toLocaleString()} listings
        </span>
      </div>

      <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${COLORS.border}` }}>
        {[{ key: "chat", label: "🤖 AI Chat" }, { key: "results", label: `📋 Results${results.length ? ` (${results.length})` : ""}` }, { key: "map", label: "🗺️ Map" }, { key: "visualize", label: "📊 Visualize" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ flex: 1, padding: "11px 4px", border: "none", borderBottom: tab === t.key ? `2.5px solid ${COLORS.primary}` : "2.5px solid transparent", background: "none", color: tab === t.key ? COLORS.primary : COLORS.muted, fontWeight: tab === t.key ? 700 : 400, fontSize: 12, cursor: "pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: tab === "map" ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
            {housesLoading
              ? <div style={{ padding: 20, textAlign: "center", color: COLORS.muted }}>⏳ Loading Bangalore listings…</div>
              : <RAGChatBot houses={houses} onResults={handleResults} />}
          </div>
        )}

        {tab === "results" && (
          <div style={{ padding: 14 }}>
            {results.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: COLORS.muted }}>
                <div style={{ fontSize: 50 }}>🤖</div>
                <p style={{ fontSize: 14, marginTop: 12 }}>Chat with the AI assistant to get personalized recommendations from real Bangalore listings!</p>
              </div>
            ) : (
              <>
                <div style={{ background: "#EEF7FF", border: "1px solid #B0D4F5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#1A5C9E" }}>
                  🎯 Top {results.length} matches from {houses.length.toLocaleString()} real Bangalore listings
                </div>
                {results.map((h, i) => <HouseCard key={h.id} house={h} rank={i + 1} onView={() => setTab("map")} onReport={(house) => setReportHouse(house)} />)}
              </>
            )}
          </div>
        )}

        {tab === "map" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
            <RealMap results={results} company={selectedCompany} />
            {results.length > 0 && (
              <div style={{ padding: "8px 14px", background: "#fff", borderTop: `1px solid ${COLORS.border}`, overflowY: "auto", maxHeight: 200 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.primary, marginBottom: 6 }}>Top Matches</div>
                {results.map((h, i) => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#F4F6F9", borderRadius: 8, marginBottom: 6, fontSize: 12 }}>
                    <span style={{ background: COLORS.primary, color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.loc}</div>
                      <div style={{ color: COLORS.muted }}>₹{Math.round(h.price * 100)}K · {h.bhk} BHK · {h.dist} km to office</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "visualize" && (
          <VisualizeArea />
        )}
      </div>
      <style>{`@keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }`}</style>
    </div>
  );
}