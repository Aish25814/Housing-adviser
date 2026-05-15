export const ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

export const COLORS = {
  primary: "#1A3C5E", accent: "#E8A838", bg: "#F4F6F9", white: "#FFFFFF",
  text: "#1C2B3A", muted: "#7A8FA6", border: "#DDE3EC",
  success: "#2D9B6F", danger: "#C94040", card: "#FFFFFF", inputBg: "#EEF1F6",
};

export const POLLUTANT_META = {
  pm25: { warn:35.4, danger:55.4, max:150, unit:"µg/m³", label:"PM2.5", who:"Safe <35.4" },
  pm10: { warn:154,  danger:254,  max:400, unit:"µg/m³", label:"PM10",  who:"Safe <154"  },
  no2:  { warn:100,  danger:200,  max:300, unit:"µg/m³", label:"NO₂",   who:"Safe <100"  },
  so2:  { warn:100,  danger:200,  max:300, unit:"µg/m³", label:"SO₂",   who:"Safe <100"  },
  o3:   { warn:140,  danger:180,  max:260, unit:"µg/m³", label:"O₃",    who:"Safe <140"  },
  co:   { warn:9.4,  danger:12.4, max:20,  unit:"mg/m³", label:"CO",    who:"Safe <9.4"  },
};

export const AQI_LEVELS = [
  { max:50,  label:"Good",                 color:"#4caf7d" },
  { max:100, label:"Moderate",             color:"#e8c84a" },
  { max:150, label:"Unhealthy (Sensitive)",color:"#f0843a" },
  { max:200, label:"Unhealthy",            color:"#e05c5c" },
  { max:300, label:"Very Unhealthy",       color:"#9b5de5" },
  { max:500, label:"Hazardous",            color:"#7d2e2e" },
];

export const WATER_RISKS = {
  "Bellandur":      { risk:"HIGH",   issues:["Cyanotoxins","E.coli","Turbidity","TDS"] },
  "Varthur":        { risk:"HIGH",   issues:["Cyanotoxins","E.coli","Turbidity","Nitrates"] },
  "Sarjapur":       { risk:"HIGH",   issues:["Fluoride","TDS","Nitrates"] },
  "Kasavanhalli":   { risk:"MEDIUM", issues:["Fluoride","TDS"] },
  "Hosa Road":      { risk:"MEDIUM", issues:["E.coli","Turbidity"] },
  "Chandapura":     { risk:"MEDIUM", issues:["Nitrates","TDS","Fluoride"] },
  "Electronic City":{ risk:"MEDIUM", issues:["TDS","Fluoride"] },
  "Whitefield":     { risk:"MEDIUM", issues:["TDS","Hardness"] },
  "Bommanahalli":   { risk:"MEDIUM", issues:["E.coli","Turbidity"] },
  "Hoodi":          { risk:"LOW",    issues:["TDS"] },
  "KR Puram":       { risk:"LOW",    issues:["TDS","Turbidity"] },
};

