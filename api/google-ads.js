import { getAllAccountMetrics } from './lib/googleAdsClient.js';
import { resolveDateRange, getPacingWindow } from './lib/dateRange.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  const config = {
    clientId: process.env.GOOGLE_ADS_CLIENT_ID,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN,
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
    loginCustomerId: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
  };

  const missing = Object.entries(config).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    res.status(200).json({ configured: false, missing });
    return;
  }

  try {
    const { startDate, endDate } = resolveDateRange(req.query);
    const pacingWindow = getPacingWindow(startDate, endDate);
    const { accounts, errors } = await getAllAccountMetrics(config, { startDate, endDate, pacingWindow });
    res.status(200).json({
      configured: true,
      startDate,
      endDate,
      pacingWindow,
      accounts,
      errors,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ configured: true, error: err.message });
  }
}
