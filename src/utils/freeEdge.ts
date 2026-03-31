import type { LevelObject, Vec3 } from '../types';
import { computeRoadSidePoints } from '../three/primitiveGeometry';
import { OBJECT_DEFAULTS } from '../constants';

export interface Footprint {
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
}

export interface FreeEdge {
  label: 'north' | 'south' | 'east' | 'west';
  edgeFrom: Vec3;
  edgeTo: Vec3;
  midpoint: Vec3;
  normal: { x: number; z: number };
  length: number;
}

const SURFACE_TYPES = new Set(['polygon', 'road', 'plane', 'ramp']);

function r(n: number): number { return Math.round(n * 100) / 100; }

export function worldVerts(obj: LevelObject): Vec3[] {
  if (!obj.vertices || obj.vertices.length === 0) return [];
  const ox = obj.position.x, oy = obj.position.y, oz = obj.position.z;
  return obj.vertices.map((v) => ({ x: r(v.x + ox), y: r((v.y ?? 0) + oy), z: r(v.z + oz) }));
}

export function computeFootprint(obj: LevelObject): Footprint | null {
  if (!SURFACE_TYPES.has(obj.type)) return null;

  if (obj.vertices && obj.vertices.length >= 2) {
    const ox = obj.position.x, oz = obj.position.z, oy = obj.position.y;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const v of obj.vertices) {
      minX = Math.min(minX, v.x + ox);
      maxX = Math.max(maxX, v.x + ox);
      minZ = Math.min(minZ, v.z + oz);
      maxZ = Math.max(maxZ, v.z + oz);
    }
    if (obj.type === 'road' && obj.roadWidth) {
      const hw = obj.roadWidth / 2;
      minX -= hw; maxX += hw; minZ -= hw; maxZ += hw;
    }
    if (obj.type === 'ramp' && obj.rampWidth) {
      const hw = obj.rampWidth / 2;
      minX -= hw; maxX += hw; minZ -= hw; maxZ += hw;
    }
    return { name: obj.name, minX: r(minX), maxX: r(maxX), minZ: r(minZ), maxZ: r(maxZ), y: r(oy) };
  }

  if (obj.type === 'plane') {
    const hs = 2 * obj.scale.x;
    const hd = 2 * obj.scale.z;
    return {
      name: obj.name,
      minX: r(obj.position.x - hs), maxX: r(obj.position.x + hs),
      minZ: r(obj.position.z - hd), maxZ: r(obj.position.z + hd),
      y: r(obj.position.y),
    };
  }
  return null;
}

const LINEAR_TYPES = new Set(['road', 'wall', 'ramp', 'cliff', 'trim']);
const NEAR_THRESHOLD = 1.5;

function dist2D(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function pointToSegDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (pz - (az + t * dz)) ** 2);
}

function pointInPoly2D(px: number, pz: number, verts: Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, zi = verts[i].z;
    const xj = verts[j].x, zj = verts[j].z;
    if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function pointNearPolyline(px: number, pz: number, chain: Vec3[], threshold: number): boolean {
  for (let i = 0; i < chain.length - 1; i++) {
    if (pointToSegDist(px, pz, chain[i].x, chain[i].z, chain[i + 1].x, chain[i + 1].z) < threshold) return true;
  }
  return false;
}

export function isEdgeCovered(a: Vec3, b: Vec3, srcObj: LevelObject, allObjects: LevelObject[]): boolean {
  const SAMPLES = 5;
  const connectionTypes = new Set(['polygon', 'road', 'plane', 'ramp']);

  for (const other of allObjects) {
    if (other.id === srcObj.id) continue;
    if (!connectionTypes.has(other.type)) continue;

    let hitCount = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const t = (s + 1) / (SAMPLES + 1);
      const px = a.x + (b.x - a.x) * t;
      const pz = a.z + (b.z - a.z) * t;

      if (other.type === 'polygon' && other.vertices && other.vertices.length >= 3) {
        const wv = worldVerts(other);
        if (pointInPoly2D(px, pz, wv)) hitCount++;
        else if (nearPolyBoundary(px, pz, wv)) hitCount++;
      } else if (other.type === 'road' && other.vertices && other.vertices.length >= 2) {
        const wv = worldVerts(other);
        const halfW = (other.roadWidth ?? OBJECT_DEFAULTS.roadWidth) / 2;
        if (pointNearPolyline(px, pz, wv, halfW + NEAR_THRESHOLD)) hitCount++;
      } else if (other.type === 'plane') {
        const fp = computeFootprint(other);
        if (fp && px >= fp.minX - NEAR_THRESHOLD && px <= fp.maxX + NEAR_THRESHOLD &&
                  pz >= fp.minZ - NEAR_THRESHOLD && pz <= fp.maxZ + NEAR_THRESHOLD) hitCount++;
      } else if (other.type === 'ramp' && other.vertices && other.vertices.length >= 2) {
        const wv = worldVerts(other);
        const halfW = (other.rampWidth ?? 2) / 2;
        if (pointNearPolyline(px, pz, wv, halfW + NEAR_THRESHOLD)) hitCount++;
      }
    }
    if (hitCount >= Math.ceil(SAMPLES / 2)) return true;
  }
  return false;
}

function nearPolyBoundary(px: number, pz: number, wv: Vec3[]): boolean {
  for (let i = 0; i < wv.length; i++) {
    const a = wv[i], b = wv[(i + 1) % wv.length];
    if (pointToSegDist(px, pz, a.x, a.z, b.x, b.z) < NEAR_THRESHOLD) return true;
  }
  return false;
}

