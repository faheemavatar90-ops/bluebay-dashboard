import test from 'node:test';
import assert from 'node:assert/strict';
import { server } from '../server/index.js';

process.env.TALLY_INGEST_TOKEN = 'secret';
process.env.PRIMARY_SOURCE = 'tally';
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => server.close());

test('ingest rejects a bad token', async () => {
  const r = await fetch(`${base}/api/tally/ingest`, { method: 'POST', headers: { Authorization: 'Bearer nope' }, body: '{}' });
  assert.equal(r.status, 401);
});

test('ingested Tally data flows through /api/summary', async () => {
  const body = { invoices: [{ id: '1', date: `${new Date().getUTCFullYear()}-01-05`, dueDate: '2020-01-01', customer: 'Acme', salesperson: 'Ali', total: 1000, balance: 1000, status: 'sent' }] };
  const p = await fetch(`${base}/api/tally/ingest`, { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: JSON.stringify(body) });
  assert.equal(p.status, 200);
  const j = await (await fetch(`${base}/api/summary`)).json();
  assert.equal(j.live, true);
  assert.equal(j.source, 'tally');
  assert.equal(j.aging.d90plus, 1000);
  assert.equal(j.topCustomers[0].name, 'Acme');
});

test('serves the dashboard and live.js as real files', async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.ok(html.startsWith('<!DOCTYPE html>') && html.trimEnd().endsWith('</html>'), 'index.html is complete');
  const js = await (await fetch(`${base}/live.js`)).text();
  assert.match(js, /window\.LIVE/);
});

test('path traversal is blocked', async () => {
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 404);
  assert.equal((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status, 404);
});

test('unconfigured Zoho reports sample mode instead of crashing', async () => {
  process.env.PRIMARY_SOURCE = 'zoho';
  for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN']) delete process.env[k];
  await fetch(`${base}/api/tally/ingest`, { method: 'POST', headers: { Authorization: 'Bearer secret' }, body: '{}' }); // clears cache
  const j = await (await fetch(`${base}/api/summary`)).json();
  assert.equal(j.live, false);
  assert.match(j.error, /not configured/);
});
