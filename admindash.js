// Simple Route Guard
if (sessionStorage.getItem("isAdminAuthenticated") !== "true") {
  window.location.href = "logindash.html";
}

const API_BASE = "https://3h48gqgv-5000.asse.devtunnels.ms/api";
let isEditMode = true; // Global state

async function loadSensors() {
  try {
    const response = await fetch(`${API_BASE}/sensors?includeInactive=true`);
    if (!response.ok)
      throw new Error(`Server responded with ${response.status}`);

    const sensors = await response.json();
    const tbody = document.getElementById("sensorBody");
    tbody.innerHTML = ""; // Clear existing

    sensors.forEach((s) => {
      const statusBadge = s.isActive
        ? `<span class="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-bold border border-green-500/50">ACTIVE</span>`
        : `<span class="bg-red-500/20 text-red-400 px-2 py-1 rounded-full text-xs font-bold border border-red-500/50">INACTIVE</span>`;

      const tr = document.createElement("tr");
      tr.className =
        "hover:bg-slate-700/50 transition border-b border-slate-700";

      tr.innerHTML = `
        <td class="px-6 py-4 font-mono text-cyan-400">${s.sensorCode}</td>
        <td class="px-6 py-4 font-semibold text-white">${s.displayName}</td>
        <td class="px-6 py-4 text-slate-400">${s.barangay}</td>
        <td class="px-6 py-4">${statusBadge}</td>
        <td class="px-6 py-4 text-center">
            <div class="flex items-center justify-center gap-2">
                <button class="edit-btn bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-md text-sm transition shadow-lg shadow-blue-900/20">
                    Edit
                </button>
                <button class="delete-btn bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/50 px-3 py-1.5 rounded-md text-sm transition">
                    Delete
                </button>
            </div>
        </td>`;

      // --- ATTACH LISTENERS INSIDE THE LOOP ---
      tr.querySelector(".edit-btn").addEventListener("click", () => {
        handleEditClick(s);
      });

      tr.querySelector(".delete-btn").addEventListener("click", async () => {
        const confirmed = confirm(
          `⚠️ DANGER: Permanent delete ${s.sensorCode}?`,
        );
        if (confirmed) {
          try {
            const res = await fetch(`${API_BASE}/sensors/${s.id}`, {
              method: "DELETE",
              headers: {
                "X-API-KEY": HEALERTSYS_CONFIG.apiKey,
                "X-Tunnel-Skip-Anti-Phishing-Page": "true",
              },
            });
            if (res.ok) {
              loadSensors();
            } else {
              alert("❌ Delete Failed");
            }
          } catch (err) {
            alert("Critical: Server Unreachable");
          }
        }
      });

      tbody.appendChild(tr); // Add to the table
    }); // End of forEach

    // --- ADD THESE LINES HERE ---
  } catch (err) {
    console.error("Critical: Failed to sync with backend.", err);
    alert("Connection Error: Backend unreachable!");
  }
} // End of loadSensors

// Handle Edit Button Click
function handleEditClick(sensor) {
  isEditMode = true;

  document.getElementById("editSection").classList.remove("hidden");
  document.getElementById("noSelection").classList.add("hidden");
  document.getElementById("formTitle").innerText = `Edit: ${sensor.sensorCode}`;

  // Map data to inputs
  document.getElementById("sensorId").value = sensor.id || "";
  document.getElementById("editCode").value = sensor.sensorCode;
  document.getElementById("editName").value = sensor.displayName;
  document.getElementById("editBarangay").value = sensor.barangay;
  document.getElementById("editLat").value = sensor.lat;
  document.getElementById("editLng").value = sensor.lng;
  document.getElementById("editBaseline").value = sensor.baselineTemp;
  document.getElementById("editEnv").value =
    sensor.environmentType || "Unknown";
  document.getElementById("editActive").value = sensor.isActive.toString();

  // Lock the code field for edits
  const codeField = document.getElementById("editCode");
  codeField.disabled = true;
  codeField.classList.add("opacity-70", "cursor-not-allowed");

  document.querySelector('#updateForm button[type="submit"]').innerText =
    "Save Changes";
}

// Search Logic (Works on typing AND prevents Enter-key refresh)
document.getElementById("sensorSearch").addEventListener("keydown", (e) => {
  if (e.key === "Enter") e.preventDefault(); // Stop page refresh
});

document.getElementById("sensorSearch").addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  const rows = document.querySelectorAll("#sensorBody tr");

  rows.forEach((row) => {
    const code = row.children[0].textContent.toLowerCase();
    const barangay = row.children[2].textContent.toLowerCase();
    row.style.display =
      code.includes(term) || barangay.includes(term) ? "" : "none";
  });
});

// Open Create Mode
function openCreateMode() {
  isEditMode = false;

  document.getElementById("editSection").classList.remove("hidden");
  document.getElementById("noSelection").classList.add("hidden");
  document.getElementById("formTitle").innerText = "Register New Sensor";

  document.getElementById("updateForm").reset();

  const codeField = document.getElementById("editCode");
  codeField.disabled = false;
  codeField.classList.remove("opacity-70", "cursor-not-allowed");

  document.querySelector('#updateForm button[type="submit"]').innerText =
    "Register Sensor";
}

// Close/Cancel
function closeEdit() {
  document.getElementById("editSection").classList.add("hidden");
  document.getElementById("noSelection").classList.remove("hidden");
  document.getElementById("updateForm").reset();
}

// Submit Logic (POST vs PATCH)
document.getElementById("updateForm").onsubmit = async (e) => {
  e.preventDefault();

  const id = document.getElementById("sensorId").value;
  const sensorCode = document.getElementById("editCode").value;

  const data = {
    sensorCode: sensorCode,
    displayName: document.getElementById("editName").value,
    barangay: document.getElementById("editBarangay").value,
    lat: parseFloat(document.getElementById("editLat").value) || 0,
    lng: parseFloat(document.getElementById("editLng").value) || 0,
    baselineTemp: parseInt(document.getElementById("editBaseline").value) || 30,
    environmentType: document.getElementById("editEnv").value,
    isActive: document.getElementById("editActive").value === "true",
  };

  const url = isEditMode
    ? `${API_BASE}/sensors/${id}`
    : `${API_BASE}/register-sensor`;
  const method = isEditMode ? "PATCH" : "POST";

  try {
    const res = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": HEALERTSYS_CONFIG.apiKey,
        "X-Tunnel-Skip-Anti-Phishing-Page": "true",
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      alert(
        isEditMode ? `✅ Updated ${sensorCode}` : `✅ Registered ${sensorCode}`,
      );
      loadSensors();
      closeEdit();
    } else {
      alert("❌ Error: " + (await res.text()));
    }
  } catch (err) {
    alert("Critical: Could not reach the server.");
  }
};

function handleLogout() {
  // 1. Optional: Add a confirmation
  if (!confirm("Are you sure you want to logout of HeatSync Admin?")) return;

  // 2. Clear session/local storage (if you used them for login)
  localStorage.removeItem("adminLoggedIn");
  localStorage.removeItem("adminUser");
  sessionStorage.clear();

  // 3. Redirect to login page
  window.location.href = "logindash.html";
}

// Start!
loadSensors();
