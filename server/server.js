import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import url from "url";
import zlib from "zlib";
import { pipeline } from "stream/promises";

const app = express();
const PORT = process.env.PORT || 8080;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 1) Serve static client files (index.html, style.css, client.js, etc.)
app.use(express.static(path.join(__dirname, "../client")));

// 2) Explicit homepage route (optional, but clear)
// This will serve your UI when you open http://localhost:8080/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});


app.get("/proxy", async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  const target = req.query.url;
  console.log(`[PROXY] Requesting URL: ${target}`);
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
    console.log(`[PROXY] Headers sent:`, headers);
    const response = await fetch(target, { headers });
    console.log(`[PROXY] Response status: ${response.status}, headers:`, Object.fromEntries(response.headers.entries()));
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except content-encoding and transfer-encoding
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate'))) {
      const decompressor = contentEncoding.includes('gzip') 
        ? zlib.createGunzip() 
        : zlib.createInflate();
      
      try {
        await pipeline(response.body, decompressor, res);
      } catch (err) {
        console.error(`[PROXY ERROR] Decompression failed:`, err);
        res.status(500).send('<html><head><title>Proxy Error</title></head><body><h1>Decompression Error</h1></body></html>');
      }
    } else {
      // No compression, pipe directly
      response.body.pipe(res);
    }
  } catch (err) {
    console.error(`[PROXY ERROR] For URL: ${target}, Error:`, err?.message || err, err?.stack || '');
    res.status(502).send('<html><head><title>Proxy Error</title></head><body><h1>Could not load the page</h1><p>The site might be blocking proxy access or is temporarily unreachable.</p></body></html>');
  }
});

// 4) Proxy assets
app.get("/asset", async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
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
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except content-encoding and transfer-encoding
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate'))) {
      const decompressor = contentEncoding.includes('gzip') 
        ? zlib.createGunzip() 
        : zlib.createInflate();
      
      try {
        await pipeline(response.body, decompressor, res);
      } catch (err) {
        console.error(`[PROXY ERROR] Decompression failed:`, err);
        res.status(500).send("");
      }
    } else {
      // No compression, pipe directly
      response.body.pipe(res);
    }
  } catch {
    res.status(404).send("");
  }
});

// 4.5) Proxy fetch requests
app.all("/proxy-fetch", async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', '*');
  const target = req.query.url;
  if (!target) return res.status(400).send("");

  try {
    new URL(target);
  } catch {
    return res.status(400).send("");
  }

  try {
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.5',
      'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate',
      'Cookie': req.headers['cookie'] || '',
      'Cache-Control': req.headers['cache-control'] || 'no-cache',
      'Pragma': req.headers['pragma'] || 'no-cache',
      'Referer': req.headers['referer'] || new URL(target).origin,
      'Content-Type': req.headers['content-type'] || '',
    };
    const response = await fetch(target, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined, // Note: for body, need to handle stream
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except content-encoding and transfer-encoding
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate'))) {
      const decompressor = contentEncoding.includes('gzip') 
        ? zlib.createGunzip() 
        : zlib.createInflate();
      
      try {
        await pipeline(response.body, decompressor, res);
      } catch (err) {
        console.error(`[PROXY ERROR] Decompression failed:`, err);
        res.status(500).send("");
      }
    } else {
      // No compression, pipe directly
      response.body.pipe(res);
    }
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