export const COMPANIES = [
  {id:1, name:"Infosys",           area:"Electronic City",   lat:12.8446, lng:77.6616},
  {id:2, name:"Wipro",             area:"Sarjapur Road",     lat:12.8258, lng:77.7849},
  {id:3, name:"TCS",               area:"Whitefield",        lat:12.9698, lng:77.7499},
  {id:4, name:"HCL Technologies",  area:"Whitefield",        lat:12.9698, lng:77.75  },
  {id:5, name:"Accenture",         area:"Hebbal",            lat:13.0358, lng:77.597 },
  {id:6, name:"IBM India",         area:"Manyata Tech Park", lat:13.0458, lng:77.6208},
  {id:7, name:"Cognizant",         area:"Outer Ring Road",   lat:12.9279, lng:77.6271},
  {id:8, name:"Capgemini",         area:"Electronic City",   lat:12.8352, lng:77.6602},
  {id:9, name:"SAP Labs India",    area:"Bellandur",         lat:12.9343, lng:77.6687},
  {id:10,name:"Oracle India",      area:"Whitefield",        lat:12.9814, lng:77.7477},
  {id:11,name:"Microsoft India",   area:"Bellandur",         lat:12.9339, lng:77.6712},
  {id:12,name:"Google India",      area:"Indira Nagar",      lat:12.9784, lng:77.6408},
  {id:13,name:"Amazon India",      area:"Marathahalli",      lat:12.9591, lng:77.6974},
  {id:14,name:"Flipkart",          area:"Bellandur",         lat:12.9374, lng:77.6762},
  {id:15,name:"Swiggy",            area:"Koramangala",       lat:12.9352, lng:77.6245},
  {id:16,name:"Zomato",            area:"HSR Layout",        lat:12.9081, lng:77.6476},
  {id:17,name:"Razorpay",          area:"SG Palya",          lat:12.9341, lng:77.604 },
  {id:18,name:"Byju's",            area:"Banashankari",      lat:12.9241, lng:77.554 },
  {id:19,name:"PhonePe",           area:"Koramangala",       lat:12.9352, lng:77.6168},
  {id:20,name:"Ola Cabs",          area:"Koramangala",       lat:12.9377, lng:77.6247},
  {id:21,name:"Meesho",            area:"Bangalore CBD",     lat:12.9716, lng:77.5946},
  {id:22,name:"Naukri",            area:"CV Raman Nagar",    lat:12.9838, lng:77.6605},
  {id:23,name:"Unacademy",         area:"Jayanagar",         lat:12.925,  lng:77.5938},
  {id:24,name:"CRED",              area:"Domlur",            lat:12.9608, lng:77.6387},
  {id:25,name:"Udaan",             area:"Koramangala",       lat:12.9342, lng:77.618 },
  {id:26,name:"Freshworks",        area:"Bellandur",         lat:12.933,  lng:77.67  },
  {id:27,name:"Zoho",              area:"Sarjapur Road",     lat:12.8258, lng:77.7849},
  {id:28,name:"Mphasis",           area:"Electronic City",   lat:12.8446, lng:77.6616},
  {id:29,name:"LTIMindtree",       area:"Whitefield",        lat:12.97,   lng:77.75  },
  {id:30,name:"Goldman Sachs",     area:"Koramangala",       lat:12.9396, lng:77.6126},
  {id:31,name:"JP Morgan",         area:"Outer Ring Road",   lat:12.927,  lng:77.626 },
  {id:32,name:"PayPal India",      area:"Manyata Tech Park", lat:13.0453, lng:77.62  },
];

export function getWaterRisk(loc) {
  for (const [area, data] of Object.entries(WATER_RISKS)) {
    if (loc && loc.includes(area)) return data;
  }
  return { risk:"LOW", issues:[] };
}

export function aqiLevel(aqi) {
  return AQI_LEVELS.find(l => aqi <= l.max) || AQI_LEVELS.at(-1);
}

