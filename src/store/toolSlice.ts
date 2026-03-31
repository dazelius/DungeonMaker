import type { StateCreator } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { LevelObject, PrimitiveType, Vec3, Command } from '../types';
import type { EditorState } from './types';
import { nextPrimitiveName } from '../utils/naming';
import { snapVec3 } from '../utils/math';
import { OBJECT_DEFAULTS } from '../constants';
import { computeRoadSidePoints } from '../three/primitiveGeometry';
import { computeFreeEdges, worldVerts, type FreeEdge } from '../utils/freeEdge';

export interface ToolSlice {
  placingType: PrimitiveType | null;
  drawingPolygon: boolean;
  drawVertices: Vec3[];
  drawRedoVertices: Vec3[];
  extruding: boolean;
  extrudeOriginal: number;
  drawingWall: boolean;
  wallVertices: Vec3[];
  drawingRoad: boolean;
  roadVertices: Vec3[];
  roadRedoVertices: Vec3[];
  drawingWallEdge: boolean;
  drawingRamp: boolean;
  rampVertices: Vec3[];
  drawingCliff: boolean;
  cliffVertices: Vec3[];
  drawingTrim: boolean;
  trimVertices: Vec3[];

  startPlacing: (type: PrimitiveType) => void;
  cancelPlacing: () => void;
  placeAt: (pos: Vec3) => string;
  startDrawingPolygon: () => void;
  addDrawVertex: (pos: Vec3) => void;
  undoDrawVertex: () => void;
  redoDrawVertex: () => void;
  finishDrawing: () => string | null;
  cancelDrawing: () => void;
  startExtruding: () => boolean;
  applyExtrude: (height: number) => void;
  confirmExtrude: () => void;
  cancelExtrude: () => void;
  startDrawingWall: () => void;
  addWallVertex: (pos: Vec3) => void;
  cancelWallDrawing: () => void;
  startDrawingRoad: () => void;
  addRoadVertex: (pos: Vec3) => void;
  undoRoadVertex: () => void;
  redoRoadVertex: () => void;
  finishRoad: () => string | null;
  cancelRoadDrawing: () => void;
  startDrawingRamp: () => void;
  addRampVertex: (pos: Vec3) => void;
  cancelRampDrawing: () => void;
  startDrawingCliff: () => void;
  addCliffVertex: (pos: Vec3) => void;
  cancelCliffDrawing: () => void;
  startDrawingTrim: () => void;
  addTrimVertex: (pos: Vec3) => void;
  cancelTrimDrawing: () => void;
  startDrawingWallEdge: () => void;
  cancelWallEdgeDrawing: () => void;
  createWallFromEdge: (start: Vec3, end: Vec3) => string;
  createWallsFromAllEdges: (objectId: string) => void;
  createCliffsFromAllEdges: (objectId: string) => void;
}

const MERGE_EPS = 0.05;

function mergeConsecutiveEdges(freeEdges: FreeEdge[]): Vec3[][] {
  if (freeEdges.length === 0) return [];

  const used = new Array(freeEdges.length).fill(false);
  const runs: Vec3[][] = [];

  for (let start = 0; start < freeEdges.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const chain: Vec3[] = [freeEdges[start].edgeFrom, freeEdges[start].edgeTo];

    let extended = true;
    while (extended) {
      extended = false;
      const tail = chain[chain.length - 1];
      for (let j = 0; j < freeEdges.length; j++) {
        if (used[j]) continue;
        const ef = freeEdges[j].edgeFrom;
        if (Math.abs(tail.x - ef.x) < MERGE_EPS && Math.abs(tail.z - ef.z) < MERGE_EPS) {
          chain.push(freeEdges[j].edgeTo);
          used[j] = true;
          extended = true;
          break;
        }
      }
    }
    runs.push(chain);
  }
  return runs;
}

function ptSegDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.sqrt((px - (ax + t * dx)) ** 2 + (pz - (az + t * dz)) ** 2);
}

function segSegDist(a1x: number, a1z: number, a2x: number, a2z: number,
                    b1x: number, b1z: number, b2x: number, b2z: number): number {
  return Math.min(
    ptSegDist(a1x, a1z, b1x, b1z, b2x, b2z),
    ptSegDist(a2x, a2z, b1x, b1z, b2x, b2z),
    ptSegDist(b1x, b1z, a1x, a1z, a2x, a2z),
    ptSegDist(b2x, b2z, a1x, a1z, a2x, a2z),
  );
}

