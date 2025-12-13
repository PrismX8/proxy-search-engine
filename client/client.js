const content = document.getElementById("content");
const urlbar = document.getElementById("urlbar");
const goBtn = document.getElementById("goBtn");

// Auto-detect proxy server URL
// If page is loaded from Express server (root path), use relative URL
// If loaded from live server (/client/ path), use Express server on port 8080
const PROXY_BASE = (() => {
  const path = window.location.pathname;
  
  // If we're being served from /client/ path, we're on a live server
  // and need to point to the Express server
  if (path.includes('/client/')) {
    return 'http://localhost:8080';
  }
  
  // Otherwise, assume we're on the Express server and use relative URLs
  return '';
})();

function loadURL(raw) {
  let u = raw.trim();
  if (!u) return;

  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }

  fetch((PROXY_BASE || '') + "/proxy?url=" + encodeURIComponent(u))
    .then(r => r.text())
    .then(html => {
      content.innerHTML = html;
      // Execute scripts
      const scripts = content.querySelectorAll('script');
      scripts.forEach(script => {
        const newScript = document.createElement('script');
        if (script.src) {
          newScript.src = script.src;
        } else {
          newScript.textContent = script.textContent;
        }
        document.head.appendChild(newScript);
      });
    });
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
