import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(file) {
  const context = { exports: {}, require: name => { throw Error(`Unexpected dependency: ${name}`); } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context);
  return context.exports;
}

const dashboard = compile('src/lib/customDashboard.ts');
const station = { id: 'CHZ', name: 'Cham', latitude: 47.18, longitude: 8.46 };

test('custom dashboard starts with four 2x2 slots and pins live widget configurations once', () => {
  const initial = dashboard.defaultCustomDashboard();
  assert.equal(initial.boxes.length, 4);
  assert.ok(initial.boxes.every(box => box.width === 1 && box.size === 'standard'));
  const widget = dashboard.createGhiWidget(station, 'icon_ch1', 'today', '2026-11-12', '2026-11-12');
  const pinned = dashboard.pinDashboardWidget(initial, widget);
  assert.equal(pinned.widgets.length, 1);
  assert.equal(pinned.boxes[0].widgetId, widget.id);
  assert.equal(dashboard.pinDashboardWidget(pinned, widget), pinned);
});

test('widget assignment is unique and removing a pin clears its box', () => {
  const first = dashboard.createBalanceWidget('today', '2026-11-12', '2026-11-12');
  const second = dashboard.imbalanceHtmlWidget;
  let state = dashboard.pinDashboardWidget(dashboard.pinDashboardWidget(dashboard.defaultCustomDashboard(), first), second);
  state = dashboard.assignDashboardWidget(state, state.boxes[2].id, first.id);
  assert.equal(state.boxes.filter(box => box.widgetId === first.id).length, 1);
  state = dashboard.removeDashboardWidget(state, first.id);
  assert.equal(state.widgets.some(widget => widget.id === first.id), false);
  assert.equal(state.boxes.some(box => box.widgetId === first.id), false);
});

test('dashboard UI exposes edit-only layout controls and live widget renderers', () => {
  const page = fs.readFileSync('src/app/dashboard/page.tsx', 'utf8');
  const view = fs.readFileSync('src/components/CustomDashboard.tsx', 'utf8');
  const widgets = fs.readFileSync('src/components/DashboardWidgets.tsx', 'utf8');
  assert.match(page, /label: "Dashboard"/);
  assert.match(page, /energy-dashboard-layout:/);
  assert.match(view, /Edit Dashboard/);
  assert.match(view, /Save layout/);
  assert.match(view, /Add box/);
  assert.match(view, /Move earlier/);
  assert.match(view, /Move later/);
  assert.match(widgets, /<ForecastChart/);
  assert.match(widgets, /<ControlAreaBalanceChart/);
  assert.match(widgets, /<ImbalanceForecastFrame/);
});
