import type { StateCreator } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { LevelObject, PrimitiveType, Vec3, Command } from '../types';
import type { EditorState } from './types';
import { nextPrimitiveName } from '../utils/naming';
import { snapVec3 } from '../utils/math';
import { OBJECT_DEFAULTS } from '../constants';

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
  startDrawingWallEdge: () => void;
  cancelWallEdgeDrawing: () => void;
  createWallFromEdge: (start: Vec3, end: Vec3) => string;
  createWallsFromAllEdges: (objectId: string) => void;
}

function computeRoadSidePoints(controlPoints: Vec3[], width: number): [Vec3[], Vec3[]] {
  const n = controlPoints.length;
  if (n < 2) return [[], []];

  const halfW = width / 2;
  const inset = 0.5;
  const left: Vec3[] = [];
  const right: Vec3[] = [];

  for (let i = 0; i < n; i++) {
    let p = controlPoints[i];
    let tx: number, tz: number;
    if (i < n - 1) {
      tx = controlPoints[i + 1].x - p.x;
      tz = controlPoints[i + 1].z - p.z;
    } else {
      tx = p.x - controlPoints[i - 1].x;
      tz = p.z - controlPoints[i - 1].z;
    }
    const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
    const tdx = tx / tLen;
    const tdz = tz / tLen;

    if (i === 0) {
      p = { x: p.x + tdx * inset, y: 0, z: p.z + tdz * inset };
    } else if (i === n - 1) {
      p = { x: p.x - tdx * inset, y: 0, z: p.z - tdz * inset };
    }

    const nx = -tdz;
    const nz = tdx;
    left.push({ x: p.x + nx * halfW, y: 0, z: p.z + nz * halfW });
    right.push({ x: p.x - nx * halfW, y: 0, z: p.z - nz * halfW });
  }

  return [left, right];
}

function cancelAllDrawing(): Partial<EditorState> {
  return {
    placingType: null,
    drawingPolygon: false, drawVertices: [], drawRedoVertices: [],
    drawingWall: false, wallVertices: [],
    drawingRoad: false, roadVertices: [], roadRedoVertices: [],
    drawingWallEdge: false,
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

  startPlacing: (type) => set({ ...cancelAllDrawing(), placingType: type }),
  cancelPlacing: () => set(cancelAllDrawing()),

  startDrawingPolygon: () => set({ ...cancelAllDrawing(), drawingPolygon: true }),

  addDrawVertex: (pos) => {
    const { gridSize, snapEnabled } = get();
    const snapped = snapVec3(pos, gridSize, snapEnabled);
    set((s) => ({ drawVertices: [...s.drawVertices, { x: snapped.x, y: 0, z: snapped.z }], drawRedoVertices: [] }));
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
    snapped.y = 0;
    const obj: LevelObject = {
      id: uuid(),
      name: nextPrimitiveName(type),
      type,
      position: snapped,
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: type === 'plane' ? OBJECT_DEFAULTS.planeColor : OBJECT_DEFAULTS.color,
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
    const pt: Vec3 = { x: snapped.x, y: 0, z: snapped.z };
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
    set((s) => ({ roadVertices: [...s.roadVertices, { x: snapped.x, y: 0, z: snapped.z }], roadRedoVertices: [] }));
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
      const sides = computeRoadSidePoints(source.vertices, source.roadWidth ?? OBJECT_DEFAULTS.roadWidth);
      for (const sideVerts of sides) {
        const id = uuid();
        newIds.push(id);
        newWalls.push({
          id, name: nextPrimitiveName('wall'), type: 'wall',
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: OBJECT_DEFAULTS.wallColor, visible: true,
          vertices: sideVerts, wallHeight: height, wallThickness: thickness,
        });
      }
    } else {
      let verts: Vec3[];
      if (source.type === 'polygon' && source.vertices && source.vertices.length >= 3) {
        verts = source.vertices;
      } else if (source.type === 'plane') {
        const hs = 2;
        const p = source.position;
        const sx = source.scale.x;
        const sz = source.scale.z;
        verts = [
          { x: p.x - hs * sx, y: 0, z: p.z - hs * sz },
          { x: p.x + hs * sx, y: 0, z: p.z - hs * sz },
          { x: p.x + hs * sx, y: 0, z: p.z + hs * sz },
          { x: p.x - hs * sx, y: 0, z: p.z + hs * sz },
        ];
      } else {
        return;
      }

      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const id = uuid();
        newIds.push(id);
        newWalls.push({
          id, name: nextPrimitiveName('wall'), type: 'wall',
          position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
          color: OBJECT_DEFAULTS.wallColor, visible: true,
          vertices: [a, b], wallHeight: height, wallThickness: thickness,
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
});
