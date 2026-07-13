import { createServer } from "node:http";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3037);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    const envPath = path.join(__dirname, name);
    try {
      const raw = readFileSync(envPath, "utf8");
      applyEnv(raw);
    } catch {
      // Ignore missing env files.
    }
  }
}

function applyEnv(raw) {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-mcp-session-id, x-ads-mcp-authorization",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({ raw: "", parsed: undefined });
        return;
      }

      const contentType = String(req.headers["content-type"] || "");
      if (!contentType.includes("application/json")) {
        resolve({ raw, parsed: undefined });
        return;
      }

      try {
        resolve({ raw, parsed: JSON.parse(raw) });
      } catch {
        resolve({ raw, parsed: undefined });
      }
    });
    req.on("error", reject);
  });
}

function createResponseHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code;
    return res;
  };

  res.json = function json(payload) {
    if (!res.getHeader("Content-Type")) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify(payload));
  };

  res.send = function send(payload) {
    if (typeof payload === "object" && !Buffer.isBuffer(payload)) {
      return res.json(payload);
    }
    res.end(payload);
  };

  return res;
}

async function handleApiRoute(req, res, pathname, query) {
  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  const routeName = pathname.slice("/api/".length);
  if (!routeName) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const routePath = path.join(__dirname, "api", `${routeName}.js`);
  try {
    const stat = await fs.stat(routePath);
    if (!stat.isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
  } catch {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  const { parsed } = await parseBody(req);
  req.query = query;
  req.body = parsed;

  setCorsHeaders(res);
  createResponseHelpers(res);

  try {
    const moduleUrl = `${pathToFileURL(routePath).href}?v=${Date.now()}`;
    const mod = await import(moduleUrl);
    const handler = mod.default;

    if (typeof handler !== "function") {
      res.status(500).json({ error: `Invalid API route: ${routeName}` });
      return;
    }

    await handler(req, res);
  } catch (err) {
    res.status(500).json({
      error: "API route failed",
      route: routeName,
      details: err instanceof Error ? err.message : String(err),
    });
  }
}

async function serveStatic(pathname, res) {
  const relativePath =
    pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(__dirname, relativePath);

  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    const content = await fs.readFile(filePath);

    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType);
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end("Not found");
  }
}

loadEnvFiles();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || `localhost:${PORT}`}`,
    );

    if (url.pathname.startsWith("/api/")) {
      const query = Object.fromEntries(url.searchParams.entries());
      await handleApiRoute(req, res, url.pathname, query);
      return;
    }

    await serveStatic(url.pathname, res);
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(
      JSON.stringify({
        error: "Server error",
        details: err instanceof Error ? err.message : String(err),
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(
    `GameTruck dashboard local server running at http://localhost:${PORT}`,
  );
});
