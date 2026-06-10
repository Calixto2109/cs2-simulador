const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT) || 3000;
const priceCache = new Map();
const CACHE_TIME = 30 * 60 * 1000;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(data));
}

async function handlePrice(requestUrl, response) {
  const marketName = requestUrl.searchParams.get("name");
  if (!marketName || marketName.length > 220) {
    sendJson(response, 400, { error: "Nome de mercado inválido." });
    return;
  }

  const cached = priceCache.get(marketName);
  if (cached && Date.now() - cached.cachedAt < CACHE_TIME) {
    sendJson(response, 200, { ...cached, cached: true });
    return;
  }

  try {
    const steamUrl = new URL("https://steamcommunity.com/market/priceoverview/");
    steamUrl.searchParams.set("appid", "730");
    steamUrl.searchParams.set("currency", "7");
    steamUrl.searchParams.set("market_hash_name", marketName);
    const steamResponse = await fetch(steamUrl, {
      headers: { "User-Agent": "Dropzone-CS2-Simulator/1.0" },
      signal: AbortSignal.timeout(9000)
    });
    const result = await steamResponse.json();
    if (!steamResponse.ok || !result.success) throw new Error("Preço não disponível");

    const data = {
      marketName,
      lowestPrice: result.lowest_price || null,
      medianPrice: result.median_price || null,
      volume: result.volume || null,
      fetchedAt: new Date().toISOString(),
      cachedAt: Date.now()
    };
    priceCache.set(marketName, data);
    sendJson(response, 200, data);
  } catch (error) {
    sendJson(response, 503, {
      error: "O Mercado da Comunidade não retornou um preço agora.",
      marketName
    });
  }
}

function serveFile(requestUrl, response) {
  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.resolve(root, `.${pathname}`);
  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": mimeTypes[extension] || "application/octet-stream",
    "Cache-Control": extension === ".json" ? "public, max-age=3600" : "no-cache"
  });
  fs.createReadStream(filePath).pipe(response);
}

http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  if (requestUrl.pathname === "/api/price") {
    await handlePrice(requestUrl, response);
    return;
  }
  serveFile(requestUrl, response);
}).listen(port, () => {
  console.log(`Dropzone disponível em http://localhost:${port}`);
});
