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
