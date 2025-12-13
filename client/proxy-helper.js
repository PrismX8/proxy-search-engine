(function() {
  // Auto-detect proxy server URL (same logic as client.js)
  const PROXY_BASE = (() => {
    const path = window.location.pathname;
    if (path.includes('/client/')) {
      return 'http://localhost:8080';
    }
    return '';
  })();

  function onClick(e) {
    try {
      const a = e.target.closest("a");
      if (!a || !a.href) return;

      const proxyOrigin = PROXY_BASE || window.location.origin;
      const proxyPrefix = proxyOrigin + "/proxy?url=";

      e.preventDefault();
      e.stopPropagation();

      let target = a.href;

      if (!target.startsWith(proxyPrefix)) {
        target = proxyPrefix + encodeURIComponent(target);
      }

      window.location.href = target;
    } catch (err) {
      // ignore
    }
  }

  document.addEventListener("click", onClick, true);
})();
