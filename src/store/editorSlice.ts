import type { StateCreator } from 'zustand';
import type { TransformMode, PlayCameraMode, ViewMode } from '../types';
import type { EditorState } from './types';
import { EDITOR } from '../constants';

export interface EditorSlice {
  projectName: string;
  gridSize: number;
  floorY: number;
  floorIsolate: boolean;
  snapEnabled: boolean;
  showMeasurements: boolean;
  transformMode: TransformMode;
  viewMode: ViewMode;
  playMode: boolean;
  playCameraMode: PlayCameraMode;
  editingVertices: boolean;
  chatOpen: boolean;

  setProjectName: (n: string) => void;
  setGridSize: (s: number) => void;
  setFloorY: (y: number) => void;
  floorUp: () => void;
  floorDown: () => void;
  toggleFloorIsolate: () => void;
  toggleSnap: () => void;
  toggleMeasurements: () => void;
  setTransformMode: (m: TransformMode) => void;
  setViewMode: (m: ViewMode) => void;
  enterVertexEdit: () => void;
  exitVertexEdit: () => void;
  toggleChat: () => void;
  enterPlayMode: () => void;
  exitPlayMode: () => void;
  togglePlayCameraMode: () => void;
}

export const createEditorSlice: StateCreator<EditorState, [], [], EditorSlice> = (set, get) => ({
  projectName: 'Untitled Level',
  gridSize: EDITOR.defaultGridSize,
  floorY: 0,
  floorIsolate: false,
  snapEnabled: true,
  showMeasurements: false,
  transformMode: 'select',
  viewMode: 'perspective' as ViewMode,
  playMode: false,
  playCameraMode: '3rd',
  editingVertices: false,
  chatOpen: false,

  setProjectName: (n) => set({ projectName: n }),
  setGridSize: (s) => set({ gridSize: Math.max(EDITOR.minGridSize, s) }),
  setFloorY: (y) => set({ floorY: Math.round(y) }),
  floorUp: () => set((s) => ({ floorY: s.floorY + 1 })),
  floorDown: () => set((s) => ({ floorY: s.floorY - 1 })),
  toggleFloorIsolate: () => set((s) => ({ floorIsolate: !s.floorIsolate })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  setTransformMode: (m) => set({ transformMode: m }),
  setViewMode: (m) => set({ viewMode: m }),

  enterVertexEdit: () => {
    const s = get();
    const sel = s.getSelected();
    if (!sel || !sel.vertices || sel.vertices.length < 2) return;
    if (s.extruding) s.cancelExtrude();
    if (s.drawingPolygon) s.cancelDrawing();
    if (s.drawingWall) s.cancelWallDrawing();
    if (s.drawingRoad) s.cancelRoadDrawing();
    if (s.drawingWallEdge) s.cancelWallEdgeDrawing();
    if (s.placingType) s.cancelPlacing();
    set({ editingVertices: true });
  },
  exitVertexEdit: () => set({ editingVertices: false }),

  toggleChat: () => set((s) => ({ chatOpen: !s.chatOpen })),

  enterPlayMode: () => {
    const s = get();
    if (s.extruding) s.cancelExtrude();
    if (s.drawingPolygon) s.cancelDrawing();
    if (s.drawingWall) s.cancelWallDrawing();
    if (s.drawingRoad) s.cancelRoadDrawing();
    if (s.drawingWallEdge) s.cancelWallEdgeDrawing();
    if (s.placingType) s.cancelPlacing();
    if (s.editingVertices) set({ editingVertices: false });
    set({ playMode: true, viewMode: 'perspective' as ViewMode, floorIsolate: false });
  },
  exitPlayMode: () => set({ playMode: false }),
  togglePlayCameraMode: () => set((s) => {
    const cycle: Record<string, PlayCameraMode> = { '3rd': 'back', 'back': 'iso', 'iso': '3rd' };
    return { playCameraMode: cycle[s.playCameraMode] ?? '3rd' };
  }),
});
