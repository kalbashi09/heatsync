const { apiKey, apiURL } = HEALERTSYS_CONFIG;
let activeMarker = null;
let allNodes = [];
const drawer = document.getElementById("mainDrawer");

const map = new maplibregl.Map({
  container: "map",
  style:
    "https://tiles.basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  center: [123.82, 10.27],
  zoom: 13,
  attributionControl: false,
});

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

// --- 1. SEARCH LOGIC ---
document.getElementById("brgySearch").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase().trim();
  if (!term) {
    renderSidebar(allNodes);
    return;
  }
  const filtered = allNodes.filter((node) => {
    return (
      (node.barangayName || "").toLowerCase().includes(term) ||
      (node.displayName || "").toLowerCase().includes(term) ||
      (node.sensorCode || "").toLowerCase().includes(term)
    );
  });
  renderSidebar(filtered);
});

// --- 2. DATA SYNC LOGIC ---
async function syncData(flyToLatest = false) {
  const status = document.getElementById("sync-status");
  status.innerText = "SYNCING";

  try {
    const response = await fetch(apiURL, {
      headers: {
        Accept: "application/json",
        "X-Tunnel-Skip-Anti-Phishing-Page": "true",
      },
    });
    const data = await response.json();
    allNodes = data;

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

// --- 3. UI RENDERING (WITH TOP-2 LOGIC) ---
function renderSidebar(data) {
  const container = document.getElementById("sensorList");
  container.innerHTML = "";

  if (data.length === 0) {
    container.innerHTML = `<div class="text-slate-500 text-[10px] text-center py-10 uppercase font-mono tracking-widest">No nodes detected</div>`;
    return;
  }

  // --- START: ONE-PASS TOP-2 LOGIC ---
  let goldIndex = -1;
  let silverIndex = -1;
  let goldValue = -Infinity;
  let silverValue = -Infinity;

  for (let i = 0; i < data.length; i++) {
    const currentHeat = data[i].heatIndex;
    if (currentHeat > goldValue) {
      silverValue = goldValue;
      silverIndex = goldIndex;
      goldValue = currentHeat;
      goldIndex = i;
    } else if (currentHeat > silverValue) {
      silverValue = currentHeat;
      silverIndex = i;
    }
  }

  // Swap Gold to Index 0
  if (goldIndex !== -1) {
    [data[0], data[goldIndex]] = [data[goldIndex], data[0]];
    // If Gold was swapped with Silver's original position, update Silver's pointer
    if (silverIndex === 0) silverIndex = goldIndex;
  }

  // Swap Silver to Index 1
  if (silverIndex !== -1 && data.length > 1) {
    [data[1], data[silverIndex]] = [data[silverIndex], data[1]];
  }
  // --- END: TOP-2 LOGIC ---

  data.forEach((node, index) => {
    const heat = node.heatIndex;
    const colorHex = getHeatColor(heat);
    const colorClass = getTailwindColorClass(heat);

    const card = document.createElement("div");

    // Adding a subtle "Alert" indicator for the top 2 slots
    const isTopTwo = index < 2;
    const alertTag = isTopTwo
      ? `<span class="text-[8px] bg-white/10 px-1 rounded ml-2">PRIORITY</span>`
      : "";

    card.className = `bg-slate-900/30 border border-white/5 border-l-4 p-4 cursor-pointer hover:bg-white/[0.03] transition-all group ${isTopTwo ? "bg-white/[0.02]" : ""}`;
    card.style.borderLeftColor = colorHex;

    card.innerHTML = `
      <div class="flex justify-between items-start">
        <div class="max-w-[70%]">
          <div class="text-[9px] text-slate-500 font-mono mb-1 uppercase tracking-widest">
            ${node.sensorCode} ${alertTag}
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

    card.addEventListener("click", () => {
      focusNode(node);
      if (window.innerWidth < 768) drawer.classList.remove("is-expanded");
    });

    container.appendChild(card);
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
    padding: { bottom: window.innerWidth < 768 ? 180 : 0 },
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
setInterval(() => syncData(false), 30000);
