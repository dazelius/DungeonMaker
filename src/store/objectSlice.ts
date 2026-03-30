import type { StateCreator } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { LevelObject, PrimitiveType, Vec3, Command } from '../types';
import type { EditorState } from './types';
import { nextPrimitiveName } from '../utils/naming';
import { OBJECT_DEFAULTS, EDITOR } from '../constants';

export interface ObjectSlice {
  objects: LevelObject[];
  undoStack: Command[];
  redoStack: Command[];
  _batchSnapshot: LevelObject | null;
  _streamedIds: string[];

  addObject: (type: PrimitiveType) => string;
  removeObject: (id: string) => void;
  removeSelected: () => void;
  duplicateObject: (id: string) => string | null;
  updateObject: (id: string, patch: Partial<LevelObject>) => void;

  beginBatch: (id: string) => void;
  commitBatch: () => void;
  cancelBatch: () => void;

  batchAddObjects: (objs: LevelObject[], removeIds?: string[]) => void;
  streamAddObject: (obj: LevelObject) => void;
  finalizeStream: (removeIds?: string[]) => void;

  pushCommand: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;

  loadProject: (data: { name: string; gridSize: number; objects: LevelObject[] }) => void;
  exportProjectJson: () => string;
}

function makeObject(type: PrimitiveType, pos: Vec3): LevelObject {
  const color = type === 'plane' ? OBJECT_DEFAULTS.planeColor
    : type === 'polygon' ? OBJECT_DEFAULTS.polygonColor
    : OBJECT_DEFAULTS.color;
  return {
    id: uuid(),
    name: nextPrimitiveName(type),
    type,
    position: { ...pos },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color,
    visible: true,
  };
}

