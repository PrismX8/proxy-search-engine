const content = document.getElementById("content");
const urlbar = document.getElementById("urlbar");
const goBtn = document.getElementById("goBtn");

// Auto-detect proxy server URL
// If page is loaded from Express server (root path), use relative URL
// If loaded from live server (/client/ path), use Express server on port 3000
const PROXY_BASE = (() => {
  const path = window.location.pathname;
  
  // If we're being served from /client/ path, we're on a live server
  // and need to point to the Express server
  if (path.includes('/client/')) {
    return 'http://localhost:3000';
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

  const proxyUrl = (PROXY_BASE || '') + "/proxy?url=" + encodeURIComponent(u);
  console.log('Fetching from proxy:', proxyUrl);
  console.log('PROXY_BASE:', PROXY_BASE || '(empty - using relative URL)');
  console.log('Current origin:', window.location.origin);
  
  // Use 'same-origin' for relative URLs, 'cors' for cross-origin
  const fetchMode = PROXY_BASE ? 'cors' : 'same-origin';
  
  fetch(proxyUrl, {
    method: 'GET',
    mode: fetchMode,
    cache: 'no-cache',
    credentials: 'same-origin'
  })
    .then(r => {
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      }
      return r.text();
    })
    .then(html => {
      // Create a temporary container to parse the HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Rewrite all URLs to go through the proxy
      const proxyBase = (PROXY_BASE || '') + "/proxy?url=";
      const targetOrigin = new URL(u).origin;
      
      // Rewrite links
      tempDiv.querySelectorAll('a[href]').forEach(a => {
        try {
          const href = a.getAttribute('href');
          if (href && !href.startsWith('javascript:') && !href.startsWith('#')) {
            const absoluteUrl = new URL(href, u).href;
            a.href = proxyBase + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Rewrite images
      tempDiv.querySelectorAll('img[src]').forEach(img => {
        try {
          const src = img.getAttribute('src');
          if (src) {
            const absoluteUrl = new URL(src, u).href;
            img.src = (PROXY_BASE || '') + "/asset?url=" + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Rewrite CSS backgrounds and other resources
      tempDiv.querySelectorAll('link[href]').forEach(link => {
        try {
          const href = link.getAttribute('href');
          if (href) {
            const absoluteUrl = new URL(href, u).href;
            link.href = proxyBase + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Rewrite scripts
      tempDiv.querySelectorAll('script[src]').forEach(script => {
        try {
          const src = script.getAttribute('src');
          if (src) {
            const absoluteUrl = new URL(src, u).href;
            script.src = proxyBase + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Rewrite iframes
      tempDiv.querySelectorAll('iframe[src]').forEach(iframe => {
        try {
          const src = iframe.getAttribute('src');
          if (src) {
            const absoluteUrl = new URL(src, u).href;
            iframe.src = proxyBase + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Rewrite form actions
      tempDiv.querySelectorAll('form[action]').forEach(form => {
        try {
          const action = form.getAttribute('action');
          if (action) {
            const absoluteUrl = new URL(action, u).href;
            form.action = (PROXY_BASE || '') + "/proxy-fetch?url=" + encodeURIComponent(absoluteUrl);
          }
        } catch (e) {}
      });
      
      // Set the rewritten HTML
      content.innerHTML = tempDiv.innerHTML;
      
      // Note: Links are already rewritten to proxy URLs above
      // The proxy-helper.js will handle intercepting clicks to ensure they stay in proxy
      
      // Execute scripts after a delay to ensure DOM is ready
      setTimeout(() => {
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
      }, 100);
    })
    .catch(err => {
      console.error('Error loading URL:', err);
      console.error('Full error object:', err);
      let errorMsg = err.message || 'Unknown error';
      
      // Provide more helpful error messages
      if (err.message === 'Failed to fetch' || err.message.includes('NetworkError') || err.name === 'TypeError') {
        if (PROXY_BASE) {
          errorMsg = `Cannot connect to proxy server at ${PROXY_BASE}. Make sure the Express server is running.`;
        } else {
          errorMsg = `Cannot connect to proxy server. The Express server may not be running, or there was a network error.`;
        }
      } else if (err.message.includes('CORS')) {
        errorMsg = 'CORS error: The proxy server may not be allowing requests from this origin.';
      }
      
      const fullProxyUrl = PROXY_BASE ? proxyUrl : window.location.origin + proxyUrl;
      
      content.innerHTML = `
        <div style="padding: 20px; font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto;">
          <h1 style="color: #d32f2f;">Failed to load page</h1>
          <p><strong>Error:</strong> ${errorMsg}</p>
          <p><strong>Target URL:</strong> ${u}</p>
          <p><strong>Proxy URL:</strong> ${fullProxyUrl}</p>
          <p><strong>Proxy Base:</strong> ${PROXY_BASE || '(empty - using same origin)'}</p>
          <hr>
          <h3>Troubleshooting:</h3>
          <ol>
            <li><strong>Check if the server is running:</strong>
              <ul>
                <li>Open terminal and run: <code>npm start</code></li>
                <li>You should see: "WebToppings Clone v3 running at http://localhost:8080"</li>
                <li>Try accessing: <a href="${window.location.origin}/health" target="_blank">${window.location.origin}/health</a></li>
              </ul>
            </li>
            <li><strong>Check the browser console</strong> (F12) for more detailed error messages</li>
            <li><strong>Try accessing the proxy directly:</strong> <a href="${fullProxyUrl}" target="_blank">${fullProxyUrl}</a></li>
            <li><strong>Check network tab</strong> in browser dev tools to see the actual HTTP request/response</li>
          </ol>
          <p style="margin-top: 20px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
            <strong>Current page origin:</strong> ${window.location.origin}<br>
            <strong>Current page path:</strong> ${window.location.pathname}
          </p>
        </div>
      `;
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

// Check if proxy server is running
async function checkProxyServer() {
  const healthUrl = (PROXY_BASE || '') + "/health";
  try {
    const response = await fetch(healthUrl, { 
      method: 'GET',
      mode: 'cors',
      cache: 'no-cache'
    });
    if (response.ok) {
      console.log('Proxy server is running');
      return true;
    }
  } catch (err) {
    console.warn('Proxy server health check failed:', err);
    if (PROXY_BASE) {
      // Only show warning if we're using a remote proxy
      const warning = document.createElement('div');
      warning.style.cssText = 'background: #ff9800; color: white; padding: 10px; margin: 10px; border-radius: 4px;';
      warning.innerHTML = `<strong>Warning:</strong> Cannot connect to proxy server at ${PROXY_BASE}. Make sure the Express server is running: <code>npm start</code>`;
      document.body.insertBefore(warning, document.body.firstChild);
    }
    return false;
  }
  return false;
}

window.addEventListener('load', async () => {
  // Check server health
  await checkProxyServer();
  
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
