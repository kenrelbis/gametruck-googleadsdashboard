import { getAllAccountMetrics } from './lib/googleAdsClient.js';
import { getGa4Summary } from './lib/ga4Client.js';
import { getPortalSummary } from './lib/portalClient.js';
import { resolveDateRange } from './lib/dateRange.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const { startDate, endDate } = resolveDateRange(req.query);
  const out = { startDate, endDate, fetchedAt: new Date().toISOString() };

  // --- Google Ads (primary data source for the account table) ---
  const adsConfig = {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };
  const adsMissing = Object.entries(adsConfig).filter(([, v]) => !v).map(([k]) => k);

  if (adsMissing.length) {
    out.googleAds = { configured: false, missing: adsMissing };
  } else {
    try {
      const { accounts, errors } = await getAllAccountMetrics(adsConfig, { startDate, endDate });
      out.googleAds = { configured: true, accounts, errors };
    } catch (err) {
      out.googleAds = { configured: true, error: err.message };
    }
  }

  // --- GA4 (supplementary site-wide traffic context) ---
  const ga4Config = {
    clientId: process.env.GA4_CLIENT_ID,
    clientSecret: process.env.GA4_CLIENT_SECRET,
    refreshToken: process.env.GA4_REFRESH_TOKEN,
    propertyId: process.env.GA4_PROPERTY_ID,
  };
  const ga4Missing = Object.entries(ga4Config).filter(([, v]) => !v).map(([k]) => k);

  if (ga4Missing.length) {
    out.ga4 = { configured: false, missing: ga4Missing };
  } else {
    try {
      out.ga4 = { configured: true, ...(await getGa4Summary({ ...ga4Config, startDate, endDate })) };
    } catch (err) {
      out.ga4 = { configured: true, error: err.message };
    }
  }

  // --- Portal Reports (bookings/leads/revenue) ---
  const portalBaseUrl = process.env.PORTAL_API_BASE_URL;
  const portalApiKey = process.env.PORTAL_API_KEY;

  if (!portalBaseUrl || !portalApiKey) {
    out.portal = { configured: false };
  } else {
    try {
      out.portal = await getPortalSummary({ baseUrl: portalBaseUrl, apiKey: portalApiKey, startDate, endDate });
    } catch (err) {
      out.portal = { configured: true, error: err.message };
    }
  }

  res.status(200).json(out);
}
