(function() {
  // Auto-detect proxy server URL (same logic as client.js)
  const PROXY_BASE = (() => {
    const path = window.location.pathname;
    if (path.includes('/client/')) {
      return 'http://localhost:3000';
    }
    return '';
  })();

  function onClick(e) {
    try {
      const a = e.target.closest("a");
      if (!a) return;

      // Get the href attribute (not the resolved href property)
      const href = a.getAttribute('href');
      if (!href) return;

      // Skip javascript: and anchor links
      if (href.startsWith('javascript:') || href.startsWith('#') || href === '') {
        return;
      }

      const proxyOrigin = PROXY_BASE || window.location.origin;
      const proxyPrefix = proxyOrigin + "/proxy?url=";

      e.preventDefault();
      e.stopPropagation();

      let target = href;

      // If it's already a proxy URL, use it directly
      if (target.startsWith('/proxy?url=') || target.startsWith(proxyPrefix)) {
        // Make it absolute if it's relative
        if (target.startsWith('/proxy?url=')) {
          target = proxyOrigin + target;
        }
        window.location.href = target;
        return;
      }

      // If it's a relative URL, make it absolute first
      try {
        const absoluteUrl = new URL(href, window.location.href).href;
        target = proxyPrefix + encodeURIComponent(absoluteUrl);
        window.location.href = target;
      } catch (err) {
        console.error('Error processing link:', err);
        // Fallback: try to use the href as-is
        target = proxyPrefix + encodeURIComponent(href);
        window.location.href = target;
      }
    } catch (err) {
      console.error('Error in link click handler:', err);
    }
  }

  document.addEventListener("click", onClick, true);
})();
