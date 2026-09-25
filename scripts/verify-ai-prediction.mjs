// Offline regression tests by default. --live uses synthetic Gemini inputs and read-only DB queries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
const { loadEnvConfig } = nextEnv;

const source = fs.readFileSync('lib/aiPrediction/runner.ts', 'utf8');
const legacyContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/aiPrediction/legacy.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, legacyContext);
const { calculateLegacyPredictions } = legacyContext.exports;
function loadRunner(db, fetchImpl, env = {}) {
  const compiled = ts.transpileModule(source + '\nexport { fetchGeminiPredictions, addDays, shiftBusinessDays, countBusinessDays };', {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const context = {
    exports: {}, process: { env }, fetch: fetchImpl,
    require(name) {
      if (name === './legacy') return legacyContext.exports;
      assert.equal(name, '@/lib/supabaseAdmin');
      return { __esModule: true, default: db };
    },
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}

function fixture() {
  const calls = [];
  const tables = {
    ai_prediction_settings: {
      enabled: true, use_past_results: false, validation_mode: true,
      max_reference_days: 730, priority_reference_days: 90,
      manufacturing_min_business_days: 5, other_process_min_lots: 5,
      outsource_default_sent_offset_days: 0, outsource_default_return_offset_days: 3,
    },
    posts: [{ id: 'synthetic-order', order_no: 'SYNTHETIC', product_id: 'synthetic-product', order_amount: 100, delivery_date: '2099-01-01' }],
    order_processes: [{ id: 'synthetic-process', post_id: 'synthetic-order', product_id: 'synthetic-product', process_name: '製造', process_order: 1, planned_amount: 100, completed_amount: 0 }],
    process_master: [{ id: 'synthetic-master', process_id: 'M', name: '製造' }],
    line_master: [{ process_id: 'M', daily_capacity: 100, operation_rate: 100 }],
  };
  const db = { from(table) {
    let operation = 'select';
    let payload;
    let bounds;
    const query = {};
    for (const method of ['select', 'eq', 'gte', 'lt', 'neq', 'is', 'single', 'order']) query[method] = () => query;
    query.range = (start, end) => { bounds = [start, end]; return query; };
    for (const method of ['insert', 'update', 'upsert', 'delete']) query[method] = (value) => {
      operation = method; payload = value; return query;
    };
    query.then = (resolve, reject) => {
      calls.push({ table, operation, payload });
      let data = operation === 'select' ? (tables[table] || []) : table === 'ai_prediction_runs' && operation === 'insert' ? { id: 'synthetic-run' } : null;
      if (bounds && Array.isArray(data)) data = data.slice(bounds[0], bounds[1] + 1);
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return query;
  } };
  return { db, calls, tables };
}

async function offline() {
  const tests = [];
  async function test(name, run) {
    try { await run(); tests.push({ name, status: 'passed' }); }
    catch (error) { tests.push({ name, status: 'failed', message: error.message }); }
  }
  const noFetch = () => { throw new Error('Unexpected network call'); };
  const helpers = loadRunner(null, noFetch);
  const legacyInput = () => ({
    referenceDate: '2026-09-25', orderAmount: 200,
    processes: [{ id: 'p1', processName: '製造', processOrder: 1, overlapDays: 0, plannedAmount: 200, completedAmount: 0, completedDate: '' }],
    results: [], masters: [{ name: '製造', processId: 'M' }],
    lines: [{ processId: 'M', dailyCapacity: 100, enabled: true }], calendar: [],
  });
  await test('legacy excludes weekends and company holidays', () => {
    const input = legacyInput(); input.calendar = [{ date: '2026-09-28', isHoliday: true }];
    assert.equal(calculateLegacyPredictions(input)[0].predictedEnd, '2026-09-29');
  });
  await test('legacy honors explicitly working Saturday', () => {
    const input = legacyInput(); input.calendar = [{ date: '2026-09-26', isHoliday: false }];
    assert.equal(calculateLegacyPredictions(input)[0].predictedEnd, '2026-09-26');
  });
  await test('legacy process overlap never starts before preceding start', () => {
    const input = legacyInput();
    input.processes.push({ ...input.processes[0], id: 'p2', processOrder: 2, overlapDays: 9 });
    const output = calculateLegacyPredictions(input);
    assert.equal(output[1].predictedStart, '2026-09-25');
    input.processes[1].overlapDays = 0;
    assert.equal(calculateLegacyPredictions(input)[1].predictedStart, '2026-09-29');
  });
  await test('legacy partially completed process uses next business day after actual', () => {
    const input = legacyInput();
    input.results = [{ orderProcessId: 'p1', date: '2026-09-24', amount: 100 }];
    const prediction = calculateLegacyPredictions(input)[0];
    assert.equal(prediction.predictedEnd, '2026-09-25');
    assert.equal(prediction.remainingAmount, 100);
    assert.equal(prediction.progress, 50);
  });
  await test('legacy completed process preserves actual completion', () => {
    const input = legacyInput();
    input.processes[0].completedAmount = 200;
    input.processes[0].completedDate = '2026-09-24';
    assert.equal(calculateLegacyPredictions(input)[0].predictedEnd, '2026-09-24');
  });
  await test('legacy ignores unrelated logs and preserves missing capacity fallback', () => {
    const input = legacyInput(); input.orderAmount = 2; input.processes[0].plannedAmount = 2;
    input.lines = [];
    input.results = [{ orderProcessId: 'other', date: '2026-09-24', amount: 200 }];
    assert.equal(calculateLegacyPredictions(input)[0].predictedEnd, '2026-09-28');
  });
  await test('legacy accepts older processId-linked results', () => {
    const input = legacyInput();
    input.results = [{ processId: 'p1', date: '2026-09-24', amount: 200 }];
    assert.equal(calculateLegacyPredictions(input)[0].predictedEnd, '2026-09-24');
  });
  await test('runner saves separate AI and legacy dates', async () => {
    const f = fixture(); f.tables.line_master[0].operation_rate = 50;
    await loadRunner(f.db, noFetch).runAiPrediction('scheduled');
    const row = f.calls.find(c => c.table === 'ai_prediction_evaluations' && c.operation === 'insert').payload[0];
    assert.ok(row.legacy_completion_date < row.predicted_completion_date);
  });
  await test('legacy results after the first 1000 rows are included', async () => {
    const f = fixture();
    f.tables.production_results = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), post_id: 'other', order_process_id: 'other', date: '2020-01-01', amount: 1 }));
    f.tables.production_results.push({ id: 'last', post_id: 'synthetic-order', order_process_id: 'synthetic-process', date: '2020-01-02', amount: 100 });
    await loadRunner(f.db, noFetch).runAiPrediction('scheduled');
    const row = f.calls.find(c => c.table === 'ai_prediction_evaluations' && c.operation === 'insert').payload[0];
    assert.equal(row.legacy_completion_date, '2020-01-02');
    assert.equal(f.calls.filter(c => c.table === 'production_results').length, 2);
  });
  await test('weekend and company holiday excluded', () => {
    assert.equal(helpers.addDays('2026-09-25', 2, new Set(['2026-09-28']), false), '2026-09-29');
  });
  await test('outsourcing uses calendar days', () => {
    assert.equal(helpers.addDays('2026-09-25', 3, new Set(), true), '2026-09-27');
  });
  await test('zero-day offset rolls holiday forward', () => {
    assert.equal(helpers.shiftBusinessDays('2026-09-26', 0, new Set()), '2026-09-28');
  });
  await test('signed business day error', () => {
    assert.equal(helpers.countBusinessDays('2026-09-25', '2026-09-29', new Set(['2026-09-28'])), 1);
    assert.equal(helpers.countBusinessDays('2026-09-29', '2026-09-25', new Set(['2026-09-28'])), -1);
  });
  await test('no Gemini key needed when no history qualifies', async () => {
    assert.equal((await helpers.fetchGeminiPredictions([])).size, 0);
  });
  await test('capacity prediction and evaluation survive history cleanup', async () => {
    const f = fixture();
    const result = await loadRunner(f.db, noFetch, { GEMINI_API_KEY: 'fake' }).runAiPrediction('scheduled');
    assert.equal(result.status, 'succeeded');
    assert.equal(result.successCount, 1);
    assert.ok(f.calls.some(c => c.table === 'ai_prediction_latest' && c.operation === 'upsert'));
    assert.ok(f.calls.some(c => c.table === 'ai_prediction_evaluations' && c.operation === 'insert'));
    const evaluation = f.calls.find(c => c.table === 'ai_prediction_evaluations' && c.operation === 'insert');
    assert.match(evaluation.payload[0].legacy_completion_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!f.calls.some(c => c.table === 'ai_prediction_evaluations' && c.operation === 'delete'));
    assert.ok(f.calls.some(c => c.table === 'ai_prediction_results' && c.operation === 'delete'));
  });
  await test('zero capacity reports unavailable without replacing latest', async () => {
    const f = fixture(); f.tables.line_master[0].operation_rate = 0;
    const result = await loadRunner(f.db, noFetch, { GEMINI_API_KEY: 'fake' }).runAiPrediction('scheduled');
    assert.equal(result.failedCount, 1);
    assert.ok(!f.calls.some(c => c.table === 'ai_prediction_latest' && c.operation === 'upsert'));
  });
  await test('evaluation lead time uses actual completion and Japanese prediction date', async () => {
    const f = fixture();
    f.tables.order_processes[0].completed_amount = 100;
    f.tables.order_processes[0].completed_date = '2026-09-29';
    f.tables.ai_prediction_evaluations = [{ id: 'evaluation', predicted_completion_date: '2026-09-28', created_at: '2026-09-24T22:00:00Z' }];
    await loadRunner(f.db, noFetch).runAiPrediction('scheduled');
    const updated = f.calls.find(c => c.table === 'ai_prediction_evaluations' && c.operation === 'update');
    assert.equal(updated.payload.lead_business_days, 2);
    assert.equal(updated.payload.business_day_error, 1);
  });
  await test('invalid fractional Gemini duration rejected', async () => {
    const response = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ predictions: [{ orderProcessId: 'test', durationDays: 1.5, reason: 'test' }] }) }] } }] }) };
    const runner = loadRunner(null, async () => response, { GEMINI_API_KEY: 'fake' });
    assert.equal((await runner.fetchGeminiPredictions([{ orderProcessId: 'test' }])).size, 0);
  });
  console.log(JSON.stringify({ mode: 'offline', tests }, null, 2));
  if (tests.some(t => t.status === 'failed')) process.exitCode = 1;
}

