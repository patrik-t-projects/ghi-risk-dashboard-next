import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/fogGrid.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, context);

const point = (id, latitude, longitude, probability = 0.5) => ({
  locationId: id, locationLatitude: latitude, locationLongitude: longitude,
  gridLatitude: latitude, gridLongitude: longitude, gridDistanceKm: 0,
  modelLevel: 80, heightAslM: 500, surfaceHeightAslM: 450, heightAglM: 50, fogProbability: probability,
});

test('grid topology deduplicates model points and distinguishes adjacent from isolated points', () => {
  const first = point('A', 47, 8);
  const duplicate = point('B', 47, 8);
  const neighbor = point('C', 47, 8.026);
  const isolated = point('D', 47, 8.09);
  const unique = context.exports.uniqueFogGridPoints([first, duplicate, neighbor, isolated]);
  assert.equal(unique.length, 3);
  const components = context.exports.fogGridComponents([first, duplicate, neighbor, isolated]);
  assert.equal(components.length, 2);
  assert.equal(components[0].points.length, 2);
  assert.equal(components[0].edges.length, 1);
  assert.equal(components[0].isolated, false);
  assert.equal(components[1].points.length, 1);
  assert.equal(components[1].isolated, true);
  assert.ok(context.exports.gridDistanceKm(first, neighbor) > 1.8);
  assert.ok(context.exports.gridDistanceKm(first, neighbor) < context.exports.ICON2_NEIGHBOR_MAX_KM);
});

test('connected-field mask measures distance from the actual neighbor edge', () => {
  const first = point('A', 47, 8);
  const neighbor = point('B', 47, 8.026);
  const middleDistance = context.exports.distanceToGridEdgeKm(47, 8.013, [first, neighbor]);
  const outsideDistance = context.exports.distanceToGridEdgeKm(47.02, 8.013, [first, neighbor]);
  assert.ok(middleDistance < 0.01);
  assert.ok(outsideDistance > 2);
});
