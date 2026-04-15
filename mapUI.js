const { apiKey, apiURL } = HEALERTSYS_CONFIG;
let activeMarker = null;
let allNodes = [];
let globalHottestKeys = new Set();
const drawer = document.getElementById("mainDrawer");

const map = new maplibregl.Map({
  container: "map",
  style:
    "https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [123.82, 10.27],
  zoom: 13,
  attributionControl: false,
});

// Add this at the VERY top
if (typeof HEALERTSYS_CONFIG === "undefined") {
  console.error("CRITICAL: config.js is missing or not loaded!");
  alert("System Configuration Error. Check console.");
}

// --- 0. SHARED COLOR LOGIC (5 STATES) ---
function getHeatColor(heat) {
  if (heat >= 49) return "#be123c"; // 🔴 EXTREME DANGER
  if (heat >= 42) return "#f24e1e"; // 🟠 DANGER (Brand Orange)
  if (heat >= 33) return "#f59e0b"; // 🟡 CAUTION (Amber)
  if (heat >= 26) return "#10b981"; // 🟢 NORMAL (Emerald)
  return "#60a5fa"; // 🔵 COOL (Blue)
}

function getTailwindColorClass(heat) {
  if (heat >= 49) return "text-rose-700";
  if (heat >= 42) return "text-[#f24e1e]";
  if (heat >= 33) return "text-amber-500";
  if (heat >= 26) return "text-emerald-400";
  return "text-blue-400";
}

function getNodeDedupeKey(node) {
  const sensorCode = (node.sensorCode || "").trim().toUpperCase();
  return sensorCode || `${node.lat || ""}_${node.lng || ""}`;
}

function getCurrentHotSensorKeys() {
  const uniqueSensors = dedupeLatestBySensor(allNodes);
  if (!uniqueSensors || uniqueSensors.length === 0) return new Set();

  const getMinuteBasis = (node) => {
    const d = new Date(node.rawTime || node.time);
    d.setSeconds(0, 0);
    return d.getTime();
  };

  const latestMinute = Math.max(...uniqueSensors.map((n) => getMinuteBasis(n)));
  const windowNodes = uniqueSensors.filter(
    (n) => getMinuteBasis(n) === latestMinute,
  );

  const maxHeatInWindow = Math.max(
    ...windowNodes.map((n) => parseFloat(n.heatIndex)),
  );
  const priorityNodes = windowNodes.filter(
    (n) => parseFloat(n.heatIndex) === maxHeatInWindow,
  );

  return new Set(priorityNodes.map(getNodeDedupeKey));
}

// --- Helper: Deduplicate and keep latest reading per sensor ---
function dedupeLatestBySensor(data) {
  const latest = new Map();

  data.forEach((node) => {
    const sensorCode = (node.sensorCode || "").trim().toUpperCase();
    const dedupeKey = sensorCode || `${node.lat || ""}_${node.lng || ""}`;
    const candidateTime = new Date(node.rawTime || node.time || 0).getTime();

    if (!latest.has(dedupeKey)) {
      latest.set(dedupeKey, node);
      return;
    }

    const existing = latest.get(dedupeKey);
    const existingTime = new Date(
      existing.rawTime || existing.time || 0,
    ).getTime();

    if (candidateTime > existingTime) {
      latest.set(dedupeKey, node);
    }
  });

  return Array.from(latest.values());
}

// --- 1. SEARCH LOGIC ---
document.getElementById("brgySearch").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase().trim();

  let filtered = allNodes;
  if (term) {
    filtered = allNodes.filter((node) => {
      return (
        (node.barangayName || "").toLowerCase().includes(term) ||
        (node.displayName || "").toLowerCase().includes(term) ||
        (node.sensorCode || "").toLowerCase().includes(term)
      );
    });
  }

  // Render and grab the top result
  const sorted = renderSidebar(filtered);

  // If we found something and the user is actively searching, fly to the top match
  if (term && sorted.length > 0) {
    focusNode(sorted[0]);
  }
});

