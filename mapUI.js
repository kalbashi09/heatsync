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

if (typeof HEALERTSYS_CONFIG === "undefined") {
  console.error("CRITICAL: config.js is missing or not loaded!");
  alert("System Configuration Error. Check console.");
}

// --- Helper: Convert UTC to PH Time ---
function toPHTime(utcString) {
  const date = new Date(utcString);
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

function formatPHTime(date) {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Manila",
  });
}

// --- 0. SHARED COLOR LOGIC (5 STATES) ---
function getHeatColor(heat) {
  if (heat >= 49) return "#be123c";
  if (heat >= 42) return "#f24e1e";
  if (heat >= 33) return "#f59e0b";
  if (heat >= 26) return "#10b981";
  return "#60a5fa";
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
  return (
    sensorCode ||
    `${node.latitude || node.lat || ""}_${node.longitude || node.lng || ""}`
  );
}

// --- Deduplicate: keep latest reading per sensor using recordedAt (UTC) ---
function dedupeLatestBySensor(data) {
  const latest = new Map();
  data.forEach((node) => {
    const dedupeKey = getNodeDedupeKey(node);
    const candidateTime = new Date(node.recordedAt || 0).getTime();
    if (!latest.has(dedupeKey)) {
      latest.set(dedupeKey, node);
      return;
    }
    const existingTime = new Date(
      latest.get(dedupeKey).recordedAt || 0,
    ).getTime();
    if (candidateTime > existingTime) {
      latest.set(dedupeKey, node);
    }
  });
  return Array.from(latest.values());
}

// --- Get hottest sensor keys within the latest PH minute ---
function getCurrentHotSensorKeys() {
  const uniqueSensors = dedupeLatestBySensor(allNodes);
  if (!uniqueSensors || uniqueSensors.length === 0) return new Set();

  const getPHMinuteBasis = (node) => {
    if (!node.phTime) return 0;
    const d = new Date(node.phTime);
    d.setSeconds(0, 0);
    return d.getTime();
  };

  const latestMinute = Math.max(
    ...uniqueSensors.map((n) => getPHMinuteBasis(n)),
  );
  const windowNodes = uniqueSensors.filter(
    (n) => getPHMinuteBasis(n) === latestMinute,
  );
  const maxHeat = Math.max(...windowNodes.map((n) => parseFloat(n.heatIndex)));
  const priorityNodes = windowNodes.filter(
    (n) => parseFloat(n.heatIndex) === maxHeat,
  );
  return new Set(priorityNodes.map(getNodeDedupeKey));
}

// --- SEARCH LOGIC ---
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
  const sorted = renderSidebar(filtered);
  if (term && sorted.length > 0) {
    focusNode(sorted[0]);
  }
});

// --- DATA SYNC LOGIC ---
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

    // Extract logs from wrapped ApiResponse
    const rawData = result.data?.logs || result || [];

    // Process each node: add phTime and phTimeString
    allNodes = rawData
      .filter((node) => node.isActive !== false)
      .map((node) => ({
        ...node,
        phTime: node.recordedAt ? toPHTime(node.recordedAt) : null,
        phTimeString: node.recordedAt
          ? formatPHTime(toPHTime(node.recordedAt))
          : node.time,
      }));

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

// --- UI RENDERING ---
function renderSidebar(data) {
  const container = document.getElementById("sensorList");
  container.innerHTML = "";
  if (!data || data.length === 0) return [];

  const uniqueSensors = dedupeLatestBySensor(data);

  uniqueSensors.sort((a, b) => {
    const aKey = getNodeDedupeKey(a);
    const bKey = getNodeDedupeKey(b);
    const aIsHot = globalHottestKeys.has(aKey);
    const bIsHot = globalHottestKeys.has(bKey);
    if (aIsHot && !bIsHot) return -1;
    if (!aIsHot && bIsHot) return 1;
    // Use recordedAt for reliable sorting
    return new Date(b.recordedAt || 0) - new Date(a.recordedAt || 0);
  });

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
          <div class="text-[9px] text-slate-600 font-mono mt-2">${node.phTimeString || node.time || ""}</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => focusNode(node));
    container.appendChild(card);
  });
  return uniqueSensors;
}

// --- MAP HELPERS ---
function focusNode(node) {
  document
    .querySelectorAll(".radar-node")
    .forEach((el) => el.classList.remove("is-active"));
  if (activeMarker) activeMarker.remove();

  document.getElementById("active-sensor-code").innerText =
    `NODE: ${node.sensorCode}`;
  document.getElementById("last-ping").innerText =
    `PING: ${node.phTimeString || node.time || ""}`;

  const color = getHeatColor(node.heatIndex);
  const el = document.createElement("div");
  el.className = "radar-node is-active";
  el.innerHTML = `
    <div class="node-pulse" style="background: radial-gradient(circle, ${color}88 0%, transparent 70%); border: 2px solid ${color}aa"></div>
    <div class="node-core" style="background: ${color}"></div>
    <div class="node-overlay">
      <div class="flex justify-between items-center mb-2 border-b border-white/10 pb-2">
        <span class="text-[10px] font-black text-[#60a5fa] font-mono uppercase">${node.sensorCode}</span>
        <span class="text-[10px] text-slate-500 font-mono">${node.phTimeString || node.time || ""}</span>
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
    .setLngLat([node.longitude || node.lng, node.latitude || node.lat])
    .addTo(map);

  map.flyTo({
    center: [node.longitude || node.lng, node.latitude || node.lat],
    zoom: 16,
    pitch: 45,
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
setInterval(() => syncData(false), 15000);
