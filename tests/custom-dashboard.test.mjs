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
  assert.equal(initial.version, 2);
  assert.equal(initial.boxes.length, 4);
  assert.ok(initial.boxes.every(box => box.width > 0 && box.height >= dashboard.MIN_DASHBOARD_BOX_HEIGHT));
  for (let index = 0; index < initial.boxes.length; index++) {
    for (let other = index + 1; other < initial.boxes.length; other++) {
      assert.equal(dashboard.boxesOverlap(initial.boxes[index], initial.boxes[other]), false);
    }
  }
  const widget = dashboard.createGhiWidget(station, 'icon_ch1', 'today', '2026-11-12', '2026-11-12');
  const pinned = dashboard.pinDashboardWidget(initial, widget);
  assert.equal(pinned.widgets.length, 1);
  assert.equal(pinned.boxes[0].widgetId, widget.id);
  assert.equal(dashboard.pinDashboardWidget(pinned, widget), pinned);
});

test('free positioning rejects collisions, preserves gaps and swaps positions without resizing', () => {
  const initial = dashboard.defaultCustomDashboard();
  const first = initial.boxes[0];
  const second = initial.boxes[1];
  const blocked = dashboard.updateDashboardBoxLayout(initial, first.id, { ...first, x: second.x, y: second.y });
  assert.equal(blocked, initial);
  const moved = dashboard.updateDashboardBoxLayout(initial, first.id, { ...first, x: 0, y: 1100 });
  assert.equal(moved.boxes[0].y, 1100);
  const swapped = dashboard.swapDashboardBoxPositions(initial, first.id, second.id);
  assert.equal(swapped.boxes[0].x, second.x);
  assert.equal(swapped.boxes[1].x, first.x);
  assert.equal(swapped.boxes[0].width, first.width);
  assert.equal(swapped.boxes[1].height, second.height);
});

test('saved preset layouts migrate to free-position dashboard boxes', () => {
  const legacy = { version: 1, widgets: [], boxes: [
    { id: 'old-1', widgetId: null, width: 1, size: 'compact' },
    { id: 'old-2', widgetId: null, width: 2, size: 'tall' },
  ] };
  const migrated = dashboard.normalizeCustomDashboard(legacy);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.boxes.length, 2);
  assert.equal(migrated.boxes[0].height, 420);
  assert.equal(migrated.boxes[1].width, dashboard.DASHBOARD_CANVAS_WIDTH);
  assert.equal(dashboard.boxesOverlap(migrated.boxes[0], migrated.boxes[1]), false);
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
  assert.match(view, /Drag any free area of a box to move it/);
  assert.match(view, /resizeHandles/);
  assert.match(view, /canPlaceDashboardBox/);
  assert.match(view, /swapDashboardBoxPositions/);
  assert.match(widgets, /<ForecastChart/);
  assert.match(widgets, /<ControlAreaBalanceChart/);
  assert.match(widgets, /<ImbalanceForecastFrame/);
});

test('plot pin controls use one icon button label and stay beside their plots', () => {
  const button = fs.readFileSync('src/components/PinPlotButton.tsx', 'utf8');
  const forecast = fs.readFileSync('src/components/ForecastChart.tsx', 'utf8');
  const balance = fs.readFileSync('src/components/ControlAreaBalance.tsx', 'utf8');
  assert.match(button, /<svg/);
  assert.match(button, /Pin plot to dashboard/);
  assert.match(forecast, /<PinPlotButton/);
  assert.match(balance, /<PinPlotButton/);
  assert.doesNotMatch(forecast, /Pin to Dashboard/);
  assert.doesNotMatch(balance, />Pin plot</);
});
