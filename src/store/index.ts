import { create } from 'zustand';
import type { EditorState } from './types';
import { createEditorSlice } from './editorSlice';
import { createObjectSlice } from './objectSlice';
import { createSelectionSlice } from './selectionSlice';
import { createToolSlice } from './toolSlice';

export type { EditorState } from './types';

const STORAGE_KEY = 'graybox-autosave';

export const useEditor = create<EditorState>((...args) => ({
  ...createEditorSlice(...args),
  ...createObjectSlice(...args),
  ...createSelectionSlice(...args),
  ...createToolSlice(...args),
}));

/* ── Auto-save to localStorage ── */

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.objects)) {
      useEditor.getState().loadProject({
        name: data.name || 'Untitled Level',
        gridSize: data.gridSize || 1,
        objects: data.objects,
      });
    }
  } catch { /* corrupted data — ignore */ }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

useEditor.subscribe((state, prev) => {
  if (
    state.objects === prev.objects &&
    state.projectName === prev.projectName &&
    state.gridSize === prev.gridSize
  ) return;

  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { projectName, gridSize, objects } = useEditor.getState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: projectName, gridSize, objects }));
    } catch { /* quota exceeded — ignore */ }
  }, 500);
});

loadFromStorage();
