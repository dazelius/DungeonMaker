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
  _batchSnapshots: LevelObject[];
  _streamedIds: string[];
  groupNames: Record<string, string>;
  _clipboard: LevelObject[];

  addObject: (type: PrimitiveType) => string;
  removeObject: (id: string) => void;
  removeSelected: () => void;
  duplicateObject: (id: string) => string | null;
  copySelected: () => void;
  pasteClipboard: () => void;
  updateObject: (id: string, patch: Partial<LevelObject>) => void;

  beginBatch: (id: string) => void;
  commitBatch: () => void;
  cancelBatch: () => void;

  batchAddObjects: (objs: LevelObject[], removeIds?: string[]) => void;
  streamAddObject: (obj: LevelObject) => void;
  finalizeStream: (removeIds?: string[]) => void;

  createGroup: (name: string, objectIds: string[]) => string;
  dissolveGroup: (groupId: string) => void;

  pushCommand: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;

  loadProject: (data: { name: string; gridSize: number; objects: LevelObject[]; groupNames?: Record<string, string> }) => void;
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

function snapshotObj(o: LevelObject): LevelObject {
  return { ...o, vertices: o.vertices ? [...o.vertices] : undefined };
}

export const createObjectSlice: StateCreator<EditorState, [], [], ObjectSlice> = (set, get) => ({
  objects: [],
  undoStack: [],
  redoStack: [],
  _batchSnapshots: [],
  _streamedIds: [],
  groupNames: {},
  _clipboard: [],

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

  copySelected: () => {
    const ids = get().selectedIds;
    if (ids.length === 0) return;
    const copies = get().objects.filter((o) => ids.includes(o.id)).map((o) => structuredClone(o));
    set({ _clipboard: copies });
  },

  pasteClipboard: () => {
    const clip = get()._clipboard;
    if (clip.length === 0) return;
    const offset = get().gridSize;
    const newObjs: LevelObject[] = clip.map((src) => ({
      ...structuredClone(src),
      id: uuid(),
      name: src.name + ' Copy',
      position: { x: src.position.x + offset, y: src.position.y, z: src.position.z + offset },
    }));
    const newIds = newObjs.map((o) => o.id);
    const cmd: Command = {
      execute: () => {
        const existing = get().objects.filter((o) => !newIds.includes(o.id));
        set({ objects: [...existing, ...newObjs], selectedIds: newIds });
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
    set({ _clipboard: newObjs.map((o) => structuredClone(o)) });
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
      _streamedIds: [...new Set([...s._streamedIds, obj.id])],
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

  /* --- batch: snapshots all group members for undo --- */

  beginBatch: (id) => {
    const obj = get().objects.find((o) => o.id === id);
    if (!obj) return;
    let targets: LevelObject[];
    if (obj.groupId) {
      targets = get().objects.filter((o) => o.groupId === obj.groupId);
    } else {
      targets = [obj];
    }
    set({ _batchSnapshots: targets.map(snapshotObj) });
  },

  commitBatch: () => {
    const snaps = get()._batchSnapshots;
    if (snaps.length === 0) return;
    const snapIds = new Set(snaps.map((s) => s.id));
    const afters = get().objects.filter((o) => snapIds.has(o.id)).map(snapshotObj);
    const befores = snaps;
    const cmd: Command = {
      execute: () => set((s) => ({
        objects: s.objects.map((o) => {
          const a = afters.find((x) => x.id === o.id);
          return a ? { ...a } : o;
        }),
      })),
      undo: () => set((s) => ({
        objects: s.objects.map((o) => {
          const b = befores.find((x) => x.id === o.id);
          return b ? { ...b } : o;
        }),
      })),
    };
    get().pushCommand(cmd);
    set({ _batchSnapshots: [] });
  },

  cancelBatch: () => {
    const snaps = get()._batchSnapshots;
    if (snaps.length > 0) {
      const snapMap = new Map(snaps.map((s) => [s.id, s]));
      set((s) => ({
        objects: s.objects.map((o) => snapMap.get(o.id) ?? o),
        _batchSnapshots: [],
      }));
    }
  },

  /* --- Group management --- */

  createGroup: (name, objectIds) => {
    const gid = uuid();
    set((s) => ({
      objects: s.objects.map((o) => objectIds.includes(o.id) ? { ...o, groupId: gid } : o),
      groupNames: { ...s.groupNames, [gid]: name },
    }));
    return gid;
  },

  dissolveGroup: (groupId) => {
    set((s) => ({
      objects: s.objects.map((o) => o.groupId === groupId ? { ...o, groupId: undefined } : o),
      groupNames: Object.fromEntries(Object.entries(s.groupNames).filter(([k]) => k !== groupId)),
    }));
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
    groupNames: data.groupNames ?? {},
    selectedIds: [],
    undoStack: [],
    redoStack: [],
    placingType: null,
    drawingPolygon: false,
    drawVertices: [],
    _batchSnapshots: [],
  }),

  exportProjectJson: () => {
    const s = get();
    return JSON.stringify({
      name: s.projectName,
      gridSize: s.gridSize,
      objects: s.objects,
      groupNames: s.groupNames,
    }, null, 2);
  },
});
