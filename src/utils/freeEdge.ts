import type { LevelObject, Vec3 } from '../types';

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

function collectOtherVerts(obj: LevelObject, allObjects: LevelObject[]): Vec3[] {
  const verts: Vec3[] = [];
  const connectionTypes = new Set(['polygon', 'road', 'plane', 'ramp']);
  for (const other of allObjects) {
    if (other.id === obj.id) continue;
    if (!connectionTypes.has(other.type)) continue;
    const owv = worldVerts(other);
    verts.push(...owv);
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

function isEdgeBlocked(a: Vec3, b: Vec3, otherVerts: Vec3[]): boolean {
  for (const v of otherVerts) {
    if (pointToSegDist(v.x, v.z, a.x, a.z, b.x, b.z) < NEAR_THRESHOLD) return true;
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
  const otherVerts = collectOtherVerts(obj, allObjects);

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

    if (isEdgeBlocked(a, b, otherVerts)) continue;

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
