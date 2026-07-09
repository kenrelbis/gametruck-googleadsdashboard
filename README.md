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

### Google Ads (required for the account table)
| Variable | Notes |
|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | From your MCC's API Center |
| `GOOGLE_ADS_CLIENT_ID` | OAuth 2.0 client, Google Cloud Console |
| `GOOGLE_ADS_CLIENT_SECRET` | OAuth 2.0 client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | Generated once via OAuth consent |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Your MCC id, digits only, e.g. `8167436168` |

### GA4 (optional — adds a site traffic summary)
| Variable | Notes |
|---|---|
| `GA4_CLIENT_ID` / `GA4_CLIENT_SECRET` | Can be the same OAuth client as Ads if scopes include `analytics.readonly` |
| `GA4_REFRESH_TOKEN` | Refresh token with `analytics.readonly` scope |
| `GA4_PROPERTY_ID` | e.g. `properties/123456789` |

### Portal Reports (optional — bookings/leads/revenue)
| Variable | Notes |
|---|---|
| `PORTAL_API_BASE_URL` | Base URL of GameTruck's internal Portal Reports REST API |
| `PORTAL_API_KEY` | Auth token for that API |

`api/lib/portalClient.js` has placeholder endpoint paths/field names — these
will need adjusting once we have the real API spec.

## Local development

```bash
npm i -g vercel
vercel dev
```

This runs the API routes and static file together at `localhost:3000`,
same as production.

## Notes

- Data refreshes on page load and whenever the date-scope (Daily/Weekly/MTD/
  Monthly/Custom) changes — no polling, per the "on page load only" choice.
- Google Ads account list is fetched dynamically from the MCC each time
  (`customer_client` query), so newly added/removed locations show up
  automatically — no hardcoded account list to maintain.
- If live data fails or isn't configured, the dashboard falls back to
  whatever's stored locally (manual Quick Paste still works as before).
