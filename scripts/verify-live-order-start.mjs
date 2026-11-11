// Read-only verification after deployment. Never creates orders, runs AI, or purges history.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const origin = process.env.KAWANE_VERIFY_ORIGIN || 'http://localhost:3111';
if (!process.env.KAWANE_TEST_MIGRATION_PASSWORD) throw Error('Set the dedicated test account password');
const response = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ loginId: 'test', password: process.env.KAWANE_TEST_MIGRATION_PASSWORD }) });
assert.equal(response.status, 200);
const session = await response.json();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } });
assert.equal((await db.auth.setSession(session)).error, null);
let passed = 2;
try {
  for (const table of ['posts', 'production_schedules', 'v_posts_with_master', 'v_production_schedules_with_master']) {
    const result = await db.from(table).select('id,lot_no,planned_start_date').order('id').limit(100);
    assert.equal(result.error, null, `${table} planned date read`); passed++;
    for (const row of result.data) assert.ok(row.planned_start_date === null || /^\d{4}-\d{2}-\d{2}$/.test(row.planned_start_date));
  }
  const products = await db.from('v_product_master_with_customer').select('id,customer_id,product_code,product_name,customer_name').order('id').limit(100);
  assert.equal(products.error, null); passed++;
  const customers = await db.from('customer_master').select('id,customer_name,shipping_offset_days').order('id').limit(100);
  assert.equal(customers.error, null); passed++;
  for (const path of ['/api/daily-production', '/api/production-schedules']) {
    const result = await fetch(origin + path, { headers: { Authorization: `Bearer ${session.access_token}` } });
    assert.equal(result.status, 200, path); passed++;
    const rows = await result.json();
    assert.ok(Array.isArray(rows)); passed++;
    assert.ok(rows.every((row) => Object.hasOwn(row, 'planned_start_date'))); passed++;
  }
  for (const path of ['/create', '/productionSchedules']) {
    assert.equal((await fetch(origin + path)).status, 200); passed++;
  }
  assert.equal((await fetch(`${origin}/api/daily-production`)).status, 401); passed++;
  assert.equal((await fetch(`${origin}/api/ai-predictions/run`, { method: 'POST' })).status, 401); passed++;
  console.log(JSON.stringify({ mode: 'authenticated read-only planned start columns, product masters, schedule APIs and routes', origin, passed }));
} finally { await db.auth.signOut({ scope: 'local' }); }
