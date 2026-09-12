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
  if (name === './StationPlots') return { default: () => null };
  if (name === '@/lib/forecastClient') return {};
  throw Error(`Unexpected dependency: ${name}`);
} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/SwitzerlandBeta.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText, context);

for (const mode of ['today', 'history']) test(`${mode} controls and map render before any storage data arrives`, () => {
  const html = renderToStaticMarkup(React.createElement(context.exports.default, { mode, onModeChange: () => {} }));
  assert.match(html, /Forecast period/);
  assert.match(html, /Auto-update: every minute/);
  assert.match(html, /Map of Switzerland with canton boundaries/);
  assert.match(html, /Checking uploaded forecasts/);
  if (mode === 'history') {
    assert.match(html, /From \(UTC day\)/);
    assert.match(html, /To \(UTC day\)/);
    assert.match(html, /Show range/);
  }
});
