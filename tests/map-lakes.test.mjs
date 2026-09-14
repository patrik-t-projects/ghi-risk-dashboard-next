import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lakes = JSON.parse(fs.readFileSync('public/maps/switzerland-lakes.geojson', 'utf8'));
const points = feature => {
  const result = [];
  (function walk(value) {
    if (Array.isArray(value) && typeof value[0] === 'number') result.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
  })(feature.geometry.coordinates);
  return result;
};
const bounds = feature => {
  const coordinates = points(feature);
  return {
    west: Math.min(...coordinates.map(point => point[0])), south: Math.min(...coordinates.map(point => point[1])),
    east: Math.max(...coordinates.map(point => point[0])), north: Math.max(...coordinates.map(point => point[1])),
  };
};

test('map contains the major Swiss lakes and complete cross-border outlines', () => {
  const names = new Set(lakes.features.map(feature => feature.properties.name));
  for (const name of ['constance', 'geneva', 'lucerne', 'lugano', 'maggiore', 'neuchatel', 'zurich']) assert.ok(names.has(name));
  const constance = bounds(lakes.features.find(feature => feature.properties.name === 'constance'));
  const geneva = bounds(lakes.features.find(feature => feature.properties.name === 'geneva'));
  const maggiore = bounds(lakes.features.find(feature => feature.properties.name === 'maggiore'));
  assert.ok(constance.east > 9.7 && constance.north > 47.8);
  assert.ok(geneva.west < 6.2);
  assert.ok(maggiore.south < 45.75);
});
