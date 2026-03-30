import type { StateCreator } from 'zustand';
import type { LevelObject } from '../types';
import type { EditorState } from './types';

export interface SelectionSlice {
  selectedIds: string[];

  select: (id: string | null, additive?: boolean) => void;
  selectMultiple: (ids: string[]) => void;
  selectAll: () => void;
  primarySelectedId: () => string | null;
  getSelected: () => LevelObject | undefined;
}

export const createSelectionSlice: StateCreator<EditorState, [], [], SelectionSlice> = (set, get) => ({
  selectedIds: [],

  select: (id, additive = false) => {
    const wasEditing = get().editingVertices;
    if (!id) { set({ selectedIds: [], ...(wasEditing ? { editingVertices: false } : {}) }); return; }
    if (additive) {
      set((s) => {
        const cur = s.selectedIds;
        if (cur.includes(id)) return { selectedIds: cur.filter((x) => x !== id), ...(wasEditing ? { editingVertices: false } : {}) };
        return { selectedIds: [...cur, id], ...(wasEditing ? { editingVertices: false } : {}) };
      });
    } else {
      const cur = get().selectedIds;
      const same = cur.length === 1 && cur[0] === id;
      set({ selectedIds: [id], ...(wasEditing && !same ? { editingVertices: false } : {}) });
    }
  },

  selectMultiple: (ids) => {
    const wasEditing = get().editingVertices;
    set({ selectedIds: ids, ...(wasEditing ? { editingVertices: false } : {}) });
  },

  selectAll: () => set((s) => ({ selectedIds: s.objects.map((o) => o.id) })),

  primarySelectedId: () => {
    const ids = get().selectedIds;
    return ids.length > 0 ? ids[ids.length - 1] : null;
  },

  getSelected: () => {
    const s = get();
    const pid = s.selectedIds[s.selectedIds.length - 1];
    return pid ? s.objects.find((o) => o.id === pid) : undefined;
  },
});