async function live() {
  loadEnvConfig(process.cwd());
  const report = { checkedAt: new Date().toISOString(), mode: 'synthetic Gemini / read-only DB' };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, { auth: { persistSession: false }, global: { fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(20000) }) } });
    const runs = await db.from('ai_prediction_runs').select('trigger_type,status,started_at,finished_at,target_count,success_count,failed_count,error_code').order('started_at', { ascending: false }).limit(14);
    report.recentRuns = runs.error ? { errorCode: runs.error.code || 'connection_error' } : runs.data;
    const evaluations = await db.from('ai_prediction_evaluations').select('business_day_error,legacy_completion_date,actual_completion_date', { count: 'exact' }).order('created_at', { ascending: false }).limit(1000);
    if (evaluations.error) report.evaluations = { errorCode: evaluations.error.code || 'connection_error' };
    else {
      const rows = evaluations.data || [];
      const errors = rows.filter(r => r.actual_completion_date && r.business_day_error != null).map(r => Math.abs(Number(r.business_day_error)));
      report.evaluations = { total: evaluations.count, sampled: rows.length, completed: errors.length, withLegacyDate: rows.filter(r => r.legacy_completion_date).length, meanAbsoluteBusinessDayError: errors.length ? errors.reduce((a,b) => a+b,0)/errors.length : null };
    }
  } else report.database = 'configuration_missing';
  if (process.env.GEMINI_API_KEY) {
    let usage;
    let status;
    const runner = loadRunner(null, async (url, init) => {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) });
      status = response.status;
      if (response.ok) usage = (await response.clone().json()).usageMetadata;
      return response;
    }, { GEMINI_API_KEY: process.env.GEMINI_API_KEY });
    const cases = [
      { orderProcessId: 'synthetic-100', processName: '製造', remainingAmount: 100, historySampleCount: 5, historyBusinessDays: 5, historicalDailyAmount: 100, historicalDurationDays: null, outsourcing: false, expected: 1 },
      { orderProcessId: 'synthetic-300', processName: '製造', remainingAmount: 300, historySampleCount: 5, historyBusinessDays: 5, historicalDailyAmount: 100, historicalDurationDays: null, outsourcing: false, expected: 3 },
      { orderProcessId: 'synthetic-outsource', processName: '外注', remainingAmount: 100, historySampleCount: 5, historyBusinessDays: 0, historicalDailyAmount: null, historicalDurationDays: 3, outsourcing: true, expected: 3 },
    ];
    try {
      const predictions = await runner.fetchGeminiPredictions(cases);
      report.gemini = { status, usage, cases: cases.map(c => ({ id: c.orderProcessId, expectedDuration: c.expected, actualDuration: predictions.get(c.orderProcessId)?.durationDays ?? null })) };
    } catch {
      report.gemini = { status: status || 'network_error', outcome: 'failed; response body omitted to protect credentials' };
    }
  } else report.gemini = 'configuration_missing';
  console.log(JSON.stringify(report, null, 2));
}

(process.argv.includes('--live') ? live() : offline()).catch(() => {
  console.error('Verification could not finish; sensitive error details omitted.');
  process.exitCode = 1;
});