export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371, toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1), dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Nearest hospital & police station per area ────────────────────────────────
export const AREA_SERVICES = {
  "Koramangala":          { hospital: "Manipal Hospital (HAL Airport Rd)", police: "Koramangala Police Station" },
  "Indiranagar":          { hospital: "Manipal Hospital (HAL Airport Rd)", police: "Indiranagar Police Station" },
  "HSR Layout":           { hospital: "Narayana Multispeciality Hospital", police: "HSR Layout Police Station" },
  "Hsr Layout":           { hospital: "Narayana Multispeciality Hospital", police: "HSR Layout Police Station" },
  "Bellandur":            { hospital: "Sakra World Hospital", police: "Bellandur Police Station" },
  "Sarjapur":             { hospital: "Sakra World Hospital", police: "Sarjapur Police Station" },
  "Sarjapur Road":        { hospital: "Sakra World Hospital", police: "Sarjapur Police Station" },
  "Whitefield":           { hospital: "Manipal Hospital Whitefield", police: "Whitefield Police Station" },
  "Marathahalli":         { hospital: "Columbia Asia Hospital Whitefield", police: "Marathahalli Police Station" },
  "Electronic City":      { hospital: "Narayana Health City", police: "Electronic City Police Station" },
  "Electronics City":     { hospital: "Narayana Health City", police: "Electronic City Police Station" },
  "Jayanagar":            { hospital: "Apollo BGS Hospital", police: "Jayanagar Police Station" },
  "JP Nagar":             { hospital: "Apollo BGS Hospital", police: "JP Nagar Police Station" },
  "Jp Nagar":             { hospital: "Apollo BGS Hospital", police: "JP Nagar Police Station" },
  "Banashankari":         { hospital: "Apollo BGS Hospital", police: "Banashankari Police Station" },
  "Bannerghatta Road":    { hospital: "Apollo BGS Hospital", police: "Bannerghatta Police Station" },
  "Hebbal":               { hospital: "Columbia Asia Hospital Hebbal", police: "Hebbal Police Station" },
  "Hebbal Kempapura":     { hospital: "Columbia Asia Hospital Hebbal", police: "Hebbal Police Station" },
  "Yelahanka":            { hospital: "Aster CMI Hospital", police: "Yelahanka Police Station" },
  "Thanisandra":          { hospital: "Aster CMI Hospital", police: "Thanisandra Police Station" },
  "Hennur Road":          { hospital: "Aster CMI Hospital", police: "Hennur Police Station" },
  "Malleshwaram":         { hospital: "Fortis Hospital Rajajinagar", police: "Malleshwaram Police Station" },
  "Rajaji Nagar":         { hospital: "Fortis Hospital Rajajinagar", police: "Rajajinagar Police Station" },
  "Yeshwanthpur":         { hospital: "Fortis Hospital Rajajinagar", police: "Yeshwanthpur Police Station" },
  "Peenya":               { hospital: "Fortis Hospital Rajajinagar", police: "Peenya Police Station" },
  "Tumkur Road":          { hospital: "Fortis Hospital Rajajinagar", police: "Peenya Police Station" },
  "Magadi Road":          { hospital: "Fortis Hospital Rajajinagar", police: "Magadi Road Police Station" },
  "Vijayanagar":          { hospital: "Fortis Hospital Rajajinagar", police: "Vijayanagar Police Station" },
  "Mysore Road":          { hospital: "BGS Gleneagles Global Hospital", police: "Mysore Road Police Station" },
  "Kanakpura Road":       { hospital: "BGS Gleneagles Global Hospital", police: "Kanakapura Police Station" },
  "Bommanahalli":         { hospital: "Narayana Multispeciality Hospital", police: "Bommanahalli Police Station" },
  "Hosur Road":           { hospital: "Narayana Health City", police: "Bommanahalli Police Station" },
  "Marathahalli":         { hospital: "Columbia Asia Hospital Whitefield", police: "Marathahalli Police Station" },
  "KR Puram":             { hospital: "Manipal Hospital Whitefield", police: "KR Puram Police Station" },
  "Kr Puram":             { hospital: "Manipal Hospital Whitefield", police: "KR Puram Police Station" },
  "Old Madras Road":      { hospital: "Manipal Hospital Whitefield", police: "KR Puram Police Station" },
  "Devanahalli":          { hospital: "Columbia Asia Hospital Hebbal", police: "Devanahalli Police Station" },
  "Bommasandra":          { hospital: "Narayana Health City", police: "Electronic City Police Station" },
  "Domlur":               { hospital: "Manipal Hospital (HAL Airport Rd)", police: "Indiranagar Police Station" },
  "Varthur":              { hospital: "Manipal Hospital Whitefield", police: "Varthur Police Station" },
};

const DEFAULT_SERVICES = { hospital: "Nearest Government Hospital", police: "Nearest Police Station" };

/**
 * Returns { hospital, police } for a given location string.
 * Falls back to generic labels if the area isn't in the lookup.
 */
export function getNearbyServices(loc) {
  if (!loc) return DEFAULT_SERVICES;
  const locLower = loc.toLowerCase();
  for (const [area, services] of Object.entries(AREA_SERVICES)) {
    if (locLower.includes(area.toLowerCase())) return services;
  }
  return DEFAULT_SERVICES;
}

