import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import url from "url";

const app = express();
const PORT = 8080;

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "../client")));

function rewriteLinks(html, baseUrl) {
    const $ = cheerio.load(html);

    // Rewrite anchors to go through /proxy
    $("a[href]").each((_, el) => {
        const orig = $(el).attr("href");
        if (!orig) return;
        try {
            const abs = new URL(orig, baseUrl).href;
            $(el).attr("href", "/proxy?url=" + encodeURIComponent(abs));
        } catch {}
    });

    // Rewrite assets to go through /asset
    $("img[src], script[src], link[href]").each((_, el) => {
        const attr = $(el).attr("src") ? "src" : "href";
        const orig = $(el).attr(attr);
        if (!orig) return;
        try {
            const abs = new URL(orig, baseUrl).href;
            $(el).attr(attr, "/asset?url=" + encodeURIComponent(abs));
        } catch {}
    });

    // Inject helper script that normalizes link clicks
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
        return res.sendFile(path.join(__dirname, "../client/fallback/fallback.html"));
    }

    try {
        const response = await fetch(target);
        const html = await response.text();
        const rewritten = rewriteLinks(html, target);
        res.send(rewritten);
    } catch (err) {
        console.error("Proxy error for", target, err?.message || err);
        res.sendFile(path.join(__dirname, "../client/fallback/fallback.html"));
    }
});

app.get("/asset", async (req, res) => {
    const target = req.query.url;
    if (!target) return res.status(400).send("");

    try {
        const response = await fetch(target);
        const buf = Buffer.from(await response.arrayBuffer());
        res.set("Content-Type", response.headers.get("content-type") || "application/octet-stream");
        res.send(buf);
    } catch {
        res.status(404).send("");
    }
});

app.listen(PORT, () => {
    console.log("WebToppings Clone v3 running at http://localhost:" + PORT);
});
