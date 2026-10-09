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
  if (name.endsWith('.module.css')) return { default: {} };
  throw Error(`Unexpected dependency: ${name}`);
} };

vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/FogMap.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context);

test('Fog map renders the reusable Switzerland base map without forecast controls', () => {
  const html = renderToStaticMarkup(React.createElement(context.exports.default));
  assert.match(html, /Switzerland fog map/);
  assert.match(html, /Map of Switzerland with canton boundaries/);
  assert.match(html, /Zoom map in/);
  assert.match(html, /26 cantons/);
  assert.doesNotMatch(html, /GHI weather stations|Select a station|Forecast period/);
});

test('Fog map follows Switzerland map Beta in dashboard navigation and renders locally', () => {
  const source = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');
  const betaIndex = source.indexOf('"switzerland-beta":');
  const fogIndex = source.indexOf('"fog-map":');
  assert.ok(betaIndex >= 0 && fogIndex > betaIndex);
  assert.match(source, /label: "Fog map"/);
  assert.match(source, /activeView === "fog-map" && <FogMap \/>/);
  assert.match(source, /dashboardId === "fog-map"/);
});