export function computeFreeEdges(obj: LevelObject, allObjects: LevelObject[]): FreeEdge[] {
  const wv = worldVerts(obj);

  if (obj.type === 'plane' && wv.length < 3) {
    const fp = computeFootprint(obj);
    if (!fp) return [];
    const y = obj.position.y;
    const corners: Vec3[] = [
      { x: fp.minX, y, z: fp.minZ },
      { x: fp.maxX, y, z: fp.minZ },
      { x: fp.maxX, y, z: fp.maxZ },
      { x: fp.minX, y, z: fp.maxZ },
    ];
    return computeFreeEdgesFromVerts(corners, y, obj, allObjects);
  }

  if (LINEAR_TYPES.has(obj.type) && wv.length >= 2) {
    return computeFreeEdgesForLinear(wv, obj, allObjects);
  }

  if (wv.length < 3) return [];
  return computeFreeEdgesFromVerts(wv, wv[0].y, obj, allObjects);
}

function collectOtherVerts(obj: LevelObject, allObjects: LevelObject[]): Vec3[] {
  const verts: Vec3[] = [];
  const connectionTypes = new Set(['polygon', 'road', 'plane', 'ramp']);
  for (const other of allObjects) {
    if (other.id === obj.id) continue;
    if (!connectionTypes.has(other.type)) continue;
    const owv = worldVerts(other);
    verts.push(...owv);
    if (other.type === 'road' && other.vertices && other.vertices.length >= 2) {
      const width = other.roadWidth ?? OBJECT_DEFAULTS.roadWidth;
      const [left, right] = computeRoadSidePoints(owv, width);
      verts.push(...left, ...right);
    }
    if (other.type === 'plane' && owv.length === 0) {
      const fp = computeFootprint(other);
      if (fp) {
        const y = other.position.y;
        verts.push(
          { x: fp.minX, y, z: fp.minZ }, { x: fp.maxX, y, z: fp.minZ },
          { x: fp.maxX, y, z: fp.maxZ }, { x: fp.minX, y, z: fp.maxZ },
        );
      }
    }
  }
  return verts;
}

function computeFreeEdgesForLinear(
  wv: Vec3[],
  obj: LevelObject,
  allObjects: LevelObject[],
): FreeEdge[] {
  const otherVerts = collectOtherVerts(obj, allObjects);
  const halfW = (obj.roadWidth ?? obj.rampWidth ?? obj.trimThickness ?? 1.5) / 2;
  const edges: FreeEdge[] = [];
  const start = wv[0];
  const end = wv[wv.length - 1];

  const endpoints: { pt: Vec3; toward: Vec3 }[] = [
    { pt: start, toward: wv[1] },
    { pt: end, toward: wv[wv.length - 2] },
  ];

  for (const { pt, toward } of endpoints) {
    const dx = pt.x - toward.x;
    const dz = pt.z - toward.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.01) continue;

    const nx = dx / len;
    const nz = dz / len;

    const hasNearby = otherVerts.some((v) => dist2D(v, pt) < NEAR_THRESHOLD);
    if (hasNearby) continue;

    const perpX = -nz;
    const perpZ = nx;

    let label: FreeEdge['label'];
    if (Math.abs(nx) > Math.abs(nz)) label = nx > 0 ? 'east' : 'west';
    else label = nz > 0 ? 'south' : 'north';

    edges.push({
      label,
      edgeFrom: { x: r(pt.x + perpX * halfW), y: pt.y, z: r(pt.z + perpZ * halfW) },
      edgeTo: { x: r(pt.x - perpX * halfW), y: pt.y, z: r(pt.z - perpZ * halfW) },
      midpoint: { x: r(pt.x), y: pt.y, z: r(pt.z) },
      normal: { x: nx, z: nz },
      length: r(halfW * 2),
    });
  }
  return edges;
}

function computeFreeEdgesFromVerts(
  wv: Vec3[],
  y: number,
  obj: LevelObject,
  allObjects: LevelObject[],
): FreeEdge[] {
  let cx = 0, cz = 0;
  for (const v of wv) { cx += v.x; cz += v.z; }
  cx /= wv.length; cz /= wv.length;

  const edges: FreeEdge[] = [];
  const n = wv.length;

  for (let i = 0; i < n; i++) {
    const a = wv[i], b = wv[(i + 1) % n];
    const mx = r((a.x + b.x) / 2), mz = r((a.z + b.z) / 2);

    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.5) continue;

    if (isEdgeCovered(a, b, obj, allObjects)) continue;

    let nx = -dz / len, nz = dx / len;
    const toCenterX = cx - mx, toCenterZ = cz - mz;
    if (nx * toCenterX + nz * toCenterZ > 0) { nx = -nx; nz = -nz; }

    let label: FreeEdge['label'];
    if (Math.abs(nx) > Math.abs(nz)) label = nx > 0 ? 'east' : 'west';
    else label = nz > 0 ? 'south' : 'north';

    edges.push({
      label,
      edgeFrom: { x: r(a.x), y, z: r(a.z) },
      edgeTo: { x: r(b.x), y, z: r(b.z) },
      midpoint: { x: mx, y, z: mz },
      normal: { x: nx, z: nz },
      length: r(len),
    });
  }
  return edges;
}

export function isFootprintOverlapping(
  minX: number, maxX: number, minZ: number, maxZ: number,
  allObjects: LevelObject[], excludeId?: string,
): boolean {
  for (const obj of allObjects) {
    if (excludeId && obj.id === excludeId) continue;
    const fp = computeFootprint(obj);
    if (!fp) continue;
    if (minX < fp.maxX && maxX > fp.minX && minZ < fp.maxZ && maxZ > fp.minZ) return true;
  }
  return false;
}
