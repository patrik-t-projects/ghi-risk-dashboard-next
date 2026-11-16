import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const forecastContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/forecastCsv.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, forecastContext);
const fogContext = { exports: {}, require: name => {
  if (name === './forecastCsv') return forecastContext.exports;
  throw Error(`Unexpected dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/fogCsv.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, fogContext);

const header = 'model,reference_datetime,datetime,location_id,location_latitude,location_longitude,grid_latitude,grid_longitude,grid_distance_km,model_level,height_asl_m,surface_height_asl_m,height_agl_m,fog_probability';
const row = (time, probability, height) => `icon_ch2,2026-11-16T06:00:00Z,${time},ZRH,47.45,8.56,47.46,8.55,0.8,80,${height},430,${height - 430},${probability}`;

test('fog CSV validation parses the upload contract and interpolates quarter hours', () => {
  const data = fogContext.exports.parseFogCsv(`${header}\n${row('2026-11-16T10:00:00Z', 0.2, 500)}\n${row('2026-11-16T11:00:00Z', 0.6, 540)}\n`);
  assert.deepEqual([...data.runtimes], ['2026-11-16T06:00:00Z']);
  const records = fogContext.exports.fogRecordsAtTime(data.records, '2026-11-16T10:15:00Z', '15min');
  assert.equal(records.length, 1);
  assert.equal(records[0].fogProbability, 0.3);
  assert.equal(records[0].heightAslM, 510);
  assert.equal(fogContext.exports.fogRecordsAtTime(data.records, '2026-11-16T10:15:00Z', 'hourly').length, 0);
});

test('fog source uses stable daily and monthly storage paths', () => {
  const source = fs.readFileSync('src/lib/fogSource.ts', 'utf8');
  assert.match(source, /forecast\/fog\/daily\.csv/);
  assert.match(source, /forecast\/fog\/monthly\/\$\{runtime\.slice\(0, 7\)\}\.csv/);
});
