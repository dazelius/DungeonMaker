import { v4 as uuid } from 'uuid';
import type { LevelObject, Vec3 } from '../types';
import { OBJECT_DEFAULTS } from '../constants';
import { nextPrimitiveName } from '../utils/naming';

const SNAP = 0.05;
const DIST_THRESHOLD = 0.5;
const OVERLAP_MIN = 0.1;

interface Edge {
  a: Vec3;
  b: Vec3;
  polyIdx: number;
}

function roundCoord(v: number): number {
  return Math.round(v / SNAP) * SNAP;
}

function edgeKey(a: Vec3, b: Vec3): string {
  const ax = roundCoord(a.x), az = roundCoord(a.z);
  const bx = roundCoord(b.x), bz = roundCoord(b.z);
  if (ax < bx || (ax === bx && az < bz)) return `${ax},${az}|${bx},${bz}`;
  return `${bx},${bz}|${ax},${az}`;
}

function edgesInterfere(ea: Edge, eb: Edge): boolean {
  if (ea.polyIdx === eb.polyIdx) return false;

  const dx = ea.b.x - ea.a.x, dz = ea.b.z - ea.a.z;
  const lenA = Math.sqrt(dx * dx + dz * dz);
  if (lenA < 0.001) return false;

  const nx = dx / lenA, nz = dz / lenA;
  const px = -nz, pz = nx;

  const distB1 = Math.abs((eb.a.x - ea.a.x) * px + (eb.a.z - ea.a.z) * pz);
  const distB2 = Math.abs((eb.b.x - ea.a.x) * px + (eb.b.z - ea.a.z) * pz);
  if (distB1 > DIST_THRESHOLD || distB2 > DIST_THRESHOLD) return false;

  const projA2 = lenA;
  const projB1 = (eb.a.x - ea.a.x) * nx + (eb.a.z - ea.a.z) * nz;
  const projB2 = (eb.b.x - ea.a.x) * nx + (eb.b.z - ea.a.z) * nz;

  const minB = Math.min(projB1, projB2);
  const maxB = Math.max(projB1, projB2);
  const overlapStart = Math.max(0, minB);
  const overlapEnd = Math.min(projA2, maxB);

  return overlapEnd - overlapStart > OVERLAP_MIN;
}

export function generateOuterWalls(polygons: LevelObject[]): LevelObject[] {
  const edges: Edge[] = [];
  const exactCounts = new Map<string, number>();

  for (let pi = 0; pi < polygons.length; pi++) {
    const poly = polygons[pi];
    if (poly.type !== 'polygon' || !poly.vertices || poly.vertices.length < 3) continue;
    const verts = poly.vertices;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      edges.push({ a, b, polyIdx: pi });

      const key = edgeKey(a, b);
      exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
    }
  }

  const sharedByExact = new Set<number>();
  for (let i = 0; i < edges.length; i++) {
    const key = edgeKey(edges[i].a, edges[i].b);
    if ((exactCounts.get(key) ?? 0) > 1) sharedByExact.add(i);
  }

  const sharedByProximity = new Set<number>();
  for (let i = 0; i < edges.length; i++) {
    if (sharedByExact.has(i)) continue;
    for (let j = i + 1; j < edges.length; j++) {
      if (sharedByExact.has(j)) continue;
      if (edgesInterfere(edges[i], edges[j])) {
        sharedByProximity.add(i);
        sharedByProximity.add(j);
      }
    }
  }

  const walls: LevelObject[] = [];
  for (let i = 0; i < edges.length; i++) {
    if (sharedByExact.has(i) || sharedByProximity.has(i)) continue;
    const { a, b } = edges[i];
    walls.push({
      id: uuid(),
      name: nextPrimitiveName('wall'),
      type: 'wall',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.wallColor,
      visible: true,
      vertices: [a, b],
      wallHeight: OBJECT_DEFAULTS.wallHeight,
      wallThickness: OBJECT_DEFAULTS.wallThickness,
    });
  }

  return walls;
}
