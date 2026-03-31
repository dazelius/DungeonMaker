import { v4 as uuid } from 'uuid';
import type { LevelObject, Vec3 } from '../types';

/* ------------------------------------------------------------------ */
/*  Public config & entry point                                       */
/* ------------------------------------------------------------------ */

export interface DungeonConfig {
  width: number;
  height: number;
  roomCount: number;
  corridorWidth: number;
  minRoomSize: number;
  maxRoomSize: number;
  loopChance: number;
  seed?: number;
}

const DEFAULTS: DungeonConfig = {
  width: 40,
  height: 40,
  roomCount: 5,
  corridorWidth: 2,
  minRoomSize: 6,
  maxRoomSize: 14,
  loopChance: 0.15,
};

interface Room { x: number; z: number; w: number; h: number }

export function generateDungeon(userCfg?: Partial<DungeonConfig>): LevelObject[] {
  const cfg = { ...DEFAULTS, ...userCfg };
  const rng = createRng(cfg.seed ?? (Date.now() & 0x7fffffff));
  const randInt = (lo: number, hi: number) => lo > hi ? lo : Math.floor(rng() * (hi - lo + 1)) + lo;
  const hw = Math.max(1, Math.floor(cfg.corridorWidth / 2));
  const padding = Math.max(3, cfg.corridorWidth + 1);

  const rooms = placeRooms(cfg, randInt, padding);
  if (rooms.length < 2) {
    return rooms.map((r, i) => makePoly(`Room ${i + 1}`, rectVerts(r), '#c8c8c8'));
  }

  const connections = buildConnections(rooms, cfg.loopChance, rng);
  const roomVerts: Vec3[][] = rooms.map((r) => rectVerts(r));
  const corridorPolys = buildCorridors(rooms, connections, hw, roomVerts);

  const out: LevelObject[] = [];
  for (let i = 0; i < rooms.length; i++) {
    out.push(makePoly(`Room ${i + 1}`, roomVerts[i], '#c8c8c8'));
  }
  for (let i = 0; i < corridorPolys.length; i++) {
    out.push(makePoly(`Corridor ${i + 1}`, corridorPolys[i], '#a0a0a0'));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  1. Room placement — random with collision avoidance                */
/* ------------------------------------------------------------------ */

function placeRooms(
  cfg: DungeonConfig,
  randInt: (lo: number, hi: number) => number,
  padding: number,
): Room[] {
  const rooms: Room[] = [];
  const halfW = Math.floor(cfg.width / 2);
  const halfH = Math.floor(cfg.height / 2);

  for (let i = 0; i < cfg.roomCount; i++) {
    let placed = false;
    for (let attempt = 0; attempt < 400; attempt++) {
      const rw = randInt(cfg.minRoomSize, cfg.maxRoomSize);
      const rh = randInt(cfg.minRoomSize, cfg.maxRoomSize);
      const rx = randInt(-halfW + 1, halfW - rw - 1);
      const rz = randInt(-halfH + 1, halfH - rh - 1);
      const c: Room = { x: rx, z: rz, w: rw, h: rh };
      if (rooms.every((r) => !overlaps(r, c, padding))) {
        rooms.push(c);
        placed = true;
        break;
      }
    }
    if (!placed) break;
  }
  return rooms;
}

function overlaps(a: Room, b: Room, pad: number): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.z + a.h + pad <= b.z ||
    b.z + b.h + pad <= a.z
  );
}

/* ------------------------------------------------------------------ */
/*  2. MST connection graph + optional extra edges for loops           */
/* ------------------------------------------------------------------ */

function roomDist(a: Room, b: Room): number {
  const dx = a.x + a.w / 2 - (b.x + b.w / 2);
  const dz = a.z + a.h / 2 - (b.z + b.h / 2);
  return Math.sqrt(dx * dx + dz * dz);
}

