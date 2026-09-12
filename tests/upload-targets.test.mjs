import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/uploadTargets.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const { resolveUploadTarget } = context.exports;

test('existing HTML slots remain unchanged', () => {
  for (const [id, filename] of [['icon-forecast', 'icon_forecast.html'], ['imbalance-ch', 'imbalance_dashboard.html']]) {
    const target = resolveUploadTarget(id, null);
    assert.equal(target.bucket, 'dashboard-html');
    assert.equal(target.path, filename);
    assert.equal(target.contentType, 'text/html; charset=utf-8');
  }
});

test('daily files use one date-specific path; past dates remain uploadable', () => {
  for (const day of ['2026-09-12', '2026-09-13', '2024-02-29', '2025-01-01']) {
    const target = resolveUploadTarget('forecast-daily', day);
    assert.equal(target.bucket, 'forecast-data');
    assert.equal(target.path, `daily/icon_ghi_all_stations_${day}.csv`);
    assert.equal(target.contentType, 'text/csv; charset=utf-8');
  }
});

test('rejects malformed dates, invalid calendar days, unknown targets and path injection', () => {
  for (const day of [null, '', '2026-02-29', '2026-09-31', '2026-13-01', '2026-9-1', '../2026-09-12', '2026-09-12/other.csv']) {
    assert.equal(resolveUploadTarget('forecast-daily', day), null);
  }
  for (const id of [null, '__proto__', 'constructor', 'historical', '../other']) assert.equal(resolveUploadTarget(id, '2026-09-12'), null);
});
