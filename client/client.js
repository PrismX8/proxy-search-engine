let lastProxiedTarget = null;

window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const url = urlParams.get('url');
  if (url) {
    let cleanUrl = decodeURIComponent(url);
    try {
      const parsed = new URL(cleanUrl);
      if (parsed.port && parseInt(parsed.port) < 10) {
        parsed.port = '';
        cleanUrl = parsed.toString();
      }
    } catch {}
    document.getElementById('urlbar').value = cleanUrl;
    loadURL(cleanUrl);
    // Hide the proxy interface
    document.getElementById('topbar').style.display = 'none';
    document.getElementById('blockedOverlay').style.display = 'none';
  }
});

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
