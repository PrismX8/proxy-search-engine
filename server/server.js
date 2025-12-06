import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import url from "url";

const app = express();
const PORT = 8080;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 1) Serve static client files (index.html, style.css, client.js, etc.)
app.use(express.static(path.join(__dirname, "../client")));

// 2) Explicit homepage route (optional, but clear)
// This will serve your UI when you open http://localhost:8080/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// 3) Proxy HTML
function rewriteLinks(html, baseUrl) {
  const $ = cheerio.load(html);

  $("a[href]").each((_, el) => {
    const orig = $(el).attr("href");
    if (!orig) return;
    try {
      const abs = new URL(orig, baseUrl).href;
      $(el).attr("href", "/proxy?url=" + encodeURIComponent(abs));
    } catch {}
  });

  $("img[src], script[src], link[href]").each((_, el) => {
    const attr = $(el).attr("src") ? "src" : "href";
    const orig = $(el).attr(attr);
    if (!orig) return;
    try {
      const abs = new URL(orig, baseUrl).href;
      $(el).attr(attr, "/asset?url=" + encodeURIComponent(abs));
    } catch {}
  });

  // inject helper script so clicks go back through /proxy
  const helperTag = '<script src="/proxy-helper.js"></script>';
  if ($("head").length) {
    $("head").append(helperTag);
  } else {
    $("body").append(helperTag);
  }

  return $.html();
}

app.get("/proxy", async (req, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).send('<html><head><title>Proxy Error</title></head><body><h1>Invalid URL</h1></body></html>');
  }

  try {
    new URL(target); // Validate URL
  } catch {
    return res.status(400).send('<html><head><title>Proxy Error</title></head><body><h1>Invalid URL</h1></body></html>');
  }

  try {
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.5',
      'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate',
      'Cookie': req.headers['cookie'] || '',
      'Cache-Control': req.headers['cache-control'] || 'no-cache',
      'Pragma': req.headers['pragma'] || 'no-cache'
    };
    const response = await fetch(target, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    const html = await response.text();
    const rewritten = rewriteLinks(html, target);
    // Make undetectable by overriding location properties
    const targetUrl = new URL(target);
    const targetOrigin = targetUrl.origin;
    const undetectableScript = `<script>
      Object.defineProperty(window.location, 'origin', {get: () => '${targetOrigin}'});
      Object.defineProperty(window.location, 'hostname', {get: () => '${targetUrl.hostname}'});
      Object.defineProperty(window.location, 'protocol', {get: () => '${targetUrl.protocol}'});
      Object.defineProperty(window.location, 'host', {get: () => '${targetUrl.host}'});
    </script>`;
    const modifiedHtml = rewritten.replace('<body>', '<body>' + undetectableScript);
    res.send(modifiedHtml);
  } catch (err) {
    console.error("Proxy error for", target, err?.message || err);
    res.status(502).send('<html><head><title>Proxy Error</title></head><body><h1>Could not load the page</h1><p>The site might be blocking proxy access or is temporarily unreachable.</p></body></html>');
  }
});

// 4) Proxy assets
app.get("/asset", async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send("");

  try {
    new URL(target); // Validate URL
  } catch {
    return res.status(400).send("");
  }

  try {
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': req.headers['accept'] || 'image/webp,*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.5',
      'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate',
      'Referer': new URL(target).origin,
      'Cookie': req.headers['cookie'] || '',
      'Cache-Control': req.headers['cache-control'] || 'no-cache',
      'Pragma': req.headers['pragma'] || 'no-cache'
    };
    const response = await fetch(target, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    const buf = Buffer.from(await response.arrayBuffer());
    res.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.send(buf);
  } catch {
    res.status(404).send("");
  }
});

// 5) Catch-all route (AFTER all other routes)
// This will match anything not handled above
app.get("*", (req, res) => {
  res.status(404).send(`You requested: ${req.path}`);
});

app.listen(PORT, () => {
  console.log("WebToppings Clone v3 running at http://localhost:" + PORT);
});