// --- 2. DATA SYNC LOGIC ---
// --- 2. DATA SYNC LOGIC ---
async function syncData(flyToLatest = false) {
  const status = document.getElementById("sync-status");
  status.innerText = "SYNCING";

  try {
    const response = await fetch(HEALERTSYS_CONFIG.apiHistoryURL, {
      headers: {
        Accept: "application/json",
        "X-Tunnel-Skip-Anti-Phishing-Page": "true",
      },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const result = await response.json();

    // ✅ Extract logs from wrapped ApiResponse
    const rawData = result.data?.logs || result || [];

    // Filter only active sensors (backend already does this, but double-check)
    allNodes = rawData.filter((node) => node.isActive !== false);

    // Deduplicate and get hottest
    globalHottestKeys = getCurrentHotSensorKeys();

    const currentSearch = document
      .getElementById("brgySearch")
      .value.toLowerCase()
      .trim();
    let displayNodes = allNodes;

    if (currentSearch) {
      displayNodes = allNodes.filter(
        (n) =>
          (n.barangayName || "").toLowerCase().includes(currentSearch) ||
          (n.displayName || "").toLowerCase().includes(currentSearch) ||
          (n.sensorCode || "").toLowerCase().includes(currentSearch),
      );
    }

    const sortedNodes = renderSidebar(displayNodes);

    if (flyToLatest && sortedNodes.length > 0) {
      focusNode(sortedNodes[0]);
    }

    status.innerText = "READY";
  } catch (e) {
    status.innerText = "ERROR";
    console.error("Sync Error:", e);
  }
}

// --- 3. UI RENDERING (TOP-2 LATEST HOTTEST) ---
function renderSidebar(data) {
  const container = document.getElementById("sensorList");
  container.innerHTML = "";
  if (!data || data.length === 0) return []; // Return empty array if no data

  const uniqueSensors = dedupeLatestBySensor(data);

  // Sorting logic (Stay the same: Hottest Globally -> Newest)
  uniqueSensors.sort((a, b) => {
    const aKey = getNodeDedupeKey(a);
    const bKey = getNodeDedupeKey(b);
    const aIsHot = globalHottestKeys.has(aKey);
    const bIsHot = globalHottestKeys.has(bKey);

    if (aIsHot && !bIsHot) return -1;
    if (!aIsHot && bIsHot) return 1;
    return new Date(b.rawTime) - new Date(a.rawTime);
  });

  // 3. Render
  uniqueSensors.forEach((node) => {
    const isPriority = globalHottestKeys.has(getNodeDedupeKey(node));
    const heat = node.heatIndex;
    const colorHex = getHeatColor(heat);
    const colorClass = getTailwindColorClass(heat);

    const card = document.createElement("div");
    card.className = `bg-slate-900/30 border border-white/5 border-l-4 p-4 cursor-pointer hover:bg-white/[0.03] transition-all group ${
      isPriority ? "bg-white/[0.02] border-l-[#f24e1e]" : ""
    }`;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="max-w-[70%]">
          <div class="text-[9px] text-slate-500 font-mono mb-1 uppercase tracking-widest">
            ${node.sensorCode} ${isPriority ? '<span class="text-[8px] bg-[#f24e1e] px-1.5 py-0.5 rounded ml-2 text-white font-black animate-pulse">HOTTEST NOW</span>' : ""}
          </div>
          <div class="text-sm font-black text-white truncate group-hover:text-[#f24e1e] transition-colors uppercase tracking-tight">${node.displayName}</div>
          <div class="text-[10px] text-slate-500 mt-1 font-mono uppercase">Brgy. ${node.barangayName}</div>
        </div>
        <div class="text-right">
          <div class="text-xl font-black ${colorClass} leading-none" style="color: ${colorHex}">${heat}°C</div>
          <div class="text-[9px] text-slate-600 font-mono mt-2">${node.time}</div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => focusNode(node));
    container.appendChild(card);
  });

  return uniqueSensors;
}

// Helper to prevent crashes if something goes wrong with the priority logic
function renderStandardList(data, container) {
  data.forEach((node) => {
    // ... render simple cards here ...
  });
}

// --- 4. MAP HELPERS ---
function focusNode(node) {
  document
    .querySelectorAll(".radar-node")
    .forEach((el) => el.classList.remove("is-active"));
  if (activeMarker) activeMarker.remove();

  document.getElementById("active-sensor-code").innerText =
    `NODE: ${node.sensorCode}`;
  document.getElementById("last-ping").innerText = `PING: ${node.time}`;

  const color = getHeatColor(node.heatIndex);

  const el = document.createElement("div");
  el.className = "radar-node is-active";
  el.innerHTML = `
    <div class="node-pulse" style="background: radial-gradient(circle, ${color}88 0%, transparent 70%); border: 2px solid ${color}aa"></div>
    <div class="node-core" style="background: ${color}"></div>
    <div class="node-overlay">
      <div class="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
        <span class="text-[10px] font-black text-[#60a5fa] font-mono uppercase">${node.sensorCode}</span>
        <span class="text-[10px] text-slate-500 font-mono">${node.time}</span>
      </div>
      <div class="text-xs font-black text-white mb-1 uppercase tracking-tight">${node.displayName}</div>
      <div class="text-[10px] text-slate-400 mb-3 uppercase font-mono">Brgy. ${node.barangayName}</div>
      <div class="flex justify-between items-end">
        <div class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Heat Index</div>
        <div class="text-xl font-black" style="color:${color}">${node.heatIndex}°C</div>
      </div>
    </div>
  `;

  el.addEventListener("click", () => el.classList.toggle("is-active"));

  activeMarker = new maplibregl.Marker({ element: el })
    .setLngLat([node.lng, node.lat])
    .addTo(map);

  map.flyTo({
    center: [node.lng, node.lat],
    zoom: 16,
    pitch: 45,
    // Increase bottom padding for mobile to account for the drawer
    padding: { bottom: window.innerWidth < 768 ? 220 : 0 },
  });
}

function toggleDrawer() {
  if (window.innerWidth < 768) {
    drawer.classList.toggle("is-expanded");
  }
}

function handleLogout() {
  sessionStorage.removeItem("isAdminAuthenticated");
  sessionStorage.removeItem("adminName");
  window.location.href = "logindash.html";
}

// Initialization
if (window.lucide) lucide.createIcons();
map.on("load", () => syncData(false));
setInterval(() => syncData(false), 15000); // 15 seconds
