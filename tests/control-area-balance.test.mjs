import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
function compile(file, require = () => { throw Error('Unexpected dependency'); }, extras = {}) {
  const context = { exports: {}, require, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, context);
  return context.exports;
}

const parser = compile('src/lib/controlAreaBalanceCsv.ts');
const customDashboard = compile('src/lib/customDashboard.ts');
const exporter = compile('src/lib/controlAreaBalanceExport.ts', name => {
  if (name === './forecastExport') return { saveDownload: () => {} };
  if (name === './controlAreaBalanceCsv') return {};
  throw Error(name);
}, { Blob });
const csv = 'Date Time [UTC];Extra;Total System Imbalance;AE-Preis\n' +
  '19.09.2026 00:15;x;-31.97917667;21.04\n' +
  '19.09.2026 00:00;x;-49.40379333;23.14\n';

test('parses the exact Swissgrid semicolon schema into sorted UTC values', () => {
  const data = parser.parseControlAreaBalanceCsv(csv);
  assert.equal(data.start, '2026-09-19T00:00:00Z');
  assert.equal(data.end, '2026-09-19T00:15:00Z');
  assert.equal(data.rows[0].imbalance, -49.40379333);
  assert.equal(data.rows[0].aep, 23.14);
  assert.equal(parser.selectControlAreaBalanceRange(data.rows, '2026-09-19', '2026-09-19').length, 2);
});

test('accepts the future AEP EUR/MWh column name', () => {
  const data = parser.parseControlAreaBalanceCsv(csv.replace('AE-Preis', 'AEP EUR/MWh'));
  assert.equal(data.rows[0].aep, 23.14);
});

test('exports displayed balance values with the current Swissgrid column names', () => {
  const data = parser.parseControlAreaBalanceCsv(csv);
  const exported = exporter.controlAreaBalanceCsv(data.rows);
  assert.match(exported, /^Date Time \[UTC\];Total System Imbalance;AEP EUR\/MWh\r?\n/);
  assert.match(exported, /19\.09\.2026 00:00;-49\.40379333;23\.14/);
  assert.match(exported, /19\.09\.2026 00:15;-31\.97917667;21\.04/);
});

test('rejects missing columns, duplicate timestamps and non-quarter-hour timestamps', () => {
  assert.throws(() => parser.parseControlAreaBalanceCsv('Date Time [UTC];Total System Imbalance\n19.09.2026 00:00;1\n'));
  assert.throws(() => parser.parseControlAreaBalanceCsv(csv + '19.09.2026 00:00;x;1;2\n'));
  assert.throws(() => parser.parseControlAreaBalanceCsv(csv.replace('00:15', '00:14')));
});

test('loads the today and yearly files from their exact private Storage paths', async () => {
  const downloads = [];
  const storage = {
    list: async () => ({ data: [
      { id: 'today-id', name: 'control-area-balance-today.csv', updated_at: 'v1', metadata: { eTag: '1' } },
      { id: 'year-id', name: 'control-area-balance-yearly.csv', updated_at: 'v1', metadata: { eTag: '1' } },
    ], error: null }),
    download: async path => { downloads.push(path); return { data: new Blob([csv]), error: null }; },
  };
  const source = compile('src/lib/controlAreaBalanceSource.ts', name => {
    if (name === 'node:crypto') return crypto;
    if (name === './controlAreaBalanceCsv') return parser;
    if (name === '@supabase/supabase-js') return { createClient: () => ({ storage: { from: bucket => {
      assert.equal(bucket, 'forecast-data'); return storage;
    } } }) };
    throw Error(name);
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'secret' } }, fetch, Blob });
  await source.loadControlAreaBalance('today');
  await source.loadControlAreaBalance('yearly');
  assert.deepEqual(downloads, ['swissgrid/control-area-balance-today.csv', 'swissgrid/control-area-balance-yearly.csv']);
});

for (const mode of ['today', 'history']) test(`${mode} imbalance controls render before data arrives`, () => {
  const component = compile('src/components/ControlAreaBalance.tsx', name => {
    if (name.startsWith('react')) return nodeRequire(name);
    if (name === '@/lib/controlAreaBalanceClient') return {};
    if (name === '@/lib/controlAreaBalanceExport') return {};
    if (name === '@/lib/customDashboard') return customDashboard;
    if (name === './ControlAreaBalanceChart') return { default: () => null };
    if (name === './ImbalanceForecastFrame') return { default: () => null };
    if (name === './PinPlotButton') return { default: () => null };
    if (name === './PinnablePlotCard') return { default: ({ header, children }) => React.createElement(React.Fragment, null, header, children) };
    throw Error(name);
  });
  const html = renderToStaticMarkup(React.createElement(component.default, { mode, onModeChange: () => {} }));
  assert.match(html, /CH Imbalance &amp; AEP/);
  assert.match(html, /Control-area balance period/);
  assert.match(html, /Today/);
  assert.match(html, /Historical/);
  assert.match(html, /Imbalance forecast/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /<iframe/);
  if (mode === 'history') {
    assert.match(html, /From \(UTC day\)/);
    assert.match(html, /To \(UTC day\)/);
    assert.match(html, /Show range/);
  }
});

test('HTML imbalance forecast moved below the chart and out of sidebar navigation', () => {
  const component = fs.readFileSync('src/components/ControlAreaBalance.tsx', 'utf8');
  const frame = fs.readFileSync('src/components/ImbalanceForecastFrame.tsx', 'utf8');
  const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');
  assert.match(frame, /dashboard-html\?dashboard=imbalance-ch/);
  assert.match(frame, /title="Imbalance forecast dashboard"/);
  assert.match(component, /aria-expanded=\{forecastOpen\}/);
  assert.doesNotMatch(page, /label: "Imbalance CH model"/);
});

test('chart defines units, moving unified hover and a vertical cursor line', () => {
  const source = fs.readFileSync('src/components/ControlAreaBalanceChart.tsx', 'utf8');
  assert.match(source, /type: "bar"/);
  assert.match(source, /color: "#94a3b8"/);
  assert.match(source, /name: "AEP"/);
  assert.match(source, /color: "#2563eb"/);
  assert.match(source, /Imbalance \[MW\]/);
  assert.match(source, /AEP \[EUR\/MWh\]/);
  assert.match(source, /hovermode: "x unified"/);
  assert.match(source, /showspikes: true/);
  assert.match(source, /spikemode: "across"/);
  assert.match(source, /spikesnap: "cursor"/);
  assert.doesNotMatch(source, /absolute left-4 top-4/);
  assert.match(source, /range: xRange/);
  assert.match(source, /width: QUARTER_HOUR_MS/);
  assert.match(source, /HALF_INTERVAL_MS/);
  assert.match(source, /row\.time\.replace\(\/Z\$\/, ""\)/);
  assert.match(source, /x0: nowMinute, x1: nowMinute/);
  assert.match(source, /Now · \$\{nowMinute\.slice\(11, 16\)\} UTC/);
  assert.match(source, /setInterval\(update, 60000\)/);
  assert.match(source, /data-control-area-balance-chart/);
  const component = fs.readFileSync('src/components/ControlAreaBalance.tsx', 'utf8');
  assert.match(component, /Download/);
  assert.match(component, /PNG — current plot/);
  assert.match(component, /PDF — current plot/);
  assert.match(component, /CSV — displayed values/);
});
