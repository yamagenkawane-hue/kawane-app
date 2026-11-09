// Read-only business-data verification. Auth login creates only a test session.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const origin = process.env.KAWANE_VERIFY_ORIGIN || 'http://localhost:3109';
if (!process.env.KAWANE_TEST_MIGRATION_PASSWORD) throw Error('Set the dedicated test account password in KAWANE_TEST_MIGRATION_PASSWORD');
const response = await fetch(`${origin}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginId: 'test', password: process.env.KAWANE_TEST_MIGRATION_PASSWORD }),
});
assert.equal(response.status, 200, 'Test account login');
const session = await response.json();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
const sessionResult = await db.auth.setSession(session);
assert.equal(sessionResult.error, null);
let passed = 2;
try {
  const checks = [
    ['v_production_schedules_with_master', 'id,post_id,product_id,order_no,customer_name,product_name,press_number,lot_no,plan_amount,press_completed_amount,press_completed_date,created_at,updated_at'],
    ['v_production_results_with_master', 'id,post_id,schedule_id,lot_id,order_process_id,process_name,date,amount,created_at'],
    ['inventory_items', 'id,lot_id,product_id,product_code,product_name,lot_no,current_stock,allocated_stock,updated_at'],
    ['lots', 'id,post_id,product_id,product_code,product_name,lot_no,material_lot_no'],
  ];
  const results = await Promise.all(checks.map(async ([table, columns]) => {
    const result = await db.from(table).select(columns).order('id').limit(100);
    assert.equal(result.error, null, `${table} read`); passed++;
    return result.data;
  }));
  const resultLotIds = [...new Set(results[1].map((row) => row.lot_id).filter(Boolean))];
  if (resultLotIds.length) {
    const lots = await db.from('lots').select('id,lot_no').in('id', resultLotIds);
    assert.equal(lots.error, null); passed++;
    const ids = new Set(lots.data.map((row) => row.id));
    assert.ok(resultLotIds.every((id) => ids.has(id)), 'Confirmed result lots are readable'); passed++;
  }
  const lot = results[3].find((row) => row.post_id);
  if (lot) {
    const siblings = await db.from('lots').select('id').eq('post_id', lot.post_id).eq('lot_no', lot.lot_no);
    assert.equal(siblings.error, null); passed++;
    const filter = siblings.data.length === 1
      ? `lot_id.eq.${lot.id},and(lot_id.is.null,post_id.eq.${lot.post_id})` : `lot_id.eq.${lot.id}`;
    for (const table of ['shipments', 'inventory_allocations']) {
      const rows = await db.from(table).select('id,post_id,lot_id,lot_no').or(filter).order('id').limit(100);
      assert.equal(rows.error, null, `${table} UUID/legacy query`); passed++;
    }
    const inventory = await db.from('inventory_items').select('id,current_stock,allocated_stock,updated_at').eq('lot_id', lot.id).order('updated_at');
    assert.equal(inventory.error, null); passed++;
  }
  const daily = await fetch(`${origin}/api/daily-production`, { headers: { Authorization: `Bearer ${session.access_token}` } });
  assert.equal(daily.status, 200); passed++;
  const rows = await daily.json();
  assert.ok(rows.every((row) => Object.hasOwn(row, 'product_id')), 'Daily data includes product identity'); passed++;
  for (const path of ['/productionResults', '/lots', '/reservation', '/shipping']) {
    const page = await fetch(origin + path);
    assert.equal(page.status, 200); passed++;
  }
  const denied = await fetch(`${origin}/api/ai-predictions/run`, { method: 'POST' });
  assert.equal(denied.status, 401); passed++;
  console.log(JSON.stringify({ mode: 'authenticated read-only product/lot views, history queries, daily API and public routes', origin, passed }));
} finally { await db.auth.signOut({ scope: 'local' }); }
