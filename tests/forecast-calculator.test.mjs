import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {}, require: name => { throw Error(`Unexpected dependency: ${name}`); } };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/forecastCalculator.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);
const calculator = context.exports;

const run06 = '20261011T060000Z';
const run12 = '20261011T120000Z';
const series = [
  { key: 'c6', model: 'icon_ch2', run: run06, member: 'control' },
  { key: 'm6', model: 'icon_ch2', run: run06, member: 'member_1' },
  { key: 'c12', model: 'icon_ch2', run: run12, member: 'control' },
];
const segments = [{ series, rows: [
  { time: '2026-10-11T07:15:00Z', measured: 500, values: [580, 590, null] },
  { time: '2026-10-11T08:00:00Z', measured: null, values: [600, 610, null] },
  { time: '2026-10-11T08:15:00Z', measured: null, values: [600, 610, null] },
  { time: '2026-10-11T08:30:00Z', measured: null, values: [600, 610, null] },
  { time: '2026-10-11T08:45:00Z', measured: null, values: [600, 610, null] },
] }];

test('calculator derives measured timestamps and historical run eligibility', () => {
  const measured = calculator.measuredGhiOptions(segments);
  assert.equal(measured.length, 1);
  assert.equal(measured[0].time, '2026-10-11T07:15:00Z');
  assert.equal(measured[0].value, 500);
  assert.deepEqual(Array.from(calculator.icon2RunOptions(segments, '2026-10-11T07:15:00Z', true)), [run06]);
  assert.deepEqual(Array.from(calculator.icon2RunOptions(segments, '2026-10-11T07:15:00Z', false)), [run12, run06]);
});

test('calculator uses one member value for the selected future hour', () => {
  assert.deepEqual(Array.from(calculator.futureHourOptions(segments, run06, '2026-10-11T07:15:00Z')), ['2026-10-11T08:00:00Z']);
  const values = calculator.futureGhiValues(segments, run06, '2026-10-11T08:00:00Z');
  assert.equal(values.length, 21);
  assert.equal(values[0].member, 'control');
  assert.equal(values[0].ghi, 600);
  assert.equal(values[1].member, 'member_1');
  assert.equal(values[1].ghi, 610);
  assert.equal(values[20].member, 'member_20');
  assert.equal(values[20].ghi, null);
});

test('calculator applies both GHI DA values and rejects a zero denominator', () => {
  const base = calculator.deltaAussp(100, 9, 125, 500, 450);
  assert.equal(base, 96.4);
  assert.equal(calculator.predictedDelta(base, 9, 125, 600, 550), 100);
  assert.equal(calculator.deltaAussp(100, 9, 0, 500, 450), null);
  assert.equal(calculator.predictedDelta(base, 9, 0, 600, 550), null);
});

test('calculator UI exposes editable inputs, control marking and descending GHI sorting', () => {
  const source = fs.readFileSync('src/components/ForecastDeltaCalculator.tsx', 'utf8');
  assert.match(source, /GHI DA current/);
  assert.match(source, /GHI DA future/);
  assert.match(source, /Future GHI \[W\/m²\]/);
  assert.match(source, /row\.control/);
  assert.match(source, /right\.value \?\? -Infinity/);
});
