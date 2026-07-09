// Exchanges a refresh token for a short-lived access token.
// Tokens are cached in-memory for the lifetime of the serverless function
// instance (a few minutes typically) to avoid hitting the token endpoint
// on every single request when the function is kept warm.

const tokenCache = new Map(); // key: refreshToken -> { accessToken, expiresAt }

export async function getAccessToken({ clientId, clientSecret, refreshToken }) {
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing OAuth credentials (client id/secret/refresh token)');
  }

  const cached = tokenCache.get(refreshToken);
  if (cached && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token refresh failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  tokenCache.set(refreshToken, { accessToken: data.access_token, expiresAt });
  return data.access_token;
}
