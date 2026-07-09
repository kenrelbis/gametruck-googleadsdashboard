// GameTruck's internal Portal Reports API isn't wired up yet — this needs
// the actual base URL + auth key for api.gametruck.com (or wherever the
// REST endpoints live behind the MCP server). Once you have those, set:
//   PORTAL_API_BASE_URL
//   PORTAL_API_KEY
// and fill in the real request/response shape below (endpoint paths and
// field names are placeholders and WILL need adjusting).

export async function getPortalSummary({ baseUrl, apiKey, startDate, endDate }) {
  if (!baseUrl || !apiKey) {
    return { configured: false };
  }

  const res = await fetch(`${baseUrl}/reports/booked-revenue?start=${startDate}&end=${endDate}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portal Reports API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return { configured: true, data };
}
