import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file, require = name => { throw Error(`Unexpected dependency: ${name}`); }) {
  const context = { exports: {}, require };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}

const comparison = compile('src/lib/forecastComparison.ts');

const run00 = '20261111T000000Z';
const run06 = '20261111T060000Z';
const run12 = '20261111T120000Z';
const segments = [{
  series: [
    { key: 'a', model: 'icon_ch1', run: run00, member: 'control' },
    { key: 'b', model: 'icon_ch2', run: run00, member: 'control' },
    { key: 'c', model: 'icon_ch2', run: run06, member: 'control' },
    { key: 'd', model: 'icon_ch1', run: run12, member: 'control' },
  ],
  rows: [
    { time: '2026-11-11T08:00:00Z', measured: 500, values: [600, 610, 650, 2000] },
    { time: '2026-11-12T08:00:00Z', measured: 400, values: [500, 510, 550, 1900] },
  ],
}];

test('comparison formats exact runtime labels', () => {
  assert.equal(comparison.compactRunLabel(run00), '2026-11-11T00');
});

test('comparison assigns six distinct runtime colors', () => {
  const runs = Array.from({ length: 6 }, (_, index) => `20261111T${String(index).padStart(2, '0')}0000Z`);
  assert.equal(new Set(runs.map(run => comparison.comparisonRunColor(run, runs))).size, 6);
});

test('comparison splits measured GHI by day and shares one selected-run y-axis', () => {
  assert.deepEqual(Array.from(comparison.observationDays(segments)), ['2026-11-11', '2026-11-12']);
  assert.deepEqual(Array.from(comparison.sharedGhiRange(segments, [run00, run06])), [0, 750]);
  assert.deepEqual(Array.from(comparison.sharedGhiRange(segments)), [0, 2200]);
});

test('comparison chart filters exact runtimes, labels daily observations and accepts a shared axis', () => {
  const chart = fs.readFileSync('src/components/ForecastChart.tsx', 'utf8');
  const stationPlots = fs.readFileSync('src/components/StationPlots.tsx', 'utf8');
  assert.match(chart, /selectedComparisonRuns\.includes\(s\.run\)/);
  assert.match(chart, /Actual GHI \$\{day\.slice\(8, 10\)\}\.\$\{day\.slice\(5, 7\)\}\./);
  assert.match(chart, /range: yRange/);
  assert.match(stationPlots, /sharedGhiRange\(data\.segments, comparisonRuns\)/);
});

test('comparison picker presents the requested two-line selector, six-run cap and removable list', () => {
  const picker = fs.readFileSync('src/components/ComparisonRuntimePicker.tsx', 'utf8');
  const view = fs.readFileSync('src/components/SwitzerlandBeta.tsx', 'utf8');
  assert.match(picker, /Run \(yyyy-mm-ddThh\)/);
  assert.match(picker, /selectedRuns\.length >= 6/);
  assert.match(picker, />Add runtime</);
  assert.match(picker, />Remove</);
  assert.match(view, /comparisonRuns\.length === 0/);
  assert.match(view, /Select at least one model runtime to show the comparison plots/);
});
