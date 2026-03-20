const { apiKey, apiURL } = HEALERTSYS_CONFIG;
let activeMarker = null;
let allNodes = []; // Global store for filtering
const drawer = document.getElementById("mainDrawer");

const map = new maplibregl.Map({
  container: "map",
  style:
    "https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [123.82, 10.27],
  zoom: 13,
  attributionControl: false,
});

// --- 1. SEARCH LOGIC ---
document.getElementById("brgySearch").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase().trim();

  if (!term) {
    renderSidebar(allNodes);
    return;
  }

  const filtered = allNodes.filter((node) => {
    const bName = (node.barangayName || "").toLowerCase();
    const dName = (node.displayName || "").toLowerCase();
    const sCode = (node.sensorCode || "").toLowerCase();
    return bName.includes(term) || dName.includes(term) || sCode.includes(term);
  });

  renderSidebar(filtered);
});

// --- 2. DATA SYNC LOGIC (Consolidated) ---
async function syncData(flyToLatest = false) {
  const status = document.getElementById("sync-status");
  status.innerText = "SYNCING";

  try {
    const response = await fetch(apiURL, {
      headers: {
        // ❌ REMOVED: "X-API-KEY": apiKey,
        Accept: "application/json",
        "X-Tunnel-Skip-Anti-Phishing-Page": "true",
      },
    });
    const data = await response.json();

    allNodes = data; // Save to global variable for searching

    // Check if user is currently searching so we don't break their view
    const currentSearch = document
      .getElementById("brgySearch")
      .value.toLowerCase()
      .trim();
    if (currentSearch) {
      const filtered = allNodes.filter(
        (n) =>
          (n.barangayName || "").toLowerCase().includes(currentSearch) ||
          (n.displayName || "").toLowerCase().includes(currentSearch),
      );
      renderSidebar(filtered);
    } else {
      renderSidebar(allNodes);
    }

    if (flyToLatest && data.length > 0) focusNode(data[0]);

    status.innerText = "READY";
  } catch (e) {
    status.innerText = "ERROR";
    console.error("Sync Error:", e);
  }
}

// --- 3. UI RENDERING ---
function renderSidebar(data) {
  const container = document.getElementById("sensorList");
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-xs text-center py-10">No sensors found for this search.</div>`;
    return;
  }

  data.forEach((node) => {
    const heat = node.heatIndex;
    const heatColor =
      heat >= 42
        ? "text-rose-500"
        : heat >= 39
          ? "text-amber-500"
          : "text-emerald-400";
    const borderSide = heat >= 42 ? "border-l-rose-600" : "border-l-slate-800";

    const card = document.createElement("div");
    card.className = `bg-slate-900/30 border border-slate-800 border-l-4 ${borderSide} p-4 cursor-pointer hover:bg-slate-800/50 transition-all group`;

    card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="max-w-[70%]">
                    <div class="text-[10px] text-slate-500 font-bold mb-1">${node.sensorCode}</div>
                    <div class="text-sm font-bold text-slate-200 truncate group-hover:text-blue-400">${node.displayName}</div>
                    <div class="text-[10px] text-slate-400 mt-1 italic">Brgy. ${node.barangayName}</div>
                </div>
                <div class="text-right">
                    <div class="text-xl font-bold ${heatColor}">${heat}°C</div>
                    <div class="text-[9px] text-slate-600 font-mono mt-1">${node.time}</div>
                </div>
            </div>
        `;

    card.addEventListener("click", () => {
      focusNode(node);
      if (window.innerWidth < 768) drawer.classList.remove("is-expanded");
    });

    container.appendChild(card);
  });
}

// --- 4. MAP & AUTH HELPERS ---
function focusNode(node) {
  if (activeMarker) activeMarker.remove();

  document.getElementById("active-sensor-code").innerText =
    `NODE: ${node.sensorCode}`;
  document.getElementById("last-ping").innerText = `PING: ${node.time}`;

  const color =
    node.heatIndex >= 42
      ? "#e11d48"
      : node.heatIndex >= 39
        ? "#f59e0b"
        : "#10b981";

  const el = document.createElement("div");
  el.className = "radar-node";
  el.innerHTML = `
        <div class="node-pulse" style="background: radial-gradient(circle, ${color}33 0%, transparent 70%); border: 1px solid ${color}44"></div>
        <div class="node-core" style="background: ${color}"></div>
        <div class="node-overlay">
            <div class="flex justify-between items-center mb-2 border-b border-slate-700 pb-2">
                <span class="text-[10px] font-bold text-blue-400">${node.sensorCode}</span>
                <span class="text-[10px] text-slate-500 font-mono">${node.date}</span>
            </div>
            <div class="text-xs font-bold text-white mb-1">${node.displayName}</div>
            <div class="text-[10px] text-slate-400 mb-3">Brgy. ${node.barangayName}</div>
            <div class="flex justify-between items-end">
                <div class="text-[10px] text-slate-500 uppercase tracking-widest">Heat Index</div>
                <div class="text-lg font-bold" style="color:${color}">${node.heatIndex}°C</div>
            </div>
        </div>
    `;

  activeMarker = new maplibregl.Marker({ element: el })
    .setLngLat([node.lng, node.lat])
    .addTo(map);

  map.flyTo({
    center: [node.lng, node.lat],
    zoom: 16,
    pitch: 45,
    padding: { bottom: window.innerWidth < 768 ? 250 : 0 },
  });
}

function toggleDrawer() {
  if (window.innerWidth < 768) drawer.classList.toggle("is-expanded");
}

function handleLogout() {
  sessionStorage.removeItem("isAdminAuthenticated");
  sessionStorage.removeItem("adminName");
  window.location.href = "logindash.html";
}

// Initialization
if (window.lucide) lucide.createIcons();
map.on("load", () => syncData(false));
setInterval(() => syncData(false), 30000);
