const iframe = document.getElementById("view");
const urlbar = document.getElementById("urlbar");
const goBtn = document.getElementById("goBtn");

function loadURL(raw) {
  let u = raw.trim();
  if (!u) return;

  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }

  iframe.src = "/proxy?url=" + encodeURIComponent(u);
  urlbar.value = u;
}

goBtn.addEventListener("click", () => {
  loadURL(urlbar.value);
});

urlbar.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    loadURL(urlbar.value);
  }
});

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
    loadURL(cleanUrl);
    // Hide topbar
    document.getElementById('topbar').style.display = 'none';
  }
});
