import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(fs.readFileSync('src/lib/forecastCsv.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = { exports: {} };
vm.runInNewContext(compiled, context);
const { parseForecastCsv, readCsv } = context.exports;
const csv = fs.readFileSync('test_data/icon_ghi_all_stations_2026-09-12.csv', 'utf8');
const data = parseForecastCsv(csv);

test('daily sample: all 135 stations, 4 runs, correct members, 96 quarter-hour endpoints', () => {
  assert.equal(data.stations.length, 135);
  assert.equal(data.series.length, 64);
  assert.equal(new Set(data.series.map(s => `${s.model}:${s.run}`)).size, 4);
  assert.equal(data.series.filter(s => s.model === 'icon_ch1').length, 22);
  assert.equal(data.series.filter(s => s.model === 'icon_ch2').length, 42);
  assert.equal(data.start, '2026-09-12T00:15:00Z');
  assert.equal(data.end, '2026-09-13T00:00:00Z');
  for (const station of data.stations) {
    assert.equal(station.rows.length, 96);
    for (let i = 1; i < station.rows.length; i++) assert.equal(Date.parse(station.rows[i].time) - Date.parse(station.rows[i - 1].time), 900000);
  }
});

test('every populated forecast and observation agrees with the source CSV', () => {
  const [header, ...records] = readCsv(csv);
  const col = Object.fromEntries(header.map((name, index) => [name, index]));
  const seriesIndexes = new Map(data.series.map((s, i) => [s.key, i]));
  const stations = new Map(data.stations.map(s => [s.id, new Map(s.rows.map(r => [r.time, r]))]));
  let zeros = 0; let blanks = 0;
  for (const record of records) {
    const target = stations.get(record[col.station_abbr]).get(record[col.datetime]);
    const [day, month, year, hour] = record[col.Runtime].match(/\d+/g);
    const run = `${year}${month}${day}T${hour.padStart(2, '0')}0000Z`;
    const model = record[col.Model] === 'ICON1' ? 'icon_ch1' : 'icon_ch2';
    for (const member of ['control', ...Array.from({ length: 20 }, (_, i) => `member_${i + 1}`)]) {
      const index = seriesIndexes.get(`${model}_${run}_${member}`);
      const raw = record[col[member]];
      if (index === undefined) { assert.equal(raw, ''); continue; }
      assert.equal(target.values[index], raw === '' ? null : Number(raw));
      if (raw === '') blanks++; else if (Number(raw) === 0) zeros++;
    }
    if (record[col.measured_ghi] !== '') assert.equal(target.measured, Number(record[col.measured_ghi]));
  }
  assert.ok(zeros > 0 && blanks > 0);
});

const header = 'datetime,station_abbr,grid_coordinates,Model,Runtime,measured_ghi,control,member_1';
const first = '2026-09-12T00:15:00Z,CHZ,"47.18,8.46",ICON2,12.09.2026 06 UTC,0,0,1';
const second = '2026-09-12T00:15:00Z,CHZ,"47.19,8.47",ICON1,12.09.2026 12 UTC,0,,2';
test('merges model rows once and deterministically prefers ICON1 coordinates', () => {
  const station = parseForecastCsv([header, first, second].join('\n')).stations[0];
  assert.equal(station.rows.length, 1);
  assert.equal(station.latitude, 47.19);
  assert.equal(station.longitude, 8.47);
  assert.equal(station.rows[0].measured, 0);
  assert.equal(station.rows[0].values[0], null);
  const cham = data.stations.find(s => s.id === 'CHZ');
  assert.equal(cham.latitude, 47.182957);
  assert.equal(cham.longitude, 8.469473);
});

test('rejects duplicates, conflicting observations, malformed coordinates and runtimes', () => {
  assert.throws(() => parseForecastCsv([header, first, first].join('\n')), /Duplicate station/);
  assert.throws(() => parseForecastCsv([header, first, second.replace('UTC,0,', 'UTC,9,')].join('\n')), /Conflicting measured/);
  assert.throws(() => parseForecastCsv([header, first.replace('47.18', '47..18')].join('\n')), /Invalid map/);
  assert.throws(() => parseForecastCsv([header, first.replace('12.09.2026', '31.09.2026')].join('\n')), /Invalid model runtime/);
  assert.throws(() => parseForecastCsv([header, first.replace('ICON2', 'ICON3')].join('\n')), /Unknown model/);
});

test('overview and individual station payloads stay small', () => {
  const overview = data.stations.map(({ id, name, latitude, longitude }) => ({ id, name, latitude, longitude }));
  const size = Buffer.byteLength(JSON.stringify(overview));
  const maximum = Math.max(...data.stations.map(station => Buffer.byteLength(JSON.stringify({ series: data.series, station, start: data.start, end: data.end }))));
  assert.ok(size < 25000);
  assert.ok(maximum < 250000);
  console.log(`Overview: ${size} bytes; largest station payload: ${maximum} bytes`);
});
