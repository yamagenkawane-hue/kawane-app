// Offline event/loader tests. React hooks, network and Supabase are controlled fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let passed = 0;
const check = (a, b) => { assert.deepEqual(a, b); passed++; };
function load(file, mocks = {}, append = '') {
  const context = { exports: {}, console: { ...console, error() {} }, crypto, URLSearchParams, alert: () => {}, require: (name) => {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: {} };
    if (name.startsWith('@/lib/') && name !== '@/lib/supabase') return load(`${name.slice(2)}.ts`, mocks);
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8') + append, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}
function hooks(values) {
  let state = 0, ref = 0;
  const refs = [], callbacks = [];
  return {
    callbacks, reset() { state = 0; ref = 0; callbacks.length = 0; },
    react: { ...require('react'),
      useState(initial) { const i = state++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], (v) => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
      useRef(initial) { const i = ref++; return refs[i] ||= { current: initial }; },
      useMemo(fn) { return fn(); }, useEffect() {},
      useCallback(fn) { callbacks.push(fn); return fn; },
    },
  };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const a = '00000000-0000-0000-0000-000000000001', b = '00000000-0000-0000-0000-000000000002';
const schedule = { id: 'schedule-b', postId: b, orderNo: 'B', productId: 'product-b', productName: '製品B', lotNo: 'SAME', customerName: '先B', planAmount: 100 };
const process = { id: 'process-b', postId: b, processOrder: 1, plannedAmount: 100, completedAmount: 0 };
const posts = [{ id: a, orderNo: 'A', productId: 'product-a', productName: '製品A', lotNo: 'SAME' }, { id: b, orderNo: 'B', productId: 'product-b', productName: '製品B', lotNo: 'SAME' }];
const values = [[schedule], [process], posts, [], {}, schedule.id, process.id, 'SAME', '', '2026-10-20', 10, false, false, ''];
const fixture = hooks(values), calls = [], writes = [];
let fail = true;
function query(table) {
  const q = { select() { return q; }, order() { return q; }, is() { return q; }, in() { return q; }, limit() { return q; },
    update() { writes.push(table); throw Error('Unexpected client-side schedule write'); },
    then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
  };
  return q;
}
const db = { from: query, rpc: async (name, args) => { calls.push({ name, args }); return { error: fail ? { message: 'synthetic lost response' } : null }; } };
const mocks = { react: fixture.react, '@/lib/supabase': { __esModule: true, default: db },
  '@/lib/auth/client': { authFetch: async () => ({ ok: true, json: async () => [] }) },
  'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams() },
  '@/app/components/Numpad/Numpad': { __esModule: true, default: () => null },
};
const { ProductionResultsContent } = load('app/productionResults/page.tsx', mocks, '\nexport { ProductionResultsContent };');
async function submit() {
  fixture.reset();
  const tree = ProductionResultsContent();
  const form = nodes(tree).find((node) => node.type === 'form');
  assert.ok(form);
  await form.props.onSubmit({ preventDefault() {} });
}
await submit();
check(calls.length, 1); check(calls[0].args.p_order_process_id, 'process-b');
check(calls[0].args.p_schedule_id, 'schedule-b'); check(calls[0].args.p_lot_no, 'SAME');
const key = calls[0].args.p_idempotency_key;
await submit(); check(calls[1].args.p_idempotency_key, key);
values[10] = 11;
await submit(); check(calls[2].args.p_idempotency_key !== key, true);
fail = false;
await submit(); check(calls[3].args.p_idempotency_key, calls[2].args.p_idempotency_key);
check(writes.length, 0); check(values[10], '');
// A stale first-process selection from another order must never be submitted.
values[0] = [schedule]; values[1] = [{ ...process, postId: a }]; values[2] = posts; values[10] = 10;
await submit(); check(calls.length, 4);

// Invoke the actual lot-detail loader with deliberately overbroad mock data.
const lot = { id: a, postId: a, lotNo: 'SAME,(PUNCTUATION)', productName: '製品A', customerName: '先A' };
const detailValues = [lot, [], 1, false, '', ''];
const detailHooks = hooks(detailValues), filters = [];
const rows = [
  { id: 'own', lot_id: a, post_id: a, lot_no: lot.lotNo, quantity: 5 },
  { id: 'other', lot_id: b, post_id: b, lot_no: lot.lotNo, quantity: 900 },
  { id: 'legacy-own', lot_id: null, post_id: a, lot_no: lot.lotNo, quantity: 6 },
  { id: 'legacy-other', lot_id: null, post_id: b, lot_no: lot.lotNo, quantity: 800 },
];
let ambiguous = false;
const detailDB = { from(table) {
  const q = { select() { return q; }, eq() { return q; }, order() { return q; }, range() { return q; },
    or(value) { filters.push({ table, value }); return q; },
    then(resolve, reject) {
      const data = table === 'lots' ? [{ id: a }, ...(ambiguous ? [{ id: b }] : [])]
        : ['shipments', 'inventory_allocations'].includes(table) ? rows : [];
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    },
  }; return q;
} };
const Detail = load('app/lots/[id]/page.tsx', { react: detailHooks.react,
  '@/lib/supabase': { __esModule: true, default: detailDB },
  '@/lib/auth/client': {}, '@/app/components/AuthProvider/AuthProvider': { useAppAuth: () => ({ profile: { manager: false } }) },
  'next/navigation': { useParams: () => ({ id: a }) },
}).default;
async function detail() { detailHooks.reset(); Detail(); await detailHooks.callbacks[0](lot); }
await detail();
let ids = detailValues[1].filter((row) => row.id.startsWith('shipment-')).map((row) => row.id);
check(ids.includes('shipment-own'), true); check(ids.includes('shipment-legacy-own'), true);
check(ids.includes('shipment-other'), false); check(ids.includes('shipment-legacy-other'), false);
check(filters.every((filter) => !filter.value.includes(lot.lotNo)), true);
ambiguous = true; await detail();
ids = detailValues[1].filter((row) => row.id.startsWith('shipment-')).map((row) => row.id);
check(ids.includes('shipment-own'), true); check(ids.includes('shipment-legacy-own'), false);
check(detailValues[1].some((row) => row.id === 'allocation-other'), false);
console.log(JSON.stringify({ mode: 'offline manufacturing submission, retry identity and lot-detail history loading', passed }));
