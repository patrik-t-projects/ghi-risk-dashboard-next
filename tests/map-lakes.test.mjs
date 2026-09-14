import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lakes = JSON.parse(fs.readFileSync('public/maps/switzerland-lakes.geojson', 'utf8'));
const feature = lakes.features[0];
const polygons = feature.geometry.coordinates;

const insideRing = ([x, y], ring) => {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x1, y1] = ring[previous];
    const [x2, y2] = ring[index];
    if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
};

const insideLake = point => polygons.some(([outer, ...holes]) =>
  insideRing(point, outer) && !holes.some(hole => insideRing(point, hole)));

test('map uses a lightweight official selection of major lakes', () => {
  assert.match(lakes.source, /swisstopo.*swissTLMRegio 2025/i);
  assert.deepEqual(lakes.selection, { country: 'Switzerland', minimumAreaKm2: 3, borderLakes: 'complete outlines' });
  assert.equal(feature.geometry.type, 'MultiPolygon');
  assert.equal(feature.properties.featureCount, 31);
  assert.equal(polygons.length, 31);
  assert.ok(fs.statSync('public/maps/switzerland-lakes.geojson').size < 300_000);
});

test('selection includes Zugersee and complete cross-border lakes', () => {
  assert.ok(insideLake([8.49, 47.12]), 'Zugersee is missing');
  const points = polygons.flat(2);
  const { west, south, east, north } = points.reduce((bounds, [longitude, latitude]) => ({
    west: Math.min(bounds.west, longitude),
    south: Math.min(bounds.south, latitude),
    east: Math.max(bounds.east, longitude),
    north: Math.max(bounds.north, latitude),
  }), { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity });
  assert.ok(west < 6.2, 'full Lake Geneva area is missing');
  assert.ok(south < 45.75, 'full Lake Maggiore area is missing');
  assert.ok(east > 9.7 && north > 47.8, 'full Lake Constance area is missing');
});
