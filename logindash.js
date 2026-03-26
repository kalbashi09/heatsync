// Initialize Icons
lucide.createIcons();

// Login Logic Placeholder
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const personnelId = document.getElementById("personnelId").value;
  const passcode = document.getElementById("passcode").value;
  const errorDiv = document.getElementById("errorMessage");

  // Replace with your actual fetch call to /api/auth/login
  console.log("Attempting login for:", personnelId);
});

// Initialize Lucide icons on load
document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    lucide.createIcons();
  }
});

const loginForm = document.getElementById("loginForm");
const errorDiv = document.getElementById("errorMessage");
const errorText = errorDiv.querySelector("span");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // 1. UI Reset
  errorDiv.classList.add("hidden");
  const submitBtn = loginForm.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;

  // Visual feedback for the i7-4700MQ processing speed
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-5 h-5"></i> Authenticating...`;
  lucide.createIcons();

  const payload = {
    PersonnelId: document.getElementById("personnelId").value.trim(),
    Passcode: document.getElementById("passcode").value,
  };

  try {
    // 2. API Call to your C# Backend
    // Ensure the URL matches your Kestrel config (Default is http://localhost:5000)
    const response = await fetch(
      "https://heatsyncserver-1.onrender.com/api/auth/login",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const result = await response.json();

    if (response.ok) {
      // 3. Success Logic
      console.log("Access Granted:", result.user);

      // Store session data so admindash.html knows who is logged in
      sessionStorage.setItem("isAdminAuthenticated", "true");
      sessionStorage.setItem("adminName", result.user);
      sessionStorage.setItem("loginTime", new Date().toISOString());

      // Redirect to the dashboard
      window.location.href = "admindash.html";
    } else {
      // 4. Handle 401 Unauthorized or 404
      showError(result.message || "Access Denied. Check credentials.");
    }
  } catch (err) {
    // 5. Handle Network/Server Down
    showError("Server Connection Failed. Is the Backend running?");
    console.error("Login Error:", err);
  } finally {
    // Restore button state
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
    lucide.createIcons();
  }
});

function showError(message) {
  errorText.textContent = message;
  errorDiv.classList.remove("hidden");
  // Shake effect for that premium feel
  errorDiv.classList.add("animate-bounce");
  setTimeout(() => errorDiv.classList.remove("animate-bounce"), 1000);
}
