# BlueBay Pack — KPI Command Center

Live dashboard for BlueBay Pack, fed by **Zoho Books** (REST API) and/or **Tally Prime** (push sync).
Zero npm dependencies; Node 20+.

```bash
cp .env.example .env   # fill in credentials
npm start              # http://localhost:3000
npm test
```

## How it works

```
Zoho Books API ──┐
                 ├─► normalised data ─► server/metrics.js ─► /api/summary ─► public/live.js ─► charts
Tally agent POST ┘   (invoices, estimates, payments, items)
```

- `PRIMARY_SOURCE` picks **one** source of truth (`zoho` or `tally`). Data is deliberately not merged:
  if both systems record the same sales, merging double-counts.
- Responses are cached for `CACHE_TTL_SECONDS`; if the source fails, the last good data is served and the
  badge turns **STALE**. With no data at all the page shows **SAMPLE DATA** — it never shows sample
  numbers under a LIVE badge.
- `DASHBOARD_AUTH=user:password` puts HTTP basic auth on the dashboard. Set it, and serve over HTTPS,
  before exposing this — it shows receivables and customer names.

## Zoho Books setup

1. Zoho API console for the Saudi data centre (https://api-console.zoho.sa) → **Self Client**.
2. Generate a code with scope `ZohoBooks.invoices.READ,ZohoBooks.estimates.READ,ZohoBooks.customerpayments.READ,ZohoBooks.vendorpayments.READ,ZohoBooks.settings.READ,ZohoBooks.contacts.READ`
   and exchange it for a refresh token (`POST https://accounts.zoho.sa/oauth/v2/token`, `grant_type=authorization_code`).
3. Put client id/secret/refresh token in `.env`. Read-only scopes only.

Note: the org is on Zoho's free plan; confirm API access/limits for that plan.

## Tally setup

Tally Prime only exposes its XML/ODBC interface (port 9000) on the machine it runs on, so a hosted
dashboard cannot pull from it. Run a small sync agent on the Tally PC that reads vouchers and POSTs JSON to

```
POST /api/tally/ingest      Authorization: Bearer $TALLY_INGEST_TOKEN
{ "invoices": [...], "estimates": [...], "payments": [...], "vendorPayments": [...], "items": [...] }
```

Field shapes are in `server/zoho.js` (`fetchZoho`). The agent itself is **not built yet**.

## Status

| Panel | Chart(s) live | KPI cards / tables |
|---|---|---|
| Owner | revenue by rep, forecast, collections | sample |
| Accounting | cash in/out | sample |
| Pipeline | pipeline by stage | sample |
| Others | — | sample |

`/api/summary` already returns KPIs, aging buckets, top customers and low-stock items; the cards and tables
still need element IDs in `public/index.html` to bind them. Until then the badge reads **CHARTS ONLY**.

Known fixes vs. the uploaded file: it was truncated mid-line (no JS ran), had Cloudflare email-protection
artifacts, labelled amounts AED/$ although the Zoho org is SAR, and loaded Chart.js from a CDN (now vendored).
