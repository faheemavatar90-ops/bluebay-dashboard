// Pure functions: normalised data -> the numbers each dashboard panel needs.
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
const ym = (d) => d.slice(0, 7);
const DAY = 86400000;

function groupSum(rows, keyFn, valFn) {
  const m = new Map();
  for (const r of rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + valFn(r));
  return m;
}

function lastMonths(n, now) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

export function aging(invoices, now = new Date()) {
  const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
  for (const i of invoices) {
    if (!(i.balance > 0) || i.status === 'void' || i.status === 'draft') continue;
    const late = Math.floor((now - new Date(i.dueDate || i.date)) / DAY);
    const k = late <= 0 ? 'current' : late <= 30 ? 'd1_30' : late <= 60 ? 'd31_60' : late <= 90 ? 'd61_90' : 'd90plus';
    buckets[k] += i.balance;
  }
  return buckets;
}

export function compute(data, now = new Date()) {
  const { invoices, estimates, payments, vendorPayments, items } = data;
  const live = invoices.filter((i) => i.status !== 'void' && i.status !== 'draft');
  const year = String(now.getUTCFullYear());
  const months = lastMonths(6, now);
  const ytd = live.filter((i) => i.date.startsWith(year));

  const byRep = [...groupSum(ytd, (i) => i.salesperson, (i) => i.total)].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const byCust = [...groupSum(live, (i) => i.customer, (i) => i.total)].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const openEst = estimates.filter((e) => ['draft', 'sent', 'viewed'].includes(e.status));
  const stage = (s) => sum(estimates.filter((e) => s.includes(e.status)), (e) => e.total);
  const pipeline = {
    Draft: stage(['draft']), Sent: stage(['sent', 'viewed']),
    Accepted: stage(['accepted', 'invoiced']), Declined: stage(['declined', 'expired']),
  };

  const inflow = groupSum(payments, (p) => ym(p.date), (p) => p.amount);
  const outflow = groupSum(vendorPayments, (p) => ym(p.date), (p) => p.amount);
  const yMonths = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);

  const stocked = items.filter((i) => i.stock != null && i.status !== 'inactive');
  const low = stocked.filter((i) => i.reorder != null && i.stock <= i.reorder);

  return {
    generatedAt: now.toISOString(),
    kpis: {
      revenueYtd: sum(ytd, (i) => i.total),
      receivables: sum(live, (i) => Math.max(i.balance, 0)),
      openQuotes: openEst.length,
      openQuotesValue: sum(openEst, (e) => e.total),
      lowStockItems: low.length,
    },
    reps: { labels: byRep.map((r) => r[0]), values: byRep.map((r) => r[1]) },
    pipeline,
    collections: { labels: months, values: months.map((m) => inflow.get(m) || 0) },
    cashflow: { labels: yMonths, inflow: yMonths.map((m) => inflow.get(m) || 0), outflow: yMonths.map((m) => outflow.get(m) || 0) },
    aging: aging(invoices, now),
    topCustomers: byCust.map(([name, total]) => ({ name, total })),
    lowStock: low.slice(0, 20).map((i) => ({ sku: i.sku, name: i.name, stock: i.stock, reorder: i.reorder })),
  };
}