function buildConnections(rooms: Room[], loopChance: number, rng: () => number): [number, number][] {
  const n = rooms.length;
  if (n <= 1) return [];

  const inTree = new Set([0]);
  const edges: [number, number][] = [];

  while (inTree.size < n) {
    let best = Infinity;
    let bestEdge: [number, number] = [0, 1];
    for (const a of inTree) {
      for (let b = 0; b < n; b++) {
        if (inTree.has(b)) continue;
        const d = roomDist(rooms[a], rooms[b]);
        if (d < best) {
          best = d;
          bestEdge = [a, b];
        }
      }
    }
    edges.push(bestEdge);
    inTree.add(bestEdge[1]);
  }

  const set = new Set(edges.map(([a, b]) => pairKey(a, b)));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const k = pairKey(a, b);
      if (!set.has(k) && rng() < loopChance) {
        edges.push([a, b]);
        set.add(k);
      }
    }
  }
  return edges;
}

function pairKey(a: number, b: number): string {
  return `${Math.min(a, b)},${Math.max(a, b)}`;
}

/* ------------------------------------------------------------------ */
/*  3. Corridor creation — connects at room walls, exact edge sharing */
/* ------------------------------------------------------------------ */

function buildCorridors(
  rooms: Room[],
  connections: [number, number][],
  hw: number,
  roomVerts: Vec3[][],
): Vec3[][] {
  const all: Vec3[][] = [];

  for (const [ai, bi] of connections) {
    const polys = corridorBetween(rooms[ai], rooms[bi], hw);
    all.push(...polys);

    for (const poly of polys) {
      for (const pt of poly) {
        insertPointOnEdge(roomVerts[ai], pt);
        insertPointOnEdge(roomVerts[bi], pt);
      }
    }
  }
  return all;
}

function corridorBetween(a: Room, b: Room, hw: number): Vec3[][] {
  const dx = (b.x + b.w / 2) - (a.x + a.w / 2);
  const dz = (b.z + b.h / 2) - (a.z + a.h / 2);

  if (Math.abs(dx) >= Math.abs(dz)) {
    return hCorridor(a, b, hw, dx >= 0);
  }
  return vCorridor(a, b, hw, dz >= 0);
}

/* Horizontal-primary corridor (rooms separated along X) */
function hCorridor(a: Room, b: Room, hw: number, aLeft: boolean): Vec3[][] {
  const [L, R] = aLeft ? [a, b] : [b, a];
  const exitX = L.x + L.w;
  const entryX = R.x;
  if (exitX >= entryX) return [];

  const zMin = Math.max(L.z + hw, R.z + hw);
  const zMax = Math.min(L.z + L.h - hw, R.z + R.h - hw);

  if (zMin <= zMax) {
    const cz = Math.round((zMin + zMax) / 2);
    return [[v(exitX, cz - hw), v(entryX, cz - hw), v(entryX, cz + hw), v(exitX, cz + hw)]];
  }

  const eZ = Math.round(clamp(L.z + L.h / 2, L.z + hw, L.z + L.h - hw));
  const nZ = Math.round(clamp(R.z + R.h / 2, R.z + hw, R.z + R.h - hw));

  if (Math.abs(eZ - nZ) < 2 * hw) {
    const lo = Math.min(eZ, nZ) - hw;
    const hi = Math.max(eZ, nZ) + hw;
    return [[v(exitX, lo), v(entryX, lo), v(entryX, hi), v(exitX, hi)]];
  }

  const midX = Math.round((exitX + entryX) / 2);
  const loZ = Math.min(eZ, nZ);
  const hiZ = Math.max(eZ, nZ);

  const seg1: Vec3[] = [
    v(exitX, eZ - hw), v(midX - hw, eZ - hw),
    v(midX - hw, eZ + hw), v(exitX, eZ + hw),
  ];

  const seg2: Vec3[] = [
    v(midX - hw, loZ - hw), v(midX + hw, loZ - hw),
    v(midX + hw, loZ + hw),
    v(midX + hw, hiZ - hw),
    v(midX + hw, hiZ + hw), v(midX - hw, hiZ + hw),
    v(midX - hw, hiZ - hw),
    v(midX - hw, loZ + hw),
  ];

  const seg3: Vec3[] = [
    v(midX + hw, nZ - hw), v(entryX, nZ - hw),
    v(entryX, nZ + hw), v(midX + hw, nZ + hw),
  ];

  return [seg1, seg2, seg3];
}

