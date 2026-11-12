// Offline user interactions and rendering; no live DB writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
let passed = 0;
const check = (a, b) => { assert.deepEqual(a, b); passed++; };
const alerts = [];
function load(file, mocks = {}) {
  const context = { exports: {}, console: { ...console, error() {} }, alert: (text) => alerts.push(text), require(name) {
    if (name in mocks) return mocks[name];
    if (name.endsWith('.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith('@/lib/')) return load(`${name.slice(2)}.ts`, mocks);
    return require(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, context);
  return context.exports;
}
function hooks(values) {
  let state = 0;
  return { reset() { state = 0; }, react: { ...require('react'),
    useState(initial) { const i = state++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], (v) => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useEffect() {}, useRef(value) { return { current: value }; },
  } };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const customers = [{ id: 'a', customerName: '得意先A', shippingOffsetDays: 2 }, { id: 'b', customerName: '得意先B', shippingOffsetDays: 5 }];
const product = (id, customerId, code) => ({ id, customerId, productCode: code, productName: '同名製品', customerName: `得意先${customerId.toUpperCase()}` });
const products = [product('a1', 'a', 'A-001'), product('a2', 'a', 'A-002'), product('b1', 'b', 'B-001')];
const { productsForCustomer, plannedStartDateError, completionDateForCustomer, manufacturingPlannedStart } = load('lib/orderEntry.ts');
check(productsForCustomer(products, customers, 'a').map((row) => row.id).join(','), 'a1,a2');
check(productsForCustomer(products, customers, '').length, 0);
const legacy = { ...products[0], id: 'legacy', customerId: '' };
check(productsForCustomer([legacy], customers, 'a').length, 1);
check(productsForCustomer([legacy], [...customers, { ...customers[0], id: 'duplicate' }], 'a').length, 0);
check(completionDateForCustomer('2026-12-10', customers[0]), '2026-12-08');
check(completionDateForCustomer('2026-12-10', customers[1]), '2026-12-05');
check(plannedStartDateError('', '2026-12-01'), '');
check(plannedStartDateError('2026-02-30'), '開始予定日を正しい日付で入力してください');
check(plannedStartDateError('2026-12-09', '2026-12-08'), '開始予定日は完了予定日以前にしてください');
check(plannedStartDateError('2026-12-11', undefined, '2026-12-10'), '開始予定日は納期以前にしてください');
check(manufacturingPlannedStart('2026-12-03', '2026-12-04', '2026-12-05'), '2026-12-03');
check(manufacturingPlannedStart(null, '2026-12-04', '2026-12-05'), '2026-12-04');
check(manufacturingPlannedStart(null, null, '2026-12-05'), '2026-12-05');
check(manufacturingPlannedStart(null, null), null);

const values = [products, customers, ' ORDER-NEW ', '2026-12-03', '', '', '100', '2026-12-10', '', false, false, false];
const h = hooks(values), inserts = [], calls = [];
const db = { from(table) {
  const query = { select() { return query; }, eq() { return query; },
    maybeSingle: async () => ({ data: null, error: null }),
    insert(payload) { inserts.push({ table, payload }); return query; },
    single: async () => ({ data: { id: 'new-post' }, error: null }),
  }; return query;
}, rpc: async (name, args) => { calls.push({ name, args }); return { error: null }; } };
const Create = load('app/create/page.tsx', { react: h.react, '../../lib/supabase': { __esModule: true, default: db },
  '@/app/components/Numpad/Numpad': { __esModule: true, default: () => null },
}).default;
function renderCreate() { h.reset(); return Create(); }
let tree = renderCreate();
const find = (id) => nodes(tree).find((node) => node.props?.id === id);
check(find('product-id').props.disabled, true);
find('customer-id').props.onChange({ target: { value: 'a' } }); tree = renderCreate();
check(find('product-id').props.disabled, false);
check(nodes(find('product-id')).filter((node) => node.type === 'option' && node.props.value).map((node) => node.props.value).join(','), 'a1,a2');
find('product-id').props.onChange({ target: { value: 'a2' } }); tree = renderCreate();
check(find('product-code').props.value, 'A-002'); check(find('product-code').props.readOnly, true);
find('customer-id').props.onChange({ target: { value: 'b' } }); tree = renderCreate();
check(find('product-id').props.value, ''); check(find('product-code').props.value, '');
find('product-id').props.onChange({ target: { value: 'a1' } }); tree = renderCreate();
await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
check(inserts.length, 0); // A forged foreign product selection is rejected.
find('product-id').props.onChange({ target: { value: 'b1' } }); tree = renderCreate();
const html = renderToStaticMarkup(tree);
check(html.includes('ロットNo'), false); check(html.includes('開始予定日'), true);
check(html.indexOf('得意先名') < html.indexOf('製品名'), true);
check(html.indexOf('製品名') < html.indexOf('製品コード'), true);
await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
check(inserts.length, 1); check(inserts[0].payload.customer_id, 'b'); check(inserts[0].payload.product_id, 'b1');
check(inserts[0].payload.product_code, 'B-001'); check(inserts[0].payload.order_no, 'ORDER-NEW');
check(inserts[0].payload.planned_start_date, '2026-12-03');
check(Object.hasOwn(inserts[0].payload, 'lot_no'), false); check(inserts[0].payload.completion_scheduled_date, '2026-12-05');
check(calls[0].name, 'create_order_processes_for_post'); check(values[3], ''); check(values[4], ''); check(values[5], '');
// Invalid planned dates cannot reach the DB, and blank dates are persisted as NULL.
values[2] = 'SECOND'; values[3] = '2026-12-20'; values[4] = 'a'; values[5] = 'a1'; values[6] = '100'; values[7] = '2026-12-10';
tree = renderCreate(); await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); check(inserts.length, 1);
values[3] = ''; tree = renderCreate(); await nodes(tree).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
check(inserts[1].payload.planned_start_date, null);

// Each department replaces the lot label with the order's planned start date.
const base = { productName: 'P', customerName: 'C', orderAmount: 100, remainingAmount: 100, deliveryDate: '2026-12-20', lotNo: 'LEGACY-LOT-DO-NOT-DISPLAY' };
const schedule = { ...base, id: 'schedule', postId: 'p1', orderNo: 'A', department: '製造G', plannedStartDate: '2026-12-03', pressNumber: '1', planAmount: 100 };
const posts = [{ ...base, id: 'p1', orderNo: 'A', plannedStartDate: '2026-12-03' }, { ...base, id: 'p2', orderNo: 'B', plannedStartDate: '2026-12-04' }];
const balances = ['検査', '梱包'].map((name, i) => ({ ...base, id: `balance-${i}`, postId: 'p1', orderNo: 'A', processName: name, quantity: 10, plannedStartDate: '2026-12-03' }));
const search = { orderNo: '', customerName: '', productName: '', pressNumber: '', plannedStartDate: '' };
const sValues = [[schedule], posts, balances, '製造G', { ...search }, { ...search }, false, null, null, {}, false];
const sh = hooks(sValues);
const scheduleWrites = [];
let saveError = null;
const scheduleDB = { from(table) {
  let operation = 'read', payload, id;
  const query = { select() { return query; }, order() { return query; }, range() { return query; }, or() { return query; }, eq(key, value) { if (key === 'id') id = value; return query; },
    insert(value) { operation = 'insert'; payload = value; return query; }, update(value) { operation = 'update'; payload = value; return query; },
    then(resolve, reject) {
      if (operation !== 'read') scheduleWrites.push({ table, operation, payload, id });
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  }; return query;
}, rpc: async (name, payload) => { scheduleWrites.push({ name, payload }); return { error: saveError }; } };
const Schedules = load('app/productionSchedules/page.tsx', { react: sh.react,
  '@/lib/supabase': { __esModule: true, default: scheduleDB }, '@/lib/auth/client': { authFetch: async () => ({ ok: true, json: async () => [] }) },
  '@/app/components/Numpad/Numpad': { __esModule: true, default: () => null },
}).default;
function renderSchedules() { sh.reset(); return renderToStaticMarkup(Schedules()); }
for (const department of ['製造G', '品質管理G', '梱包出荷G', '全て']) {
  sValues[3] = department; const result = renderSchedules();
  check(result.includes('<th>開始予定日</th>'), true); check(result.includes('<th>ロット</th>'), false);
  check(result.includes('2026-12-03'), true); check(result.includes('LEGACY-LOT-DO-NOT-DISPLAY'), false);
}
sValues[3] = '全て'; sValues[5] = { ...search, plannedStartDate: '2026-12-04' };
const filtered = renderSchedules(); check(filtered.includes('2026-12-04'), true); check(filtered.includes('2026-12-03'), false);
// All-department edit must update/create the manufacturing schedule without changing actual quantities.
function scheduleTree() { sh.reset(); return Schedules(); }
function button(tree, label) { return nodes(tree).find((node) => node.type === 'button' && node.props.children === label); }
function input(tree, label) { return nodes(tree).find((node) => node.type === 'input' && node.props['aria-label'] === label); }
function resetSchedules(schedules) {
  sValues[0] = schedules; sValues[1] = [posts[0]]; sValues[2] = []; sValues[3] = '全て';
  sValues[5] = { ...search }; sValues[8] = null; sValues[9] = {}; scheduleWrites.length = 0;
}
resetSchedules([
  { ...schedule, pressCompletedDate: '2026-12-04' },
  { ...schedule, id: 'quality', department: '品質管理G', pressCompletedDate: '2026-12-05' },
  { ...schedule, id: 'shipping', department: '梱包出荷G', pressCompletedDate: '2026-12-06' },
]);
let editTree = scheduleTree(); button(editTree, '編集').props.onClick(); editTree = scheduleTree();
check(input(editTree, '製造Gの完了予定日').props.value, '2026-12-04');
input(editTree, '製造Gの完了予定日').props.onChange({ target: { value: '2026-12-07' } }); editTree = scheduleTree();
check(input(editTree, '製造Gの完了予定日').props.value, '2026-12-07');
await button(editTree, '保存').props.onClick();
check(scheduleWrites.length, 1);
check(scheduleWrites[0].name, 'save_daily_department_dates');
check(JSON.stringify(scheduleWrites[0].payload), JSON.stringify({ p_post_id: 'p1', p_manufacturing_date: '2026-12-07', p_quality_date: '2026-12-05', p_shipping_date: '2026-12-06' }));
resetSchedules([{ ...schedule, pressCompletedDate: '2026-12-04' }]);
editTree = scheduleTree(); button(editTree, '編集').props.onClick(); editTree = scheduleTree();
input(editTree, '製造Gの完了予定日').props.onChange({ target: { value: '' } }); editTree = scheduleTree();
await button(editTree, '保存').props.onClick();
check(scheduleWrites.length, 1); check(scheduleWrites[0].payload.p_manufacturing_date, null);
resetSchedules([]);
editTree = scheduleTree(); button(editTree, '編集').props.onClick(); editTree = scheduleTree();
check(input(editTree, '製造Gの完了予定日').props.value, '');
input(editTree, '製造Gの完了予定日').props.onChange({ target: { value: '2026-12-08' } }); editTree = scheduleTree();
await button(editTree, '保存').props.onClick();
check(scheduleWrites.length, 1); check(scheduleWrites[0].payload.p_manufacturing_date, '2026-12-08');
// RPC failure retains all editing values for retry.
resetSchedules([]); editTree = scheduleTree(); button(editTree, '編集').props.onClick(); editTree = scheduleTree();
input(editTree, '製造Gの完了予定日').props.onChange({ target: { value: '2026-12-09' } }); editTree = scheduleTree();
saveError = { message: 'synthetic transaction failure' }; await button(editTree, '保存').props.onClick();
editTree = scheduleTree(); check(input(editTree, '製造Gの完了予定日').props.value, '2026-12-09');
saveError = null; await button(editTree, '保存').props.onClick(); check(scheduleWrites.length, 2);
resetSchedules([]); editTree = scheduleTree(); button(editTree, '編集').props.onClick(); editTree = scheduleTree();
input(editTree, '製造Gの完了予定日').props.onChange({ target: { value: '2026-12-08' } }); editTree = scheduleTree();
await button(editTree, 'キャンセル').props.onClick(); check(scheduleWrites.length, 0);
// Manufacturing is display-only for both registered schedules and automatic order rows.
resetSchedules([{ ...schedule, pressCompletedAmount: 0, pressCompletedDate: '2026-12-04' }]);
sValues[1] = posts; sValues[3] = '製造G'; editTree = scheduleTree();
check(Boolean(button(editTree, '編集')), false); check(Boolean(button(editTree, '削除')), false);
check(Boolean(button(editTree, '検索')), false);
sValues[3] = '全て'; check(Boolean(button(scheduleTree(), '検索')), true); sValues[3] = '製造G';
check(nodes(editTree).some(node => node.type === 'th' && node.props.children === '操作'), false);
check(scheduleWrites.length, 0);
check(renderSchedules().includes('2026-12-03'), true); check(renderSchedules().includes('2026-12-04'), true);
// Search moved to All, and its row-level machine filter uses the actual schedules.
sValues[3] = '全て'; sValues[5] = {...search,pressNumber:'1'};
let searchHtml = renderSchedules();check(searchHtml.includes('>A</div>'),true);check(searchHtml.includes('>B</div>'),false);
sValues[3] = '製造G';searchHtml = renderSchedules();check(searchHtml.includes('>B</div>'),true);
resetSchedules([{...schedule,productPlanAmount:250}]);editTree=scheduleTree();button(editTree,'編集').props.onClick();editTree=scheduleTree();
check(input(editTree,'Aの計画数').props.value,'250');
input(editTree,'Aの計画数').props.onChange({target:{value:'0'}});editTree=scheduleTree();await button(editTree,'保存').props.onClick();
check(scheduleWrites[0].payload.p_plan_amount,0);
resetSchedules([{...schedule,productPlanAmount:250}]);editTree=scheduleTree();button(editTree,'編集').props.onClick();editTree=scheduleTree();
input(editTree,'Aの計画数').props.onFocus();editTree=scheduleTree();
nodes(editTree).find(node=>node.props?.open===true&&typeof node.props?.onClose==='function').props.onChange('125');
editTree=scheduleTree();check(input(editTree,'Aの計画数').props.value,'125');
input(editTree,'Aの計画数').props.onChange({target:{value:'-1'}});editTree=scheduleTree();await button(editTree,'保存').props.onClick();check(scheduleWrites.length,0);
console.log(JSON.stringify({ mode: 'offline customer/product selection, order submission, planned dates and department schedules', passed }));
