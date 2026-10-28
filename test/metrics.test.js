import test from 'node:test';
import assert from 'node:assert/strict';
import { compute, aging } from '../server/metrics.js';

const now = new Date('2026-10-28T00:00:00Z');
const inv = (o) => ({ status: 'sent', salesperson: 'A', customer: 'C1', total: 100, balance: 0, date: '2026-10-01', dueDate: '2026-10-31', ...o });

test('aging buckets by days past due and ignores paid/void/draft', () => {
  const b = aging([
    inv({ balance: 10, dueDate: '2026-11-05' }),
    inv({ balance: 20, dueDate: '2026-10-08' }),
    inv({ balance: 30, dueDate: '2026-09-01' }),
    inv({ balance: 40, dueDate: '2026-08-10' }),
    inv({ balance: 50, dueDate: '2025-01-01' }),
    inv({ balance: 99, dueDate: '2025-01-01', status: 'void' }),
    inv({ balance: 0, dueDate: '2025-01-01' }),
  ], now);
  assert.deepEqual(b, { current: 10, d1_30: 20, d31_60: 30, d61_90: 40, d90plus: 50 });
});

test('compute ranks reps and customers and separates pipeline stages', () => {
  const m = compute({
    invoices: [inv({ salesperson: 'A', customer: 'X', total: 300 }), inv({ salesperson: 'B', customer: 'Y', total: 500 }), inv({ status: 'draft', total: 9999 })],
    estimates: [{ status: 'sent', total: 70 }, { status: 'accepted', total: 30 }, { status: 'declined', total: 5 }],
    payments: [{ date: '2026-10-02', amount: 40 }], vendorPayments: [{ date: '2026-10-03', amount: 15 }],
    items: [{ sku: 's', name: 'Box', stock: 2, reorder: 5, status: 'active' }],
  }, now);
  assert.deepEqual(m.reps.labels, ['B', 'A']);
  assert.equal(m.kpis.revenueYtd, 800);
  assert.equal(m.topCustomers[0].name, 'Y');
  assert.deepEqual(m.pipeline, { Draft: 0, Sent: 70, Accepted: 30, Declined: 5 });
  assert.equal(m.collections.values.at(-1), 40);
  assert.equal(m.cashflow.outflow[9], 15);
  assert.equal(m.lowStock.length, 1);
});
