const content = document.getElementById("content");
const urlbar = document.getElementById("urlbar");
const goBtn = document.getElementById("goBtn");

function loadURL(raw) {
  let u = raw.trim();
  if (!u) return;

  if (!/^https?:\/\//i.test(u)) {
    u = "https://" + u;
  }

  fetch("/proxy?url=" + encodeURIComponent(u))
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
