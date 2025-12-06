let lastProxiedTarget = null;

const urlParams = new URLSearchParams(window.location.search);
const targetUrl = urlParams.get('url');

if (targetUrl) {
  // Automatically load the URL
  document.getElementById('view').src = targetUrl;
  lastProxiedTarget = targetUrl; // Update the variable
  // Optionally hide the form
  document.getElementById('topbar').style.display = 'none';
  document.getElementById('blockedOverlay').style.display = 'none';
}

const iframe = document.getElementById("view");
const urlbar = document.getElementById("urlbar");
const goBtn = document.getElementById("goBtn");
const overlay = document.getElementById("blockedOverlay");
const openDirectBtn = document.getElementById("openDirectBtn");


function loadURL(raw) {
  let u = raw.trim();
  if (!u) return;

  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }

  lastProxiedTarget = u;
  iframe.src = "/proxy?url=" + encodeURIComponent(u);
  urlbar.value = u;
  overlay.classList.add("hidden");
}

goBtn.addEventListener("click", () => {
  loadURL(urlbar.value);
});

urlbar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    loadURL(urlbar.value);
  }
});

iframe.addEventListener("load", () => {
  const origin = window.location.origin;
  const src = iframe.src;

  if (src.startsWith(origin + "/proxy?")) {
    overlay.classList.add("hidden");
    return;
  }

  try {
    const externalUrl = src;

    if (externalUrl !== lastProxiedTarget) {
      lastProxiedTarget = externalUrl;
      iframe.src = "/proxy?url=" + encodeURIComponent(externalUrl);
      urlbar.value = externalUrl;
    } else {
      overlay.classList.remove("hidden");
    }
  } catch (err) {
    overlay.classList.remove("hidden");
  }
});

openDirectBtn.addEventListener("click", () => {
  if (lastProxiedTarget) {
    window.open(lastProxiedTarget, "_blank");
  }
});
