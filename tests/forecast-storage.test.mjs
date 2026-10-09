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
  let daily = { name: 'daily.csv', id: 'daily-1', updated_at: 'v1', metadata: { size: 100, eTag: '1' } };
  const monthly = [
    { name: '2026-09.csv', id: 'month-9', updated_at: 'v1', metadata: { eTag: '9' } },
    { name: '2026-10.csv', id: 'month-10', updated_at: 'v1', metadata: { eTag: '10' } },
  ];
  const downloads = [];
  const storage = {
    list: async path => ({ data: path.endsWith('/monthly') ? monthly : daily ? [daily] : [], error: null }),
    download: async (path, options, parameters) => {
      downloads.push(path);
      assert.ok(options.cacheNonce);
      assert.equal(parameters.cache, 'no-store');
      const content = path.endsWith('daily.csv') ? csv('2026-10-09', daily.updated_at === 'v1' ? 1 : 9) :
        path.endsWith('2026-09.csv') ? csv('2026-09-12', 2) : csv('2026-10-01', 3);
      return { data: new Blob([content]), error: null };
    },
  };
  const source = compile('src/lib/forecastSource.ts', name => {
    if (name === 'node:crypto') return crypto;
    if (name === './forecastCsv') return parser;
    if (name === './forecastStationCatalog') return { knownForecastStation: station => station === 'CHZ' };
    if (name === '@supabase/supabase-js') return { createClient: () => ({ storage: { from: bucket => {
      assert.equal(bucket, 'forecast-data'); return storage;
    } } }) };
    throw Error(name);
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SECRET_KEY: 'test-secret' } } });
  return {
    source,
    downloads,
    updateDaily: () => { daily = { ...daily, updated_at: 'v2', metadata: { eTag: '2' } }; },
    removeDaily: () => { daily = null; },
  };
}

test('daily station snapshots use the stable path and invalidate overwritten versions', async () => {
  const mock = mockSource();
  const first = await mock.source.loadStationForecast('CHZ', 'today', '2026-10-09', '2026-10-09');
  await mock.source.loadStationForecast('CHZ', 'today', '2026-10-09', '2026-10-09');
  assert.deepEqual(mock.downloads, ['forecast/stations/CHZ/daily.csv']);
  assert.equal(first[0].data.stations[0].rows[0].values[0], 1);
  mock.updateDaily();
  const second = await mock.source.loadStationForecast('CHZ', 'today', '2026-10-09', '2026-10-09');
  assert.equal(second[0].data.stations[0].rows[0].values[0], 9);
  assert.equal(mock.downloads.length, 2);
});

test('historical ranges download only overlapping monthly files for one station', async () => {
  const mock = mockSource();
  const snapshots = await mock.source.loadStationForecast('CHZ', 'history', '2026-09-30', '2026-10-01');
  assert.deepEqual(Array.from(snapshots, snapshot => snapshot.file.period), ['2026-09', '2026-10']);
  assert.deepEqual(mock.downloads, [
    'forecast/stations/CHZ/monthly/2026-09.csv',
    'forecast/stations/CHZ/monthly/2026-10.csv',
  ]);
  assert.deepEqual(Array.from(mock.source.monthsInRange('2026-08-31', '2026-10-01')), ['2026-08', '2026-09', '2026-10']);
});

test('missing and unknown station files fail without an all-stations fallback', async () => {
  const mock = mockSource();
  mock.removeDaily();
  await assert.rejects(mock.source.loadStationForecast('CHZ', 'today', '2026-10-09', '2026-10-09'), error => error.status === 404);
  await assert.rejects(mock.source.loadStationForecast('BAD', 'today', '2026-10-09', '2026-10-09'), error => error.code === 'station_not_found');
});

test('station range filtering keeps only selected UTC days', async () => {
  const mock = mockSource();
  const snapshots = await mock.source.loadStationForecast('CHZ', 'history', '2026-09-12', '2026-09-12');
  const detail = mock.source.stationDetail(snapshots[0], '2026-09-12', '2026-09-12');
  assert.equal(detail.station.id, 'CHZ');
  assert.equal(detail.station.rows.length, 1);
  assert.equal(mock.source.stationDetail(snapshots[0], '2026-09-13', '2026-09-13'), null);
});

test('historical files retain series identity, observations and gaps without dense null matrices', () => {
  const detail = day => { const data = parser.parseForecastCsv(csv(day)); return { ...data, station: data.stations[0] }; };
  const combined = history.combineStationDays([detail('2026-09-14'), detail('2026-09-12')]);
  assert.equal(combined.series.length, 2);
  assert.equal(combined.segments.length, 2);
  assert.equal(combined.station.rows.length, 0);
  const values = history.seriesPoints(combined.segments, combined.series[0].key);
  assert.deepEqual(Array.from(values.y), [1, null, 1]);
  assert.deepEqual(Array.from(history.seriesPoints(combined.segments).y), [0, null, 0]);
  assert.equal(values.x[0], '2026-09-12T00:15:00');
  assert.equal(values.x.at(-1), '2026-09-14T00:15:00');
});

test('overlapping endpoints merge once and Actual GHI hover gaps remain safe', () => {
  const data = parser.parseForecastCsv(csv('2026-09-12'));
  const segment = { series: data.series, rows: data.stations[0].rows };
  const points = history.seriesPoints([segment, segment], data.series[0].key);
  assert.equal(points.x.length, 1);
  const copy = { ...segment, rows: [...segment.rows, { time: '2026-09-12T00:30:00Z', measured: null, values: [null, null] }] };
  const actual = history.observationHoverPoints([copy]);
  assert.deepEqual(Array.from(actual.line.y), [0, null]);
  assert.deepEqual(Array.from(actual.anchors.x), ['2026-09-12T00:30:00']);
  assert.deepEqual(Array.from(actual.anchors.y), [0]);
});

test('Actual GHI hover uses the native green line trace', () => {
  const source = fs.readFileSync('src/components/ForecastChart.tsx', 'utf8');
  assert.match(source, /\.\.\.actual\.line, hovertemplate: "Actual GHI:/);
  assert.match(source, /line: \{ color: "#16a34a", width: 3\.2 \}/);
  assert.doesNotMatch(source, /<span style=.*Actual GHI/);
});
