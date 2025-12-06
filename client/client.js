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
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const bodyContent = doc.body.innerHTML;
        document.getElementById('content').innerHTML = bodyContent;
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
