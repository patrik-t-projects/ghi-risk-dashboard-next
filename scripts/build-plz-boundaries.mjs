import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
const target = process.argv[3] ?? "public/maps/switzerland-postcode-boundaries.geojson";
if (!source) throw new Error("Usage: node scripts/build-plz-boundaries.mjs <AMTOVZ_ZIP.shp> [output.geojson]");

const data = fs.readFileSync(source);
const tolerance = 0.00045;

function lv95ToWgs84(easting, northing) {
  const y = (easting - 2600000) / 1000000;
  const x = (northing - 1200000) / 1000000;
  const longitude = (2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3) * 100 / 36;
  const latitude = (16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3) * 100 / 36;
  return [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))];
}

function sqSegmentDistance(point, start, end) {
  let x = start[0]; let y = start[1];
  let dx = end[0] - x; let dy = end[1] - y;
  if (dx || dy) {
    const t = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = end[0]; y = end[1]; }
    else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = point[0] - x; dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplify(points) {
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length); keep[0] = 1; keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(); let max = 0; let index = -1;
    for (let i = first + 1; i < last; i++) {
      const distance = sqSegmentDistance(points[i], points[first], points[last]);
      if (distance > max) { max = distance; index = i; }
    }
    if (max > tolerance * tolerance && index > 0) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  return points.filter((_, index) => keep[index]);
}

const lines = [];
let offset = 100;
while (offset + 8 <= data.length) {
  const contentBytes = data.readInt32BE(offset + 4) * 2;
  const start = offset + 8;
  const shapeType = data.readInt32LE(start);
  if (shapeType === 5 || shapeType === 15 || shapeType === 25) {
    const numberOfParts = data.readInt32LE(start + 36);
    const numberOfPoints = data.readInt32LE(start + 40);
    const partsOffset = start + 44;
    const pointsOffset = partsOffset + numberOfParts * 4;
    const parts = Array.from({ length: numberOfParts }, (_, index) => data.readInt32LE(partsOffset + index * 4));
    for (let part = 0; part < numberOfParts; part++) {
      const first = parts[part]; const last = part + 1 < parts.length ? parts[part + 1] : numberOfPoints;
      const points = [];
      for (let point = first; point < last; point++) {
        const coordinateOffset = pointsOffset + point * 16;
        points.push(lv95ToWgs84(data.readDoubleLE(coordinateOffset), data.readDoubleLE(coordinateOffset + 8)));
      }
      if (points.length >= 2) lines.push(simplify(points));
    }
  }
  offset = start + contentBytes;
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({
  type: "Feature",
  properties: { source: "swisstopo AMTOVZ ZIP", updated: "2026-11-01", selection: "postal-code boundaries" },
  geometry: { type: "MultiLineString", coordinates: lines },
}));
console.log(`Wrote ${lines.length} boundary rings to ${target}`);
