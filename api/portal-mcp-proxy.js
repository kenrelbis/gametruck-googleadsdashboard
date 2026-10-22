// Same-origin relay for the GameTruck Portal Reports MCP.
//
// The Portal server (api.gametruck.com) doesn't send CORS headers, so the
// browser can't call it directly. This relay forwards ONLY to the Portal's
// OAuth endpoints and its /mcp/reporting endpoint, carrying the user's own
// bearer token — it holds no credentials of its own.
const PORTAL_ORIGIN = "https://api.gametruck.com";
const ALLOWED_PATH_PREFIXES = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
  "/oauth/register",
  "/oauth/token",
  "/mcp/reporting",
];
const FORWARD_HEADERS = new Set([
  "accept",
  "content-type",
  "authorization",
  "mcp-session-id",
  "mcp-protocol-version",
]);

function normalizeForwardUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.origin !== PORTAL_ORIGIN) return null;
    if (!ALLOWED_PATH_PREFIXES.some((p) => parsed.pathname.startsWith(p))) return null;
    return parsed.toString();
  } catch (err) {
    return null;
  }
}

function filterHeaders(input) {
  const out = {};
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input)) {
    if (value == null) continue;
    if (!FORWARD_HEADERS.has(String(key).toLowerCase())) continue;
    out[key] = String(value);
  }
  return out;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const forwardUrl = normalizeForwardUrl(body && body.forwardUrl);
  if (!forwardUrl) {
    res.status(400).json({ error: "forwardUrl must be a Portal OAuth or /mcp/reporting URL" });
    return;
  }
  const method = String((body && body.method) || "GET").toUpperCase();
  if (!["GET", "POST", "DELETE"].includes(method)) {
    res.status(400).json({ error: "Forward method must be GET, POST or DELETE" });
    return;
  }

  try {
    const upstream = await fetch(forwardUrl, {
      method,
      headers: { Accept: "application/json", ...filterHeaders(body && body.headers) },
      body: method === "GET" ? undefined : body && body.body != null ? String(body.body) : undefined,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.setHeader("Cache-Control", "no-store");
    const session = upstream.headers.get("mcp-session-id");
    if (session) res.setHeader("mcp-session-id", session);
    const challenge = upstream.headers.get("www-authenticate");
    if (challenge) res.setHeader("www-authenticate", challenge);
    res.send(text);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Portal", details: err.message });
  }
}
