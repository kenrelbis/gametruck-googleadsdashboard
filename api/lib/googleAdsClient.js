import { getAccessToken } from './googleAuth.js';

const API_VERSION = 'v19';
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;

function digitsOnly(id) {
  return String(id || '').replace(/\D+/g, '');
}

async function gaqlSearch({ accessToken, developerToken, loginCustomerId, customerId, query }) {
  const url = `${BASE_URL}/customers/${digitsOnly(customerId)}/googleAds:search`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'developer-token': developerToken,
      'login-customer-id': digitsOnly(loginCustomerId),
    },
    body: JSON.stringify({ query, pageSize: 1000 }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Ads API error (${res.status}) for customer ${customerId}: ${text}`);
  }

  const data = await res.json();
  return data.results || [];
}

// Returns the list of active, non-manager child accounts under the MCC.
export async function listActiveChildAccounts({ clientId, clientSecret, refreshToken, developerToken, loginCustomerId }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const query = `
    SELECT customer_client.id, customer_client.descriptive_name,
           customer_client.manager, customer_client.status
    FROM customer_client
  `;
  const rows = await gaqlSearch({
    accessToken, developerToken, loginCustomerId,
    customerId: loginCustomerId,
    query,
  });

  return rows
    .map(r => r.customerClient)
    .filter(c => c && !c.manager && c.status === 'ENABLED');
}

// Fetches per-day cost for the current month (1st through today) so we can
// derive today/this-week/this-month spend from a single query, instead of
// three separate API calls per account.
async function getDailyCostSeries({ clientId, clientSecret, refreshToken, developerToken, loginCustomerId, customerId, monthStartDate, todayDate }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const query = `
    SELECT segments.date, metrics.cost_micros
    FROM customer
    WHERE segments.date BETWEEN '${monthStartDate}' AND '${todayDate}'
  `;
  const rows = await gaqlSearch({ accessToken, developerToken, loginCustomerId, customerId, query });
  // Map of 'YYYY-MM-DD' -> cost in dollars
  const byDate = new Map();
  for (const r of rows) {
    byDate.set(r.segments.date, Number(r.metrics?.costMicros || 0) / 1_000_000);
  }
  return byDate;
}

// Derives today / week-to-date / month-to-date spend + pace from a daily
// cost series and the live daily budget. `today` is a Date object (UTC).
function computeMultiPeriodPacing({ dailyCostByDate, dailyBudget, today }) {
  const fmt = d => d.toISOString().slice(0, 10);
  const todayStr = fmt(today);

  // Monday-based week start
  const dow = (today.getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = new Date(today);
  weekStart.setUTCDate(weekStart.getUTCDate() - dow);

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const dayOfMonth = today.getUTCDate();
  const daysElapsedThisWeek = dow + 1;

  let todayCost = 0, weekCost = 0, monthCost = 0;
  for (const [dateStr, cost] of dailyCostByDate.entries()) {
    const d = new Date(dateStr + 'T00:00:00Z');
    monthCost += cost;
    if (d >= weekStart) weekCost += cost;
    if (dateStr === todayStr) todayCost = cost;
  }

  function period(actual, daysElapsed) {
    if (!dailyBudget || dailyBudget <= 0) return { spend: Number(actual.toFixed(2)), expected: null, paceRatio: null };
    const expected = dailyBudget * daysElapsed;
    return {
      spend: Number(actual.toFixed(2)),
      expected: Number(expected.toFixed(2)),
      paceRatio: expected > 0 ? Number((actual / expected).toFixed(3)) : null,
    };
  }

  return {
    daily: period(todayCost, 1),
    weekly: period(weekCost, daysElapsedThisWeek),
    monthly: period(monthCost, dayOfMonth),
    projectedMonthEnd: dailyBudget > 0 ? Number((dailyBudget * daysInMonth).toFixed(2)) : null,
  };
}

// Returns the account's total active daily budget (sum of enabled
// campaigns' budgets, de-duplicated by budget id since campaigns can share
// a budget). This is what Google Ads actually has configured to spend
// per day, right now — the ground truth for pacing.
async function getDailyBudget({ clientId, clientSecret, refreshToken, developerToken, loginCustomerId, customerId }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const query = `
    SELECT campaign.status, campaign_budget.id, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status = 'ENABLED'
  `;
  const rows = await gaqlSearch({ accessToken, developerToken, loginCustomerId, customerId, query });

  const seenBudgetIds = new Set();
  let totalMicros = 0;
  for (const r of rows) {
    const budgetId = r.campaignBudget?.id;
    if (budgetId == null || seenBudgetIds.has(budgetId)) continue;
    seenBudgetIds.add(budgetId);
    totalMicros += Number(r.campaignBudget?.amountMicros || 0);
  }
  return totalMicros / 1_000_000;
}

// Computes pacing given actual spend and the pacing window from dateRange.js.
// paceRatio: 1.0 = exactly on pace, >1 = overspending relative to elapsed
// time, <1 = underspending. Returns null fields if there's no budget data
// (e.g. no enabled campaigns) so the frontend can show "n/a" instead of 0%.
function computePacing({ cost, dailyBudget, daysElapsed, daysInPeriod }) {
  if (!dailyBudget || dailyBudget <= 0) {
    return { dailyBudget: 0, expectedSpendToDate: null, paceRatio: null, projectedPeriodSpend: null };
  }
  const expectedSpendToDate = dailyBudget * daysElapsed;
  const projectedPeriodSpend = dailyBudget * daysInPeriod;
  const paceRatio = expectedSpendToDate > 0 ? cost / expectedSpendToDate : null;
  return {
    dailyBudget: Number(dailyBudget.toFixed(2)),
    expectedSpendToDate: Number(expectedSpendToDate.toFixed(2)),
    projectedPeriodSpend: Number(projectedPeriodSpend.toFixed(2)),
    paceRatio: paceRatio != null ? Number(paceRatio.toFixed(3)) : null,
  };
}

// Returns { name, cost, clicks, cpc, conv, cpa, ...pacing } for one customer
// over a date range. `pacingWindow` (daysElapsed/daysInPeriod, from
// dateRange.js) is optional — pacing fields are omitted if not provided.
export async function getAccountMetrics({ clientId, clientSecret, refreshToken, developerToken, loginCustomerId, customerId, descriptiveName, startDate, endDate, pacingWindow }) {
  const accessToken = await getAccessToken({ clientId, clientSecret, refreshToken });
  const query = `
    SELECT customer.descriptive_name, metrics.cost_micros, metrics.clicks,
           metrics.conversions, metrics.average_cpc
    FROM customer
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
  `;
  const rows = await gaqlSearch({
    accessToken, developerToken, loginCustomerId,
    customerId,
    query,
  });

  const m = rows[0]?.metrics || {};
  const costMicros = Number(m.costMicros || 0);
  const clicks = Number(m.clicks || 0);
  const conv = Number(m.conversions || 0);
  const avgCpcMicros = Number(m.averageCpc || 0);

  const cost = costMicros / 1_000_000;
  const cpc = avgCpcMicros / 1_000_000;
  const cpa = conv > 0 ? cost / conv : 0;

  const account = {
    name: descriptiveName,
    customerId: digitsOnly(customerId),
    cost: Number(cost.toFixed(2)),
    clicks,
    cpc: Number(cpc.toFixed(2)),
    conv: Number(conv.toFixed(2)),
    cpa: Number(cpa.toFixed(2)),
  };

  if (pacingWindow) {
    const dailyBudget = await getDailyBudget({ clientId, clientSecret, refreshToken, developerToken, loginCustomerId, customerId });
    Object.assign(account, computePacing({ cost, dailyBudget, ...pacingWindow }));

    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
    const monthStartDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const todayDate = today.toISOString().slice(0, 10);
    const dailyCostByDate = await getDailyCostSeries({
      clientId, clientSecret, refreshToken, developerToken, loginCustomerId, customerId,
      monthStartDate, todayDate,
    });
    account.pacing = computeMultiPeriodPacing({ dailyCostByDate, dailyBudget, today });
  }

  return account;
}

// Fetches metrics (+ pacing, if pacingWindow given) for every active child
// account, in parallel.
export async function getAllAccountMetrics(config, { startDate, endDate, pacingWindow }) {
  const children = await listActiveChildAccounts(config);
  const results = await Promise.allSettled(
    children.map(c =>
      getAccountMetrics({
        ...config,
        customerId: c.id,
        descriptiveName: c.descriptiveName,
        startDate,
        endDate,
        pacingWindow,
      })
    )
  );

  const accounts = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') accounts.push(r.value);
    else errors.push({ customerId: children[i]?.id, error: r.reason?.message || String(r.reason) });
  });

  return { accounts, errors };
}