export const createObjectSlice: StateCreator<EditorState, [], [], ObjectSlice> = (set, get) => ({
  objects: [],
  undoStack: [],
  redoStack: [],
  _batchSnapshot: null,
  _streamedIds: [],

  addObject: (type) => {
    const obj = makeObject(type, { x: 0, y: 0, z: 0 });
    const id = obj.id;
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== id), obj], selectedIds: [id] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    return id;
  },

  removeObject: (id) => {
    const obj = get().objects.find((o) => o.id === id);
    if (!obj) return;
    const snapshot = { ...obj };
    const cmd: Command = {
      execute: () => set({ objects: get().objects.filter((o) => o.id !== id), selectedIds: get().selectedIds.filter((s) => s !== id) }),
      undo: () => set({ objects: [...get().objects, snapshot] }),
    };
    cmd.execute();
    get().pushCommand(cmd);
  },

  removeSelected: () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    const snapshots = get().objects.filter((o) => ids.includes(o.id)).map((o) => ({ ...o }));
    const idSet = new Set(ids);
    const cmd: Command = {
      execute: () => set({ objects: get().objects.filter((o) => !idSet.has(o.id)), selectedIds: [] }),
      undo: () => set({ objects: [...get().objects, ...snapshots] }),
    };
    cmd.execute();
    get().pushCommand(cmd);
  },

  duplicateObject: (id) => {
    const src = get().objects.find((o) => o.id === id);
    if (!src) return null;
    const newId = uuid();
    const dup: LevelObject = {
      ...structuredClone(src),
      id: newId,
      name: src.name + ' Copy',
      position: { x: src.position.x + get().gridSize, y: src.position.y, z: src.position.z },
    };
    const cmd: Command = {
      execute: () => set({ objects: [...get().objects.filter((o) => o.id !== newId), dup], selectedIds: [newId] }),
      undo: () => set({ objects: get().objects.filter((o) => o.id !== newId), selectedIds: get().selectedIds.filter((s) => s !== newId) }),
    };
    cmd.execute();
    get().pushCommand(cmd);
    return newId;
  },

  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })),

  batchAddObjects: (objs, removeIds) => {
    const addIds = objs.map((o) => o.id);
    const removeSet = new Set(removeIds ?? []);
    const removedSnapshots = removeSet.size > 0
      ? get().objects.filter((o) => removeSet.has(o.id)).map((o) => ({ ...o }))
      : [];
    const cmd: Command = {
      execute: () => set((s) => {
        const kept = s.objects.filter((o) => !removeSet.has(o.id) && !addIds.includes(o.id));
        return { objects: [...kept, ...objs], selectedIds: addIds };
      }),
      undo: () => set((s) => {
        const without = s.objects.filter((o) => !addIds.includes(o.id));
        return {
          objects: [...without, ...removedSnapshots],
          selectedIds: s.selectedIds.filter((id) => !addIds.includes(id)),
        };
      }),
    };
    cmd.execute();
    get().pushCommand(cmd);
  },

  streamAddObject: (obj) => {
    set((s) => ({
      objects: [...s.objects.filter((o) => o.id !== obj.id), obj],
      _streamedIds: [...s._streamedIds, obj.id],
    }));
  },

  finalizeStream: (removeIds) => {
    const streamedIds = [...get()._streamedIds];
    if (streamedIds.length === 0) { set({ _streamedIds: [] }); return; }

    const streamedObjs = get().objects.filter((o) => streamedIds.includes(o.id)).map((o) => ({ ...o }));
    const removeSet = new Set(removeIds ?? []);
    const removedSnapshots = removeSet.size > 0
      ? get().objects.filter((o) => removeSet.has(o.id)).map((o) => ({ ...o }))
      : [];

    if (removeSet.size > 0) {
      set((s) => ({ objects: s.objects.filter((o) => !removeSet.has(o.id)) }));
    }

    const cmd: Command = {
      execute: () => set((s) => {
        const kept = s.objects.filter((o) => !removeSet.has(o.id) && !streamedIds.includes(o.id));
        return { objects: [...kept, ...streamedObjs], selectedIds: streamedIds };
      }),
      undo: () => set((s) => {
        const without = s.objects.filter((o) => !streamedIds.includes(o.id));
        return {
          objects: [...without, ...removedSnapshots],
          selectedIds: s.selectedIds.filter((id) => !streamedIds.includes(id)),
        };
      }),
    };
    get().pushCommand(cmd);
    set({ _streamedIds: [], selectedIds: streamedIds });
  },

  beginBatch: (id) => {
    const obj = get().objects.find((o) => o.id === id);
    if (obj) set({ _batchSnapshot: { ...obj, vertices: obj.vertices ? [...obj.vertices] : undefined } });
  },

  commitBatch: () => {
    const snap = get()._batchSnapshot;
    if (!snap) return;
    const current = get().objects.find((o) => o.id === snap.id);
    if (!current) { set({ _batchSnapshot: null }); return; }
    const after = { ...current, vertices: current.vertices ? [...current.vertices] : undefined };
    const before = snap;
    const id = snap.id;
    const cmd: Command = {
      execute: () => set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...after } : o)) })),
      undo: () => set((s) => ({ objects: s.objects.map((o) => (o.id === id ? { ...before } : o)) })),
    };
    get().pushCommand(cmd);
    set({ _batchSnapshot: null });
  },

  cancelBatch: () => {
    const snap = get()._batchSnapshot;
    if (snap) {
      set((s) => ({
        objects: s.objects.map((o) => (o.id === snap.id ? { ...snap } : o)),
        _batchSnapshot: null,
      }));
    }
  },

  pushCommand: (cmd) =>
    set((s) => {
      const stack = [...s.undoStack, cmd];
      if (stack.length > EDITOR.maxUndoStack) stack.shift();
      return { undoStack: stack, redoStack: [] };
    }),

  undo: () => {
    const { undoStack } = get();
    if (undoStack.length === 0) return;
    const cmd = undoStack[undoStack.length - 1];
    cmd.undo();
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, cmd],
    }));
  },

  redo: () => {
    const { redoStack } = get();
    if (redoStack.length === 0) return;
    const cmd = redoStack[redoStack.length - 1];
    cmd.execute();
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, cmd],
    }));
  },

  loadProject: (data) => set({
    projectName: data.name,
    gridSize: data.gridSize,
    objects: data.objects,
    selectedIds: [],
    undoStack: [],
    redoStack: [],
    placingType: null,
    drawingPolygon: false,
    drawVertices: [],
    _batchSnapshot: null,
  }),

  exportProjectJson: () => {
    const s = get();
    return JSON.stringify({ name: s.projectName, gridSize: s.gridSize, objects: s.objects }, null, 2);
  },
});
