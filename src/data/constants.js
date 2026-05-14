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
  {id:2, name:"Wipro",             area:"Sarjapur Road",     lat:12.901,  lng:77.6891},
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
  {id:27,name:"Zoho",              area:"Sarjapur Road",     lat:12.9024, lng:77.6844},
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
