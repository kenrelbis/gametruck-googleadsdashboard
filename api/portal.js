import { getPortalSummary } from './lib/portalClient.js';
import { resolveDateRange } from './lib/dateRange.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const baseUrl = process.env.PORTAL_API_BASE_URL;
  const apiKey = process.env.PORTAL_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(200).json({ configured: false });
    return;
  }

  try {
    const { startDate, endDate } = resolveDateRange(req.query);
    const summary = await getPortalSummary({ baseUrl, apiKey, startDate, endDate });
    res.status(200).json({ ...summary, startDate, endDate, fetchedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ configured: true, error: err.message });
  }
}