interface OtherEdge { ax: number; az: number; bx: number; bz: number }

function collectOtherSurfaceEdges(source: LevelObject, allObjects: LevelObject[]): OtherEdge[] {
  const edges: OtherEdge[] = [];
  for (const other of allObjects) {
    if (other.id === source.id) continue;
    if (other.type === 'polygon' && other.vertices && other.vertices.length >= 3) {
      const wv = worldVerts(other);
      for (let i = 0; i < wv.length; i++) {
        const a = wv[i], b = wv[(i + 1) % wv.length];
        edges.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z });
      }
    }
    if (other.type === 'road' && other.vertices && other.vertices.length >= 2) {
      const wv = worldVerts(other);
      const width = other.roadWidth ?? OBJECT_DEFAULTS.roadWidth;
      const [left, right] = computeRoadSidePoints(wv, width);
      for (const side of [left, right]) {
        for (let i = 0; i < side.length - 1; i++) {
          edges.push({ ax: side[i].x, az: side[i].z, bx: side[i + 1].x, bz: side[i + 1].z });
        }
      }
    }
    if (other.type === 'plane') {
      const p = other.position;
      const sx = other.scale.x * 2, sz = other.scale.z * 2;
      const c = [
        { x: p.x - sx, z: p.z - sz }, { x: p.x + sx, z: p.z - sz },
        { x: p.x + sx, z: p.z + sz }, { x: p.x - sx, z: p.z + sz },
      ];
      for (let i = 0; i < 4; i++) {
        edges.push({ ax: c[i].x, az: c[i].z, bx: c[(i + 1) % 4].x, bz: c[(i + 1) % 4].z });
      }
    }
  }
  return edges;
}

const ROAD_EDGE_THRESHOLD = 1.0;

