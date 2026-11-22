import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const context = { exports: {}, require: name => {
  if (name.startsWith('react')) return require(name);
  if (name === '@/lib/fogClient') return { fetchFogForecast: () => Promise.reject(Error('not called during render')) };
  if (name === '@/lib/fogCsv') return { fogRecordsAtTime: () => [] };
  if (name === '@/lib/fogGrid') return {
    distanceToGridEdgeKm: () => 0, fogGridComponents: () => [], fogGridKey: () => 'grid', gridDistanceKm: () => 0, uniqueFogGridPoints: () => [],
  };
  if (name.endsWith('.module.css')) return { default: {} };
  throw Error(`Unexpected dependency: ${name}`);
} };

vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/FogMap.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context);

test('Fog map renders runtime, level and time controls over the Switzerland base map', () => {
  const html = renderToStaticMarkup(React.createElement(context.exports.default, { resolution: '15min' }));
  assert.match(html, /Switzerland fog map/);
  assert.match(html, /postal-code boundaries/);
  assert.match(html, /Zoom map in/);
  assert.match(html, /Forecast runtime/);
  assert.match(html, /Vertical model level/);
  assert.match(html, /Forecast valid time UTC/);
  assert.match(html, /15-minute interpolation/);
});

test('Fog map Beta follows GHI map in dashboard navigation and renders locally', () => {
  const source = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');
  const betaIndex = source.indexOf('"switzerland-beta":');
  const fogIndex = source.indexOf('"fog-map":');
  assert.ok(betaIndex >= 0 && fogIndex > betaIndex);
  assert.match(source, /label: "GHI map"/);
  assert.match(source, /label: "Fog map – Beta"/);
  assert.match(source, /activeView === "fog-map" && <FogMap resolution={ghiResolution} \/>/);
});

test('Fog map includes all confirmed runtime choices and detailed hover fields', () => {
  const source = fs.readFileSync('src/components/FogMap.tsx', 'utf8');
  for (const label of ['Day-Ahead 0 UTC', 'Intraday 0 UTC', 'Intraday 6 UTC']) assert.match(source, new RegExp(label));
  for (const label of ['Fog probability', 'PLZ', 'Grid point', 'Grid elevation', 'Model level', 'Level height']) assert.match(source, new RegExp(label));
  assert.match(source, /switzerland-postcode-boundaries\.geojson/);
});

test('Fog coloring follows grid topology, clips isolated points to PLZ and only hovers actual points', () => {
  const source = fs.readFileSync('src/components/FogMap.tsx', 'utf8');
  assert.match(source, /const components = useMemo\(\(\) => fogGridComponents\(gridPoints\)/);
  assert.match(source, /components\.filter\(component => !component\.isolated\)/);
  assert.match(source, /components\.filter\(component => component\.isolated\)/);
  assert.match(source, /projection\.geometryPath\(feature\.geometry\)/);
  assert.match(source, /onPointerEnter=\{event => showGridHover\(event, record\)\}/);
  assert.match(source, /hover\.nearest\.fogProbability/);
  assert.doesNotMatch(source, /nearestRecord\(/);
  assert.doesNotMatch(source, /r="8" fill="transparent"/);
  assert.match(source, /writingMode: "vertical-lr", direction: "ltr"/);
});

test('postcode endpoint returns official polygon geometry for isolated-grid clipping', () => {
  const source = fs.readFileSync('src/app/api/postcode/route.ts', 'utf8');
  assert.match(source, /returnGeometry: "true"/);
  assert.match(source, /geometryFormat: "geojson"/);
  assert.match(source, /feature\?\.properties \?\? feature\?\.attributes/);
  assert.match(source, /geometry: feature\?\.geometry \?\? null/);
});

test('time slider shows the selected UTC timestamp at the thumb position', () => {
  const source = fs.readFileSync('src/components/FogMap.tsx', 'utf8');
  assert.match(source, /const timeSliderPosition = times\.length > 1 \? selectedIndex \/ \(times\.length - 1\) \* 100 : 0/);
  assert.match(source, /aria-label="Selected forecast time"/);
  assert.match(source, /style=\{\{ left: `\$\{timeSliderPosition\}%`, transform: timeSliderTransform \}\}/);
  assert.match(source, /\{formatTime\(selectedTime\)\}<\/output>/);
});
