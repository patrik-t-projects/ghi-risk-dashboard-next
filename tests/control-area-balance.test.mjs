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
    if (name === './ControlAreaBalanceChart') return { default: () => null };
    throw Error(name);
  });
  const html = renderToStaticMarkup(React.createElement(component.default, { mode, onModeChange: () => {} }));
  assert.match(html, /CH Imbalance &amp; AEP/);
  assert.match(html, /Control-area balance period/);
  assert.match(html, /Today/);
  assert.match(html, /Historical/);
  if (mode === 'history') {
    assert.match(html, /From \(UTC day\)/);
    assert.match(html, /To \(UTC day\)/);
    assert.match(html, /Show range/);
  }
});

test('chart defines grey imbalance bars, a blue AEP line and top-left hover details', () => {
  const source = fs.readFileSync('src/components/ControlAreaBalanceChart.tsx', 'utf8');
  assert.match(source, /type: "bar"/);
  assert.match(source, /color: "#94a3b8"/);
  assert.match(source, /name: "AEP"/);
  assert.match(source, /color: "#2563eb"/);
  assert.match(source, /absolute left-4 top-4/);
  assert.match(source, /range: xRange/);
  assert.match(source, /width: QUARTER_HOUR_MS/);
  assert.match(source, /HALF_INTERVAL_MS/);
  assert.match(source, /row\.time\.replace\(\/Z\$\/, ""\)/);
  assert.match(source, /pointIndex/);
});