function filterFreeSegments(sideVerts: Vec3[], source: LevelObject, allObjects: LevelObject[]): Vec3[][] {
  const otherEdges = collectOtherSurfaceEdges(source, allObjects);
  const runs: Vec3[][] = [];
  let current: Vec3[] = [];

  for (let i = 0; i < sideVerts.length - 1; i++) {
    const a = sideVerts[i];
    const b = sideVerts[i + 1];
    let blocked = false;
    for (const e of otherEdges) {
      if (segSegDist(a.x, a.z, b.x, b.z, e.ax, e.az, e.bx, e.bz) < ROAD_EDGE_THRESHOLD) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      if (current.length > 0) { runs.push(current); current = []; }
    } else {
      if (current.length === 0) current.push(a);
      current.push(b);
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function applyPositionOffset(verts: Vec3[], pos: Vec3): Vec3[] {
  if (pos.x === 0 && pos.y === 0 && pos.z === 0) return verts;
  return verts.map((v) => ({
    x: v.x + pos.x,
    y: (v.y ?? 0) + pos.y,
    z: v.z + pos.z,
  }));
}

function getEdgeVerts(source: LevelObject): Vec3[] | null {
  if (source.type === 'polygon' && source.vertices && source.vertices.length >= 3) {
    return applyPositionOffset(source.vertices, source.position);
  }
  if (source.type === 'plane') {
    const hs = 2;
    const p = source.position;
    const sx = source.scale.x;
    const sz = source.scale.z;
    const y = p.y;
    return [
      { x: p.x - hs * sx, y, z: p.z - hs * sz },
      { x: p.x + hs * sx, y, z: p.z - hs * sz },
      { x: p.x + hs * sx, y, z: p.z + hs * sz },
      { x: p.x - hs * sx, y, z: p.z + hs * sz },
    ];
  }
  return null;
}

function cancelAllDrawing(): Partial<EditorState> {
  return {
    placingType: null,
    drawingPolygon: false, drawVertices: [], drawRedoVertices: [],
    drawingWall: false, wallVertices: [],
    drawingRoad: false, roadVertices: [], roadRedoVertices: [],
    drawingWallEdge: false,
    drawingRamp: false, rampVertices: [],
    drawingCliff: false, cliffVertices: [],
    drawingTrim: false, trimVertices: [],
  };
}

export const createToolSlice: StateCreator<EditorState, [], [], ToolSlice> = (set, get) => ({
  placingType: null,
  drawingPolygon: false,
  drawVertices: [],
  drawRedoVertices: [],
  extruding: false,
  extrudeOriginal: 0,
  drawingWall: false,
  wallVertices: [],
  drawingRoad: false,
  roadVertices: [],
  roadRedoVertices: [],
  drawingWallEdge: false,
  drawingRamp: false,
  rampVertices: [],
  drawingCliff: false,
  cliffVertices: [],
  drawingTrim: false,
  trimVertices: [],

  startPlacing: (type) => set({ ...cancelAllDrawing(), placingType: type }),
  cancelPlacing: () => set(cancelAllDrawing()),

  startDrawingPolygon: () => set({ ...cancelAllDrawing(), drawingPolygon: true }),

  addDrawVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    set((s) => ({ drawVertices: [...s.drawVertices, { x: snapped.x, y: get().floorY, z: snapped.z }], drawRedoVertices: [] }));
  },

  undoDrawVertex: () => {
    const verts = get().drawVertices;
    if (verts.length === 0) return;
    const removed = verts[verts.length - 1];
    set((s) => ({
      drawVertices: s.drawVertices.slice(0, -1),
      drawRedoVertices: [...s.drawRedoVertices, removed],
    }));
  },

  redoDrawVertex: () => {
    const redo = get().drawRedoVertices;
    if (redo.length === 0) return;
    const restored = redo[redo.length - 1];
    set((s) => ({
      drawVertices: [...s.drawVertices, restored],
      drawRedoVertices: s.drawRedoVertices.slice(0, -1),
    }));
  },

  finishDrawing: () => {
    const verts = get().drawVertices;
    if (verts.length < 3) { set({ drawingPolygon: false, drawVertices: [] }); return null; }
    const id = uuid();
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('polygon'),
      type: 'polygon',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.polygonColor,
      visible: true,
      vertices: [...verts],
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set({ drawingPolygon: false, drawVertices: [] });
    return id;
  },

  cancelDrawing: () => set(cancelAllDrawing()),

  startExtruding: () => {
    const sel = get().getSelected();
    if (!sel) return false;
    const orig = sel.type === 'polygon' ? (sel.extrudeHeight ?? 0) : sel.scale.y;
    get().beginBatch(sel.id);
    set({ extruding: true, extrudeOriginal: orig });
    return true;
  },

  applyExtrude: (height) => {
    const sel = get().getSelected();
    if (!sel || !get().extruding) return;
    if (sel.type === 'polygon') {
      get().updateObject(sel.id, { extrudeHeight: Math.max(0, height) });
    } else {
      get().updateObject(sel.id, { scale: { ...sel.scale, y: Math.max(0.01, height) } });
    }
  },

  confirmExtrude: () => {
    get().commitBatch();
    set({ extruding: false });
  },

  cancelExtrude: () => {
    get().cancelBatch();
    set({ extruding: false });
  },

  placeAt: (pos) => {
    const type = get().placingType;
    if (!type) return get().addObject('box');
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    const color = type === 'plane' ? OBJECT_DEFAULTS.planeColor
      : OBJECT_DEFAULTS.color;
    const obj: LevelObject = {
      id: uuid(),
      name: nextPrimitiveName(type),
      type,
      position: snapped,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color,
      visible: true,
    };
    const id = obj.id;
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    return id;
  },

  /* ── Wall (two-point) ── */

  startDrawingWall: () => set({ ...cancelAllDrawing(), drawingWall: true }),

  addWallVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    const pt: Vec3 = { x: snapped.x, y: get().floorY, z: snapped.z };
    const prev = get().wallVertices;
    if (prev.length === 0) {
      set({ wallVertices: [pt] });
      return;
    }
    const start = prev[0];
    const id = uuid();
    const height = OBJECT_DEFAULTS.wallHeight;
    const thickness = OBJECT_DEFAULTS.wallThickness;
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('wall'),
      type: 'wall',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.wallColor,
      visible: true,
      vertices: [start, pt],
      wallHeight: height,
      wallThickness: thickness,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set({ wallVertices: [pt] });
  },

  cancelWallDrawing: () => set(cancelAllDrawing()),

  /* ── Road (spline) ── */

  startDrawingRoad: () => set({ ...cancelAllDrawing(), drawingRoad: true }),

  addRoadVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    set((s) => ({ roadVertices: [...s.roadVertices, { x: snapped.x, y: get().floorY, z: snapped.z }], roadRedoVertices: [] }));
  },

  undoRoadVertex: () => {
    const verts = get().roadVertices;
    if (verts.length === 0) return;
    const removed = verts[verts.length - 1];
    set((s) => ({
      roadVertices: s.roadVertices.slice(0, -1),
      roadRedoVertices: [...s.roadRedoVertices, removed],
    }));
  },

  redoRoadVertex: () => {
    const redo = get().roadRedoVertices;
    if (redo.length === 0) return;
    const restored = redo[redo.length - 1];
    set((s) => ({
      roadVertices: [...s.roadVertices, restored],
      roadRedoVertices: s.roadRedoVertices.slice(0, -1),
    }));
  },

  finishRoad: () => {
    const verts = get().roadVertices;
    if (verts.length < 2) { set(cancelAllDrawing()); return null; }
    const id = uuid();
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('road'),
      type: 'road',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.roadColor,
      visible: true,
      vertices: [...verts],
      roadWidth: OBJECT_DEFAULTS.roadWidth,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set(cancelAllDrawing());
    return id;
  },

  cancelRoadDrawing: () => set(cancelAllDrawing()),

  /* ── Ramp (two-point) ── */

  startDrawingRamp: () => set({ ...cancelAllDrawing(), drawingRamp: true }),

  addRampVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    const pt: Vec3 = { x: snapped.x, y: pos.y, z: snapped.z };
    const prev = get().rampVertices;
    if (prev.length === 0) {
      set({ rampVertices: [pt] });
      return;
    }
    const start = prev[0];
    const id = uuid();
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('ramp'),
      type: 'ramp',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.rampColor,
      visible: true,
      vertices: [start, pt],
      rampHeight: OBJECT_DEFAULTS.rampHeight,
      rampWidth: OBJECT_DEFAULTS.rampWidth,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set({ rampVertices: [pt] });
  },

  cancelRampDrawing: () => set(cancelAllDrawing()),

  /* ── Cliff (two-point, wall going down) ── */

  startDrawingCliff: () => set({ ...cancelAllDrawing(), drawingCliff: true }),

  addCliffVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    const pt: Vec3 = { x: snapped.x, y: get().floorY, z: snapped.z };
    const prev = get().cliffVertices;
    if (prev.length === 0) {
      set({ cliffVertices: [pt] });
      return;
    }
    const start = prev[0];
    const id = uuid();
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('cliff'),
      type: 'cliff',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.cliffColor,
      visible: true,
      vertices: [start, pt],
      cliffHeight: OBJECT_DEFAULTS.cliffHeight,
      cliffThickness: OBJECT_DEFAULTS.cliffThickness,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set({ cliffVertices: [pt] });
  },

  cancelCliffDrawing: () => set(cancelAllDrawing()),

  /* ── Trim (two-point, low wide barrier wall) ── */

  startDrawingTrim: () => set({ ...cancelAllDrawing(), drawingTrim: true }),

  addTrimVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    const pt: Vec3 = { x: snapped.x, y: get().floorY, z: snapped.z };
    const prev = get().trimVertices;
    if (prev.length === 0) {
      set({ trimVertices: [pt] });
      return;
    }
    const start = prev[0];
    const id = uuid();
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('trim'),
      type: 'trim',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.trimColor,
      visible: true,
      vertices: [start, pt],
      trimHeight: OBJECT_DEFAULTS.trimHeight,
      trimThickness: OBJECT_DEFAULTS.trimThickness,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    set({ trimVertices: [pt] });
  },

  cancelTrimDrawing: () => set(cancelAllDrawing()),

  /* ── Wall from edge ── */

  startDrawingWallEdge: () => {
    const sel = get().getSelected();
    if (!sel || (sel.type !== 'polygon' && sel.type !== 'plane')) return;
    set({ ...cancelAllDrawing(), drawingWallEdge: true });
  },

  cancelWallEdgeDrawing: () => set(cancelAllDrawing()),

  createWallFromEdge: (start, end) => {
    const id = uuid();
    const height = OBJECT_DEFAULTS.wallHeight;
    const thickness = OBJECT_DEFAULTS.wallThickness;
    const obj: LevelObject = {
      id,
      name: nextPrimitiveName('wall'),
      type: 'wall',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: OBJECT_DEFAULTS.wallColor,
      visible: true,
      vertices: [start, end],
      wallHeight: height,
      wallThickness: thickness,
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    return id;
  },

  createWallsFromAllEdges: (objectId) => {
    const source = get().objects.find((o) => o.id === objectId);
    if (!source) return;

    const height = OBJECT_DEFAULTS.wallHeight;
    const thickness = OBJECT_DEFAULTS.wallThickness;
    const newWalls: LevelObject[] = [];
    const newIds: string[] = [];

    if (source.type === 'road' && source.vertices && source.vertices.length >= 2) {
      const offsetVerts = applyPositionOffset(source.vertices, source.position);
      const sides = computeRoadSidePoints(offsetVerts, source.roadWidth ?? OBJECT_DEFAULTS.roadWidth);
      const allObjs = get().objects;
      for (const sideVerts of sides) {
        const freeSegs = filterFreeSegments(sideVerts, source, allObjs);
        for (const seg of freeSegs) {
          const id = uuid();
          newIds.push(id);
          newWalls.push({
            id, name: nextPrimitiveName('wall'), type: 'wall',
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            color: OBJECT_DEFAULTS.wallColor, visible: true,
            vertices: seg, wallHeight: height, wallThickness: thickness,
          });
        }
      }
    } else {
      const freeEdges = computeFreeEdges(source, get().objects);
      if (freeEdges.length === 0) return;

      const runs = mergeConsecutiveEdges(freeEdges);
      for (const run of runs) {
        const id = uuid();
        newIds.push(id);
        newWalls.push({
          id, name: nextPrimitiveName('wall'), type: 'wall',
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: OBJECT_DEFAULTS.wallColor, visible: true,
          vertices: run, wallHeight: height, wallThickness: thickness,
        });
      }
    }

    const cmd: Command = {
      execute: () => {
        const existing = get().objects.filter((o) => !newIds.includes(o.id));
        set({ objects: [...existing, ...newWalls], selectedIds: newIds });
      },
      undo: () => {
        set({
          objects: get().objects.filter((o) => !newIds.includes(o.id)),
          selectedIds: get().selectedIds.filter((s) => !newIds.includes(s)),
        });
      },
    };
    cmd.execute();
    get().pushCommand(cmd);
  },

  createCliffsFromAllEdges: (objectId) => {
    const source = get().objects.find((o) => o.id === objectId);
    if (!source) return;

    const height = OBJECT_DEFAULTS.cliffHeight;
    const thickness = OBJECT_DEFAULTS.cliffThickness;
    const newCliffs: LevelObject[] = [];
    const newIds: string[] = [];

    if (source.type === 'road' && source.vertices && source.vertices.length >= 2) {
      const offsetVerts = applyPositionOffset(source.vertices, source.position);
      const sides = computeRoadSidePoints(offsetVerts, source.roadWidth ?? OBJECT_DEFAULTS.roadWidth);
      const allObjs = get().objects;
      for (const sideVerts of sides) {
        const freeSegs = filterFreeSegments(sideVerts, source, allObjs);
        for (const seg of freeSegs) {
          if (seg.length < 2) continue;
          const id = uuid();
          newIds.push(id);
          newCliffs.push({
            id, name: nextPrimitiveName('cliff'), type: 'cliff',
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            color: OBJECT_DEFAULTS.cliffColor, visible: true,
            vertices: seg, cliffHeight: height, cliffThickness: thickness,
          });
        }
      }
    } else {
      const freeEdges = computeFreeEdges(source, get().objects);
      if (freeEdges.length === 0) return;

      const runs = mergeConsecutiveEdges(freeEdges);
      for (const run of runs) {
        const id = uuid();
        newIds.push(id);
        newCliffs.push({
          id, name: nextPrimitiveName('cliff'), type: 'cliff',
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: OBJECT_DEFAULTS.cliffColor, visible: true,
          vertices: run, cliffHeight: height, cliffThickness: thickness,
        });
      }
    }

    const cmd: Command = {
      execute: () => {
        const existing = get().objects.filter((o) => !newIds.includes(o.id));
        set({ objects: [...existing, ...newCliffs], selectedIds: newIds });
      },
      undo: () => {
        set({
          objects: get().objects.filter((o) => !newIds.includes(o.id)),
          selectedIds: get().selectedIds.filter((s) => !newIds.includes(s)),
        });
      },
    };
    cmd.execute();
    get().pushCommand(cmd);
  },
});
