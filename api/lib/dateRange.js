function fmt(d) {
  return d.toISOString().slice(0, 10);
}

// Resolves a scope keyword (or explicit start/end query params) into
// YYYY-MM-DD start/end dates. Defaults to month-to-date.
export function resolveDateRange(query) {
  const { start, end, scope } = query;
  if (start && end) return { startDate: start, endDate: end };

  const now = new Date();
  const today = fmt(now);

  switch (scope) {
    case 'daily':
      return { startDate: today, endDate: today };
    case 'weekly': {
      const d = new Date(now);
      const day = (d.getDay() + 6) % 7; // Monday = 0
      d.setDate(d.getDate() - day);
      return { startDate: fmt(d), endDate: today };
    }
    case 'monthly': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: fmt(first), endDate: fmt(last) };
    }
    case 'mtd':
    default: {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: fmt(first), endDate: today };
    }
  }
}

// Returns { daysElapsed, daysInPeriod } for pacing calculations — i.e. how
// far into the period we are vs. how long the period runs in total.
// daysInPeriod: total length of the selected window.
// daysElapsed: how many of those days have actually happened (capped at
// today), so a still-in-progress MTD/monthly/weekly window paces correctly
// instead of assuming the whole period has already played out.
export function getPacingWindow(startDate, endDate) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

  const daysInPeriod = Math.round((end - start) / 86400000) + 1;
  const elapsedEnd = today < end ? today : end;
  const daysElapsed = Math.max(1, Math.min(daysInPeriod, Math.round((elapsedEnd - start) / 86400000) + 1));

  return { daysElapsed, daysInPeriod };
}
