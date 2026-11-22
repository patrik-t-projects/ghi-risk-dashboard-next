import type { FogDisplayRecord } from "./fogCsv";

export const ICON2_NEIGHBOR_MAX_KM = 2.75;

export type FogGridEdge = [FogDisplayRecord, FogDisplayRecord];
export type FogGridComponent = { points: FogDisplayRecord[]; edges: FogGridEdge[]; isolated: boolean };

export const fogGridKey = (record: Pick<FogDisplayRecord, "gridLatitude" | "gridLongitude">) =>
  `${record.gridLatitude.toFixed(5)},${record.gridLongitude.toFixed(5)}`;

export function gridDistanceKm(a: Pick<FogDisplayRecord, "gridLatitude" | "gridLongitude">,
  b: Pick<FogDisplayRecord, "gridLatitude" | "gridLongitude">): number {
  const radians = Math.PI / 180;
  const latitude1 = a.gridLatitude * radians; const latitude2 = b.gridLatitude * radians;
  const deltaLatitude = (b.gridLatitude - a.gridLatitude) * radians;
  const deltaLongitude = (b.gridLongitude - a.gridLongitude) * radians;
  const haversine = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

/** Several configured locations may resolve to the same ICON grid point. The
 * map represents the model grid, so such rows must only create one point. */
export function uniqueFogGridPoints(records: FogDisplayRecord[]): FogDisplayRecord[] {
  return [...new Map(records.map(record => [fogGridKey(record), record])).values()];
}

export function fogGridComponents(records: FogDisplayRecord[], neighborMaxKm = ICON2_NEIGHBOR_MAX_KM): FogGridComponent[] {
  const points = uniqueFogGridPoints(records);
  const adjacency = points.map(() => new Set<number>());
  const allEdges: [number, number][] = [];
  for (let left = 0; left < points.length; left++) for (let right = left + 1; right < points.length; right++) {
    const distance = gridDistanceKm(points[left], points[right]);
    if (distance > neighborMaxKm) continue;
    adjacency[left].add(right); adjacency[right].add(left); allEdges.push([left, right]);
  }
  const visited = new Set<number>(); const components: FogGridComponent[] = [];
  for (let start = 0; start < points.length; start++) {
    if (visited.has(start)) continue;
    const indexes: number[] = []; const queue = [start]; visited.add(start);
    while (queue.length) {
      const current = queue.shift()!; indexes.push(current);
      for (const neighbor of adjacency[current]) if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
    const indexSet = new Set(indexes);
    const componentPoints = indexes.map(index => points[index]);
    const edges = allEdges.filter(([left, right]) => indexSet.has(left) && indexSet.has(right))
      .map(([left, right]) => [points[left], points[right]] as FogGridEdge);
    components.push({ points: componentPoints, edges, isolated: componentPoints.length === 1 });
  }
  return components;
}

export function distanceToGridEdgeKm(latitude: number, longitude: number, edge: FogGridEdge): number {
  const meanLatitude = (edge[0].gridLatitude + edge[1].gridLatitude + latitude) / 3;
  const longitudeScale = 111.32 * Math.cos(meanLatitude * Math.PI / 180); const latitudeScale = 110.574;
  const pointX = longitude * longitudeScale; const pointY = latitude * latitudeScale;
  const startX = edge[0].gridLongitude * longitudeScale; const startY = edge[0].gridLatitude * latitudeScale;
  const endX = edge[1].gridLongitude * longitudeScale; const endY = edge[1].gridLatitude * latitudeScale;
  const dx = endX - startX; const dy = endY - startY;
  const fraction = dx || dy ? Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(pointX - (startX + fraction * dx), pointY - (startY + fraction * dy));
}