/* Vertical-primary corridor (rooms separated along Z) */
function vCorridor(a: Room, b: Room, hw: number, aTop: boolean): Vec3[][] {
  const [T, B] = aTop ? [a, b] : [b, a];
  const exitZ = T.z + T.h;
  const entryZ = B.z;
  if (exitZ >= entryZ) return [];

  const xMin = Math.max(T.x + hw, B.x + hw);
  const xMax = Math.min(T.x + T.w - hw, B.x + B.w - hw);

  if (xMin <= xMax) {
    const cx = Math.round((xMin + xMax) / 2);
    return [[v(cx - hw, exitZ), v(cx + hw, exitZ), v(cx + hw, entryZ), v(cx - hw, entryZ)]];
  }

  const eX = Math.round(clamp(T.x + T.w / 2, T.x + hw, T.x + T.w - hw));
  const nX = Math.round(clamp(B.x + B.w / 2, B.x + hw, B.x + B.w - hw));

  if (Math.abs(eX - nX) < 2 * hw) {
    const lo = Math.min(eX, nX) - hw;
    const hi = Math.max(eX, nX) + hw;
    return [[v(lo, exitZ), v(hi, exitZ), v(hi, entryZ), v(lo, entryZ)]];
  }

  const midZ = Math.round((exitZ + entryZ) / 2);
  const loX = Math.min(eX, nX);
  const hiX = Math.max(eX, nX);

  const seg1: Vec3[] = [
    v(eX - hw, exitZ), v(eX + hw, exitZ),
    v(eX + hw, midZ - hw), v(eX - hw, midZ - hw),
  ];

  const seg2: Vec3[] = [
    v(loX - hw, midZ - hw), v(loX + hw, midZ - hw),
    v(hiX - hw, midZ - hw),
    v(hiX + hw, midZ - hw),
    v(hiX + hw, midZ + hw),
    v(hiX - hw, midZ + hw),
    v(loX + hw, midZ + hw),
    v(loX - hw, midZ + hw),
  ];

  const seg3: Vec3[] = [
    v(nX - hw, midZ + hw), v(nX + hw, midZ + hw),
    v(nX + hw, entryZ), v(nX - hw, entryZ),
  ];

  return [seg1, seg2, seg3];
}

/* ------------------------------------------------------------------ */
/*  4. Edge insertion — puts corridor junction vertices on room walls  */
/* ------------------------------------------------------------------ */

function insertPointOnEdge(polygon: Vec3[], point: Vec3): void {
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.x === point.x && a.z === point.z) || (b.x === point.x && b.z === point.z)) return;
    if (pointOnSegment(point, a, b)) {
      polygon.splice(i + 1, 0, { x: point.x, y: 0, z: point.z });
      return;
    }
  }
}

function pointOnSegment(p: Vec3, a: Vec3, b: Vec3): boolean {
  const cross = (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
  if (Math.abs(cross) > 0.01) return false;
  return (
    p.x >= Math.min(a.x, b.x) - 0.01 && p.x <= Math.max(a.x, b.x) + 0.01 &&
    p.z >= Math.min(a.z, b.z) - 0.01 && p.z <= Math.max(a.z, b.z) + 0.01
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function v(x: number, z: number): Vec3 { return { x, y: 0, z }; }

function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}

function rectVerts(r: Room): Vec3[] {
  return [v(r.x, r.z), v(r.x + r.w, r.z), v(r.x + r.w, r.z + r.h), v(r.x, r.z + r.h)];
}

function makePoly(name: string, vertices: Vec3[], color: string): LevelObject {
  return {
    id: uuid(), name, type: 'polygon',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color, visible: true,
    vertices: [...vertices],
  };
}

function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
