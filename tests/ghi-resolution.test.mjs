import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  const context = { exports: {}, require: () => { throw Error('Unexpected dependency'); } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}

const resolution = compile('src/lib/ghiResolution.ts');

test('15-minute chart mode interpolates forecast values and preserves observations', () => {
  const segment = {
    series: [
      { key: 'control', model: 'icon_ch2', run: '20261116T000000Z', member: 'control' },
      { key: 'member', model: 'icon_ch2', run: '20261116T000000Z', member: 'member_1' },
    ],
    rows: [
      { time: '2026-11-16T10:00:00Z', measured: 10, values: [100, 50] },
      { time: '2026-11-16T10:15:00Z', measured: 20, values: [100, 50] },
      { time: '2026-11-16T10:30:00Z', measured: 30, values: [100, 50] },
      { time: '2026-11-16T10:45:00Z', measured: 40, values: [100, 50] },
      { time: '2026-11-16T11:00:00Z', measured: 50, values: [200, 100] },
      { time: '2026-11-16T11:15:00Z', measured: 60, values: [200, 100] },
    ],
  };
  const hourly = resolution.interpolateForecastSegments([segment], 'hourly');
  assert.equal(hourly[0], segment);
  const interpolated = resolution.interpolateForecastSegments([segment], '15min')[0];
  assert.deepEqual(Array.from(interpolated.rows, row => Array.from(row.values)), [
    [100, 50], [125, 62.5], [150, 75], [175, 87.5], [200, 100], [200, 100],
  ]);
  assert.deepEqual(Array.from(interpolated.rows, row => row.measured), [10, 20, 30, 40, 50, 60]);
  assert.deepEqual(Array.from(segment.rows[1].values), [100, 50]);
});

test('interpolation stays within one-hour anchors and does not bridge missing members or gaps', () => {
  const segment = { series: [], rows: [
    { time: '2026-11-16T10:00:00Z', measured: null, values: [100, null] },
    { time: '2026-11-16T10:15:00Z', measured: null, values: [100, 7] },
    { time: '2026-11-16T11:00:00Z', measured: null, values: [200, 20] },
    { time: '2026-11-16T12:15:00Z', measured: null, values: [300, 30] },
    { time: '2026-11-16T13:00:00Z', measured: null, values: [400, 40] },
  ] };
  const rows = resolution.interpolateForecastSegments([segment], '15min')[0].rows;
  assert.deepEqual(Array.from(rows[1].values), [125, 7]);
  assert.deepEqual(Array.from(rows[3].values), [300, 30]);
});

test('CSV interpolation changes only forecast columns within each model runtime', () => {
  const header = ['datetime', 'station_abbr', 'Model', 'Runtime', 'measured_ghi', 'control', 'member_1'];
  const rows = [
    ['2026-11-16T10:00:00Z', 'CHZ', 'ICON2', '16.11.2026 00 UTC', '10', '100', ''],
    ['2026-11-16T10:15:00Z', 'CHZ', 'ICON2', '16.11.2026 00 UTC', '20', '100', '7'],
    ['2026-11-16T10:30:00Z', 'CHZ', 'ICON2', '16.11.2026 00 UTC', '30', '100', '7'],
    ['2026-11-16T10:45:00Z', 'CHZ', 'ICON2', '16.11.2026 00 UTC', '40', '100', '7'],
    ['2026-11-16T11:00:00Z', 'CHZ', 'ICON2', '16.11.2026 00 UTC', '50', '200', '20'],
    ['2026-11-16T10:15:00Z', 'CHZ', 'ICON1', '16.11.2026 00 UTC', '20', '900', '900'],
  ];
  const result = resolution.interpolateForecastCsvRows(header, rows, '15min');
  assert.equal(result[1][4], '20');
  assert.equal(result[1][5], '125');
  assert.equal(result[1][6], '7');
  assert.equal(result[2][5], '150');
  assert.equal(result[3][5], '175');
  assert.equal(result[5][5], '900');
  assert.equal(rows[1][5], '100');
});

test('the account preference reaches GHI plots, pinned plots and authenticated CSV export only', () => {
  const account = fs.readFileSync('src/app/account/page.tsx', 'utf8');
  const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');
  const map = fs.readFileSync('src/components/SwitzerlandBeta.tsx', 'utf8');
  const widgets = fs.readFileSync('src/components/DashboardWidgets.tsx', 'utf8');
  const exportRoute = fs.readFileSync('src/app/api/forecast-export/route.ts', 'utf8');
  assert.match(account, /GHI forecast resolution/);
  assert.match(account, /ghi_forecast_resolution: ghiResolution/);
  assert.match(page, /user_metadata\?\.ghi_forecast_resolution/);
  assert.match(page, /ghiResolution=\{ghiResolution\}/);
  assert.match(map, /resolution=\{resolution\}/);
  assert.match(widgets, /resolution=\{resolution\}/);
  assert.match(exportRoute, /data\.user\.user_metadata\?\.ghi_forecast_resolution/);
  assert.match(exportRoute, /interpolateForecastCsvRows\(header, rows, resolution\)/);
});
