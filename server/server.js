import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import url from "url";
import zlib from "zlib";
import { pipeline } from "stream/promises";

const app = express();
const PORT = process.env.PORT || 3000;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// 1) Serve static client files (index.html, style.css, client.js, etc.)
app.use(express.static(path.join(__dirname, "../client")));

// 2) Explicit homepage route (optional, but clear)
// This will serve your UI when you open http://localhost:8080/
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/index.html"));
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json({ status: 'ok', message: 'Proxy server is running' });
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

  let targetUrl;
  try {
    targetUrl = new URL(target); // Validate URL
  } catch {
    return res.status(400).send('<html><head><title>Proxy Error</title></head><body><h1>Invalid URL</h1></body></html>');
  }

  try {
    // Build realistic browser headers
    // Note: We request 'identity' (no compression) to avoid decompression issues
    // Some sites send malformed compressed responses that are hard to handle
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'identity', // Request no compression to avoid decompression errors
      'Accept-Charset': 'UTF-8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'Referer': targetUrl.origin + '/',
      'Origin': targetUrl.origin
    };
    
    // Add cookies if present
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
    }
    
    console.log(`[PROXY] Headers sent:`, headers);
    
    // Fetch with redirect following and timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    const response = await fetch(target, { 
      headers,
      redirect: 'follow', // Follow redirects automatically
      signal: controller.signal,
      // Don't throw on HTTP error status codes
      // We'll handle them ourselves
    });
    
    clearTimeout(timeoutId);
    
    console.log(`[PROXY] Response status: ${response.status}, headers:`, Object.fromEntries(response.headers.entries()));
    
    // Check if response body exists
    if (!response.body) {
      console.error(`[PROXY ERROR] Response body is null or undefined for URL: ${target}`);
      return res.status(502).send('<html><head><title>Proxy Error</title></head><body><h1>No Response Body</h1><p>The server returned a response without a body.</p></body></html>');
    }
    
    // Handle cookies
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    
    // Set response status (even if not 200)
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except problematic ones
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      // Skip headers that shouldn't be forwarded
      if (lowerKey !== 'content-encoding' && 
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'content-length' && // Will be recalculated after decompression
          lowerKey !== 'connection' &&
          lowerKey !== 'keep-alive') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed (though we request 'identity', some servers may still compress)
    // If we requested identity but still got compression, try to decompress
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate') || contentEncoding.includes('br'))) {
      let decompressor;
      if (contentEncoding.includes('br')) {
        decompressor = zlib.createBrotliDecompress();
      } else if (contentEncoding.includes('gzip')) {
        decompressor = zlib.createGunzip();
      } else if (contentEncoding.includes('deflate')) {
        decompressor = zlib.createInflate();
      } else {
        // Unknown compression, try to pipe directly
        console.warn(`[PROXY] Unknown content-encoding: ${contentEncoding}, piping directly`);
        response.body.pipe(res);
        return;
      }
      
      let decompressionFailed = false;
      
      try {
        // Handle stream errors
        response.body.on('error', (err) => {
          console.error(`[PROXY ERROR] Response stream error during decompression:`, err);
          decompressionFailed = true;
          if (!res.headersSent) {
            // Remove content-encoding header and try raw
            res.removeHeader('content-encoding');
            response.body.pipe(res);
          } else {
            res.destroy();
          }
        });
        
        decompressor.on('error', (err) => {
          console.error(`[PROXY ERROR] Decompressor error:`, err);
          console.error(`[PROXY] Content-Encoding was: ${contentEncoding}`);
          decompressionFailed = true;
          
          if (!res.headersSent) {
            res.status(500).send('<html><head><title>Proxy Error</title></head><body><h1>Decompression Error</h1><p>Failed to decompress the response. The server may have sent malformed compressed data.</p></body></html>');
          } else {
            res.destroy();
          }
        });
        
        res.on('error', (err) => {
          console.error(`[PROXY ERROR] Response stream error:`, err);
        });
        
        if (!decompressionFailed) {
          await pipeline(response.body, decompressor, res);
        }
      } catch (err) {
        console.error(`[PROXY ERROR] Decompression pipeline failed:`, err);
        console.error(`[PROXY] Content-Encoding was: ${contentEncoding}`);
        
        if (!res.headersSent) {
          res.status(500).send('<html><head><title>Proxy Error</title></head><body><h1>Decompression Error</h1><p>Failed to process compressed response.</p><p>Error: ' + (err?.message || 'Unknown') + '</p></body></html>');
        } else {
          res.destroy();
        }
      }
    } else {
      // No compression, pipe directly with error handling
      response.body.on('error', (err) => {
        console.error(`[PROXY ERROR] Stream error:`, err);
        if (!res.headersSent) {
          res.status(500).send('<html><head><title>Proxy Error</title></head><body><h1>Stream Error</h1></body></html>');
        } else {
          res.destroy();
        }
      });
      
      res.on('error', (err) => {
        console.error(`[PROXY ERROR] Response stream error:`, err);
      });
      
      res.on('close', () => {
        console.log(`[PROXY] Response stream closed`);
      });
      
      response.body.pipe(res);
    }
  } catch (err) {
    console.error(`[PROXY ERROR] Full error for URL: ${target}:`, err);
    console.error(`[PROXY ERROR] Error name: ${err?.name}, code: ${err?.code}, message: ${err?.message}`);
    if (err?.stack) {
      console.error(`[PROXY ERROR] Stack trace:`, err.stack);
    }
    
    if (err.name === 'AbortError') {
      console.error(`[PROXY ERROR] Timeout for URL: ${target}`);
      if (!res.headersSent) {
        res.status(504).send('<html><head><title>Proxy Error</title></head><body><h1>Request Timeout</h1><p>The server took too long to respond.</p></body></html>');
      }
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      console.error(`[PROXY ERROR] Connection failed for URL: ${target}, Error:`, err?.message || err);
      if (!res.headersSent) {
        res.status(502).send('<html><head><title>Proxy Error</title></head><body><h1>Connection Failed</h1><p>Could not connect to the server. The site might be down or blocking the connection.</p></body></html>');
      }
    } else {
      console.error(`[PROXY ERROR] For URL: ${target}, Error:`, err?.message || err, err?.stack || '');
      if (!res.headersSent) {
        res.status(502).send('<html><head><title>Proxy Error</title></head><body><h1>Could not load the page</h1><p>The site might be blocking proxy access or is temporarily unreachable.</p><p>Error: ' + (err?.message || 'Unknown error') + '</p><p>Error code: ' + (err?.code || 'N/A') + '</p></body></html>');
      }
    }
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
    const targetUrl = new URL(target);
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': targetUrl.origin + '/',
      'Origin': targetUrl.origin,
      'DNT': '1',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(target, { 
      headers,
      redirect: 'follow',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except problematic ones
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'content-encoding' && 
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'content-length' &&
          lowerKey !== 'connection' &&
          lowerKey !== 'keep-alive') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate') || contentEncoding.includes('br'))) {
      let decompressor;
      if (contentEncoding.includes('br')) {
        decompressor = zlib.createBrotliDecompress();
      } else if (contentEncoding.includes('gzip')) {
        decompressor = zlib.createGunzip();
      } else {
        decompressor = zlib.createInflate();
      }
      
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
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).send("");
    } else {
      res.status(404).send("");
    }
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
    const targetUrl = new URL(target);
    const headers = {
      'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': req.headers['accept'] || '*/*',
      'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': req.headers['referer'] || targetUrl.origin + '/',
      'Origin': targetUrl.origin,
      'DNT': '1',
      'Connection': 'keep-alive',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin'
    };
    if (req.headers['cookie']) {
      headers['Cookie'] = req.headers['cookie'];
    }
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(target, {
      method: req.method,
      headers,
      redirect: 'follow',
      signal: controller.signal,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
    });
    
    clearTimeout(timeoutId);
    const setCookies = response.headers.raw()['set-cookie'];
    if (setCookies) {
      res.set('Set-Cookie', setCookies);
    }
    res.status(response.status);
    
    // Get content-encoding to check if we need to decompress
    const contentEncoding = response.headers.get('content-encoding');
    
    // Copy headers except problematic ones
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (lowerKey !== 'content-encoding' && 
          lowerKey !== 'transfer-encoding' &&
          lowerKey !== 'content-length' &&
          lowerKey !== 'connection' &&
          lowerKey !== 'keep-alive') {
        res.setHeader(key, value);
      }
    });
    
    // Handle decompression if needed
    if (contentEncoding && (contentEncoding.includes('gzip') || contentEncoding.includes('deflate') || contentEncoding.includes('br'))) {
      let decompressor;
      if (contentEncoding.includes('br')) {
        decompressor = zlib.createBrotliDecompress();
      } else if (contentEncoding.includes('gzip')) {
        decompressor = zlib.createGunzip();
      } else {
        decompressor = zlib.createInflate();
      }
      
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
  } catch (err) {
    if (err.name === 'AbortError') {
      res.status(504).send("");
    } else {
      res.status(404).send("");
    }
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
