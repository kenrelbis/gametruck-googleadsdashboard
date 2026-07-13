# GameTruck PPC Dashboard — Live Data Edition

Same dashboard as before (Quick Paste, health scoring, reports, CSV export),
now with a serverless backend that pulls live numbers from Google Ads, GA4,
and GameTruck Portal Reports on every page load.

## How it works

- `index.html` — the dashboard UI (unchanged, plus a "🔄 Refresh Live Data"
  button and an automatic fetch on page load / view-scope change).
- `api/dashboard-data.js` — serverless function that calls Google Ads, GA4,
  and Portal Reports in parallel and returns everything the frontend needs.
- `api/google-ads.js`, `api/ga4.js`, `api/portal.js` — the same data sources
  exposed individually, in case you want to call just one.

Because everything is hosted on Vercel (frontend + API routes on the same
origin), there's no CORS configuration needed.

## Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Nothing
needs to be in the code or the repo — the dashboard will show
"not configured" for any section whose variables are missing, rather than
breaking.

### Google Ads (now user-scoped via Ads MCP OAuth)

Google Ads data is no longer pulled with shared server env credentials.

- The dashboard uses Ads MCP at `https://ads-mcp.microservices.gametrucksys.com/mcp`.
- Users click **Connect Ads MCP** in the UI and authenticate with their own
  OAuth identity.
- OAuth client registration/discovery is automatic through MCP metadata.
- Access/refresh tokens are stored in browser storage for that user session.

No Google Ads env vars are required for this dashboard path.

### GA4 (optional — adds a site traffic summary)

| Variable                              | Notes                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET` | Can be the same OAuth client as Ads if scopes include `analytics.readonly` |
| `GA4_REFRESH_TOKEN`                   | Refresh token with `analytics.readonly` scope                              |
| `GA4_PROPERTY_ID`                     | e.g. `properties/123456789`                                                |

### Portal Reports (optional — bookings/leads/revenue)

| Variable              | Notes                                                    |
| --------------------- | -------------------------------------------------------- |
| `PORTAL_API_BASE_URL` | Base URL of GameTruck's internal Portal Reports REST API |
| `PORTAL_API_KEY`      | Auth token for that API                                  |

`api/lib/portalClient.js` has placeholder endpoint paths/field names — these
will need adjusting once we have the real API spec.

## Local development

### Without Vercel CLI (recommended for quick testing)

```bash
npm run dev:local
```

This starts a local Node server on `http://localhost:3037` that serves both
`index.html` and your `/api/*` routes.

If you need env vars locally, add them to `.env.local` (or `.env`) in the
project root.

### With Vercel CLI (optional)

```bash
npm i -g vercel
vercel dev
```

This runs the API routes and static file together at `localhost:3000`,
same as production.

Important: open the dashboard through an HTTP origin (`http://localhost:3037`
or `http://localhost:3000`).
Do not open `index.html` directly via `file://` or browser security will
block OAuth + API requests (CORS/origin `null`).

## Notes

- Data refreshes on page load and whenever the date-scope (Daily/Weekly/MTD/
  Monthly/Custom) changes — no polling, per the "on page load only" choice.
- Google Ads account list is fetched per-user through Ads MCP tools
  (`list_accessible_customers` + `search`), so users only see accounts they
  are authorized to access.
- If direct browser-to-MCP calls are blocked by CORS/preflight in some
  environments, the dashboard automatically falls back to the same-origin
  `api/ads-mcp-proxy.js` route while still using the user's bearer token.
- If live data fails or isn't configured, the dashboard falls back to
  whatever's stored locally (manual Quick Paste still works as before).
