import { getAccessToken } from './googleAuth.js';

export async function getGa4Summary({ clientId, clientSecret, refreshToken, propertyId, startDate, endDate }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const property = propertyId.startsWith('properties/') ? propertyId : `properties/${propertyId}`;

  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [
        { name: 'sessions' },
        { name: 'conversions' },
        { name: 'totalUsers' },
      ],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GA4 Data API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  const rows = (data.rows || []).map(r => ({
    channel: r.dimensionValues[0].value,
    sessions: Number(r.metricValues[0].value || 0),
    conversions: Number(r.metricValues[1].value || 0),
    totalUsers: Number(r.metricValues[2].value || 0),
  }));

  const totals = rows.reduce(
    (acc, r) => ({
      sessions: acc.sessions + r.sessions,
      conversions: acc.conversions + r.conversions,
      totalUsers: acc.totalUsers + r.totalUsers,
    }),
    { sessions: 0, conversions: 0, totalUsers: 0 }
  );

  return { byChannel: rows, totals };
}
