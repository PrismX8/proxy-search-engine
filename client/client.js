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
    // Fetch the proxied HTML
    fetch('/proxy?url=' + encodeURIComponent(cleanUrl))
      .then(response => response.text())
      .then(html => {
        document.getElementById('content').innerHTML = html;
        // Change URL to the target
        history.replaceState(null, '', cleanUrl);
        // Hide topbar
        document.getElementById('topbar').style.display = 'none';
      })
      .catch(err => {
        document.getElementById('content').innerHTML = '<h1>Error loading page</h1>';
      });
  }
});
