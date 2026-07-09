import { getGa4Summary } from './lib/ga4Client.js';
import { resolveDateRange } from './lib/dateRange.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const config = {
    clientId: process.env.GA4_CLIENT_ID,
    clientSecret: process.env.GA4_CLIENT_SECRET,
    refreshToken: process.env.GA4_REFRESH_TOKEN,
    propertyId: process.env.GA4_PROPERTY_ID,
  };

  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    res.status(200).json({ configured: false, missing });
    return;
  }

  try {
    const { startDate, endDate } = resolveDateRange(req.query);
    const summary = await getGa4Summary({ ...config, startDate, endDate });
    res.status(200).json({ configured: true, startDate, endDate, ...summary, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ configured: true, error: err.message });
  }
}
