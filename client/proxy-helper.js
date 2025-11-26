(function() {
  function onClick(e) {
    try {
      const a = e.target.closest("a");
      if (!a || !a.href) return;

      const origin = window.location.origin;
      const proxyPrefix = origin + "/proxy?url=";

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