// ── Disease → pollutant sensitivity map (from map.html) ──────────────────────
// Which air pollutants and water contaminants are dangerous per condition
export const DISEASE_POLLUTANTS = {
  asthma:       { air: ["pm25","pm10","no2","so2","o3"], water: [],                                          aqiLimit: 100, noiseLimit: 65 },
  copd:         { air: ["pm25","pm10","no2","so2"],      water: [],                                          aqiLimit: 100, noiseLimit: 70 },
  heart:        { air: ["pm25","co","no2"],              water: [],                                          aqiLimit: 100, noiseLimit: 60 },
  respiratory:  { air: ["pm25","pm10","no2","so2","o3"], water: [],                                          aqiLimit: 100, noiseLimit: 65 },
  allergy:      { air: ["pm10","pm25","o3","no2"],       water: [],                                          aqiLimit: 100, noiseLimit: 70 },
  neurological: { air: ["co"],                           water: ["lead","mercury","fluoride"],               aqiLimit: 150, noiseLimit: 55 },
  kidney:       { air: [],                               water: ["fluoride","arsenic","nitrates","tds"],     aqiLimit: 200, noiseLimit: 80 },
  cancer:       { air: ["pm25"],                         water: ["arsenic","chromium","nitrates"],           aqiLimit: 100, noiseLimit: 80 },
};

// Keywords that map user's free-text health input to disease keys
export const HEALTH_KEYWORDS = {
  asthma:       ["asthma","asthmatic","breathing","inhaler","bronchial"],
  copd:         ["copd","chronic obstructive","emphysema","bronchitis"],
  heart:        ["heart","cardiac","cardiovascular","bp","blood pressure","hypertension"],
  respiratory:  ["respiratory","lungs","lung","pulmonary","breathe","breathing"],
  allergy:      ["allergy","allergic","allergies","rhinitis","sinusitis","pollen"],
  neurological: ["neurological","neuro","brain","cognitive","alzheimer","parkinson","migraine"],
  kidney:       ["kidney","renal","dialysis","nephritis","stone"],
  cancer:       ["cancer","carcinoma","tumor","oncology","chemotherapy"],
};

/**
 * Parse free-text health input into a list of disease keys.
 * e.g. "I have asthma and kidney issues" → ["asthma","kidney"]
 */
export function parseHealthConditions(text) {
  if (!text || /none|no|n\/a|not applicable/i.test(text)) return [];
  const t = text.toLowerCase();
  const found = [];
  for (const [disease, keywords] of Object.entries(HEALTH_KEYWORDS)) {
    if (keywords.some(kw => t.includes(kw))) found.push(disease);
  }
  return found;
}

/**
 * Compute a health penalty (0–1) for a house given the user's conditions and live AQI data.
 * Higher penalty = worse for health = ranked lower.
 *
 * Factors:
 *  - AQI exceeds the condition's safe limit → heavy penalty
 *  - Specific pollutants (pm25, no2, etc.) exceed warn thresholds → per-pollutant penalty
 *  - Water contaminants match condition's water risks → penalty
 *  - Noise exceeds condition's noise limit → penalty
 */
export function computeHealthPenalty(house, conditions, aqiData, noiseDb) {
  if (!conditions || conditions.length === 0) return 0;

  let totalPenalty = 0;

  for (const cond of conditions) {
    const mapping = DISEASE_POLLUTANTS[cond];
    if (!mapping) continue;

    let condPenalty = 0;

    // ── Air quality penalty ──────────────────────────────────────────────
    if (aqiData && aqiData.aqi) {
      const aqi = aqiData.aqi;
      if (aqi > mapping.aqiLimit) {
        // Scale: at 2× the limit → full penalty of 0.5
        condPenalty += Math.min(0.5, ((aqi - mapping.aqiLimit) / mapping.aqiLimit) * 0.5);
      }

      // Per-pollutant check using WAQI iaqi data
      if (aqiData.iaqi && mapping.air.length > 0) {
        for (const pollutant of mapping.air) {
          const val = aqiData.iaqi[pollutant]?.v ?? aqiData[pollutant] ?? null;
          const meta = POLLUTANT_META[pollutant];
          if (val != null && meta && val >= meta.warn) {
            condPenalty += val >= meta.danger ? 0.2 : 0.1;
          }
        }
      }
    }

    // ── Water quality penalty ────────────────────────────────────────────
    if (mapping.water.length > 0 && house.waterData) {
      const issues = (house.waterData.issues || []).map(i => i.toLowerCase());
      const waterHits = mapping.water.filter(w => issues.some(i => i.includes(w)));
      if (waterHits.length > 0) {
        condPenalty += house.waterData.risk === "HIGH" ? 0.35 : 0.15;
      }
    }

    // ── Noise penalty ────────────────────────────────────────────────────
    if (noiseDb && noiseDb > mapping.noiseLimit) {
      condPenalty += Math.min(0.2, ((noiseDb - mapping.noiseLimit) / mapping.noiseLimit) * 0.2);
    }

    totalPenalty += condPenalty;
  }

  // Normalise: multiple conditions stack but cap at 0.95
  return Math.min(0.95, totalPenalty / conditions.length);
}

