// Zoho Books adapter: OAuth refresh-token flow + normalisation to the common shape.
const cfg = () => ({
  accounts: process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.sa',
  api: process.env.ZOHO_API_URL || 'https://www.zohoapis.sa/books/v3',
  id: process.env.ZOHO_CLIENT_ID,
  secret: process.env.ZOHO_CLIENT_SECRET,
  refresh: process.env.ZOHO_REFRESH_TOKEN,
  org: process.env.ZOHO_ORG_ID,
});

export const zohoConfigured = () => {
  const c = cfg();
  return Boolean(c.id && c.secret && c.refresh && c.org);
};

let token = { value: null, exp: 0 };

async function accessToken() {
  if (token.value && Date.now() < token.exp) return token.value;
  const c = cfg();
  const body = new URLSearchParams({
    refresh_token: c.refresh, client_id: c.id, client_secret: c.secret, grant_type: 'refresh_token',
  });
  const r = await fetch(`${c.accounts}/oauth/v2/token`, { method: 'POST', body });
  const j = await r.json();
  if (!j.access_token) throw new Error(`Zoho token refresh failed: ${j.error || r.status}`);
  token = { value: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return token.value;
}

async function list(path, key, params = {}) {
  const c = cfg();
  const out = [];
  for (let page = 1; page <= 50; page++) {
    const qs = new URLSearchParams({ organization_id: c.org, page, per_page: 200, ...params });
    const r = await fetch(`${c.api}/${path}?${qs}`, {
      headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` },
    });
    const j = await r.json();
    if (j.code !== 0) throw new Error(`Zoho ${path}: ${j.message || r.status}`);
    out.push(...(j[key] || []));
    if (!j.page_context?.has_more_page) break;
  }
  return out;
}

const day = (s) => (s || '').slice(0, 10);

export async function fetchZoho() {
  const [inv, est, pay, vpay, items] = await Promise.all([
    list('invoices', 'invoices'),
    list('estimates', 'estimates'),
    list('customerpayments', 'customerpayments'),
    list('vendorpayments', 'vendorpayments'),
    list('items', 'items'),
  ]);
  return normalize({
    invoices: inv.map((i) => ({
      id: i.invoice_id, number: i.invoice_number, date: day(i.date), dueDate: day(i.due_date),
      customer: i.customer_name, salesperson: i.salesperson_name || 'Unassigned',
      total: +i.total, balance: +i.balance, status: i.status,
    })),
    estimates: est.map((e) => ({
      id: e.estimate_id, number: e.estimate_number, date: day(e.date), expiry: day(e.expiry_date),
      customer: e.customer_name, salesperson: e.salesperson_name || 'Unassigned',
      total: +e.total, status: e.status,
    })),
    payments: pay.map((p) => ({ date: day(p.date), amount: +p.amount })),
    vendorPayments: vpay.map((p) => ({ date: day(p.date), amount: +p.amount })),
    items: items.map((i) => ({
      sku: i.sku || i.item_id, name: i.name, stock: i.stock_on_hand == null ? null : +i.stock_on_hand,
      reorder: i.reorder_level == null ? null : +i.reorder_level, rate: +i.rate, status: i.status,
    })),
  });
}

// Shared by the Tally ingest path so both sources produce identical shapes.
export function normalize(d) {
  return {
    invoices: d.invoices || [], estimates: d.estimates || [], payments: d.payments || [],
    vendorPayments: d.vendorPayments || [], items: d.items || [],
  };
}
