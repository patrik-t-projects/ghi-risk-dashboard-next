import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';

function compile(file, require = () => { throw Error('Unexpected dependency'); }, extras = {}) {
  const context = { exports: {}, require, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}
const parser = compile('src/lib/forecastCsv.ts');
const history = compile('src/lib/forecastHistory.ts');
const csv = (day, value = 1) => 'datetime,station_abbr,grid_coordinates,Model,Runtime,measured_ghi,control,member_1\n' +
  `${day}T00:15:00Z,CHZ,"47.18,8.46",ICON1,12.09.2026 00 UTC,0,${value},2\n`;
function mockSource() {
  let entry = { name: 'icon_ghi_all_stations_2026-09-12.csv', id: 'file-1', updated_at: 'v1', metadata: { size: 100, eTag: '1' } };
  let content = csv('2026-09-12'); let downloads = 0; let race = false;
  const storage = { list: async () => ({ data: entry ? [entry] : [], error: null }),
    download: async (path, options, parameters) => {
      assert.equal(path, 'daily/icon_ghi_all_stations_2026-09-12.csv');
      assert.ok(options.cacheNonce); assert.equal(parameters.cache, 'no-store'); downloads++;
      if (race) entry = { ...entry, updated_at: 'race' };
      return { data: new Blob([content]), error: null };
    } };
  const source = compile('src/lib/forecastSource.ts', name => {
    if (name === 'node:crypto') return crypto;
    if (name === './forecastCsv') return parser;
    if (name === '@supabase/supabase-js') return { createClient: () => ({ storage: { from: bucket => {
      assert.equal(bucket, 'forecast-data'); return storage;
    } } }) };
    throw Error(name);
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'test-secret' } } });
  return { source, downloads: () => downloads, update: () => { entry = { ...entry, updated_at: 'v2', metadata: { eTag: '2' } }; content = csv('2026-09-12', 9); },
    remove: () => { entry = null; }, race: () => { race = true; } };
}

test('storage snapshot reuses unchanged uploads and invalidates changed days', async () => {
  const mock = mockSource(); const first = (await mock.source.listForecastFiles())[0];
  const result = await mock.source.loadDailyForecast(first.day, first.version);
  await mock.source.loadDailyForecast(first.day, first.version);
  assert.equal(mock.downloads(), 1);
  assert.equal(result.data.stations[0].rows[0].values[0], 1);
  mock.update(); const second = (await mock.source.listForecastFiles(true))[0];
  assert.notEqual(second.version, first.version);
  await assert.rejects(mock.source.loadDailyForecast(first.day, first.version), error => error.status === 409);
  assert.equal((await mock.source.loadDailyForecast(second.day, second.version)).data.stations[0].rows[0].values[0], 9);
  assert.equal(mock.downloads(), 2);
});
test('empty storage has no local fallback; upload races are rejected', async () => {
  const empty = mockSource(); empty.remove();
  assert.equal((await empty.source.listForecastFiles()).length, 0);
  await assert.rejects(empty.source.loadDailyForecast('2026-09-12'), error => error.status === 404);
  const race = mockSource(); const file = (await race.source.listForecastFiles())[0]; race.race();
  await assert.rejects(race.source.loadDailyForecast(file.day, file.version), error => error.status === 409);
});
test('historical days retain series identity, observations and gaps without dense null matrices', () => {
  const detail = day => { const data = parser.parseForecastCsv(csv(day)); return { ...data, station: data.stations[0] }; };
  const combined = history.combineStationDays([detail('2026-09-14'), detail('2026-09-12')]);
  assert.equal(combined.series.length, 2); // same runtime in both daily files
  assert.equal(combined.segments.length, 2);
  assert.equal(combined.station.rows.length, 0); // sparse daily segments
  const values = history.seriesPoints(combined.segments, combined.series[0].key);
  assert.deepEqual(Array.from(values.y), [1, null, 1]);
  assert.deepEqual(Array.from(history.seriesPoints(combined.segments).y), [0, null, 0]);
  assert.equal(values.x[0], '2026-09-12T00:15:00');
  assert.equal(values.x.at(-1), '2026-09-14T00:15:00');
});
test('overlapping daily endpoints merge once; missing values remain gaps', () => {
  const data = parser.parseForecastCsv(csv('2026-09-12'));
  const segment = { series: data.series, rows: data.stations[0].rows };
  const points = history.seriesPoints([segment, segment], data.series[0].key);
  assert.equal(points.x.length, 1);
  const copy = { ...segment, rows: [...segment.rows, { time: '2026-09-12T00:30:00Z', measured: null, values: [null, null] }] };
  assert.equal(history.seriesPoints([copy], data.series[0].key).y[1], null);
});