// Noise level estimates per area (dB, based on CPCB urban surveys)
export const AREA_NOISE_LEVEL = {
  // High noise — industrial / major highways
  "Peenya":                      { level:"High",   db:75, desc:"Industrial zone with heavy machinery and traffic" },
  "Yeshwanthpur":                { level:"High",   db:72, desc:"Commercial hub with dense traffic" },
  "Tumkur Road":                 { level:"High",   db:74, desc:"Major highway corridor" },
  "Magadi Road":                 { level:"High",   db:71, desc:"Industrial and commercial mix" },
  "Bommasandra Industrial Area": { level:"High",   db:76, desc:"Heavy industrial area" },
  "Kr Puram":                    { level:"High",   db:70, desc:"Railway junction and commercial area" },
  "Old Madras Road":             { level:"High",   db:69, desc:"Major arterial road with heavy traffic" },
  // Medium noise — commercial / mixed
  "Marathahalli":                { level:"Medium", db:65, desc:"IT corridor with moderate traffic" },
  "Hebbal":                      { level:"Medium", db:63, desc:"Tech park area with flyover traffic" },
  "Rajaji Nagar":                { level:"Medium", db:64, desc:"Commercial and residential mix" },
  "Malleshwaram":                { level:"Medium", db:62, desc:"Busy market and residential area" },
  "Vijayanagar":                 { level:"Medium", db:61, desc:"Mixed residential and commercial" },
  "Mysore Road":                 { level:"Medium", db:66, desc:"Major highway with moderate traffic" },
  "Hosur Road":                  { level:"Medium", db:64, desc:"IT corridor with regular traffic" },
  "Bommanahalli":                { level:"Medium", db:60, desc:"Developing commercial area" },
  "Indiranagar":                 { level:"Medium", db:62, desc:"Upscale commercial and residential" },
  "Hsr Layout":                  { level:"Medium", db:58, desc:"Planned residential with some commercial" },
  "Sarjapur Road":               { level:"Medium", db:60, desc:"Growing IT corridor" },
  // Low noise — residential / green
  "Electronic City":             { level:"Low",    db:52, desc:"Planned IT township, well-regulated" },
  "Electronics City Phase 1":    { level:"Low",    db:51, desc:"Planned IT campus zone" },
  "Electronic City Phase Ii":    { level:"Low",    db:50, desc:"Planned IT campus zone" },
  "Koramangala":                 { level:"Low",    db:55, desc:"Upscale residential with managed traffic" },
  "Whitefield":                  { level:"Low",    db:54, desc:"Gated communities and IT parks" },
  "Yelahanka":                   { level:"Low",    db:48, desc:"Suburban residential, low traffic" },
  "Jayanagar":                   { level:"Low",    db:50, desc:"Well-planned residential layout" },
  "Jp Nagar":                    { level:"Low",    db:51, desc:"Residential layout with parks" },
  "Banashankari":                { level:"Low",    db:49, desc:"Quiet residential neighbourhood" },
  "Hennur Road":                 { level:"Low",    db:52, desc:"Developing residential corridor" },
  "Thanisandra":                 { level:"Low",    db:50, desc:"Suburban residential area" },
  "Kanakpura Road":              { level:"Low",    db:47, desc:"Semi-rural residential corridor" },
  "Devanahalli":                 { level:"Low",    db:45, desc:"Airport zone, mostly residential" },
  "Bannerghatta Road":           { level:"Low",    db:53, desc:"Green corridor near national park" },
  "Bellandur":                   { level:"Low",    db:54, desc:"IT and residential mix" },
  "Hebbal Kempapura":            { level:"Low",    db:52, desc:"Residential near tech parks" },
};
