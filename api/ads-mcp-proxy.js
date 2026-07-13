const ADS_MCP_URL = "https://ads-mcp.microservices.gametrucksys.com/mcp";
const ADS_MCP_ORIGIN = "https://ads-mcp.microservices.gametrucksys.com";

function normalizeForwardUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== ADS_MCP_ORIGIN) return null;
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function filterForwardHeaders(inputHeaders) {
  const allowed = new Set(["accept", "content-type", "authorization"]);
  const out = {};

  if (!inputHeaders || typeof inputHeaders !== "object") return out;
  for (const [key, value] of Object.entries(inputHeaders)) {
    const lowered = String(key || "").toLowerCase();
    if (!allowed.has(lowered)) continue;
    if (value == null) continue;
    out[key] = String(value);
  }
  return out;
}

function asBodyString(value) {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  return String(value);
}

async function readRequestJson(req) {
  if (req.body && typeof req.body === "object") return req.body;

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
  }
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = await readRequestJson(req);
  } catch (err) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const forwardUrl = normalizeForwardUrl(body && body.forwardUrl);
  if (forwardUrl) {
    const method = String((body && body.method) || "GET").toUpperCase();
    if (!["GET", "POST"].includes(method)) {
      res.status(400).json({ error: "Forward method must be GET or POST" });
      return;
    }

    try {
      const upstream = await fetch(forwardUrl, {
        method,
        headers: {
          Accept: "application/json",
          ...filterForwardHeaders(body && body.headers),
        },
        body: method === "GET" ? undefined : asBodyString(body && body.body),
      });

      const responseText = await upstream.text();
      const contentType =
        upstream.headers.get("content-type") || "application/json";
      const challenge = upstream.headers.get("www-authenticate");

      res.status(upstream.status);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "no-store");
      if (challenge) res.setHeader("www-authenticate", challenge);
      res.send(responseText);
      return;
    } catch (err) {
      res
        .status(502)
        .json({ error: "Failed to reach Ads MCP", details: err.message });
      return;
    }
  }

  const authorization =
    req.headers.authorization || req.headers["x-ads-mcp-authorization"];
  if (!authorization) {
    res.status(400).json({ error: "Missing Authorization header" });
    return;
  }

  const payload =
    body && typeof body === "object" && body.payload ? body.payload : body;
  if (!payload || typeof payload !== "object") {
    res.status(400).json({ error: "Missing JSON-RPC payload" });
    return;
  }

  const sessionId =
    (body && body.sessionId) || req.headers["x-mcp-session-id"] || null;

  try {
    const upstream = await fetch(ADS_MCP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: authorization,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(payload),
    });

    const responseText = await upstream.text();
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    const nextSessionId = upstream.headers.get("mcp-session-id");
    const challenge = upstream.headers.get("www-authenticate");

    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "no-store");
    if (nextSessionId) res.setHeader("mcp-session-id", nextSessionId);
    if (challenge) res.setHeader("www-authenticate", challenge);
    res.send(responseText);
  } catch (err) {
    res
      .status(502)
      .json({ error: "Failed to reach Ads MCP", details: err.message });
  }
}
