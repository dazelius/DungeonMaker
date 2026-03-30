import type { StateCreator } from 'zustand';
import type { TransformMode, PlayCameraMode } from '../types';
import type { EditorState } from './types';
import { EDITOR } from '../constants';

export interface EditorSlice {
  projectName: string;
  gridSize: number;
  snapEnabled: boolean;
  showMeasurements: boolean;
  transformMode: TransformMode;
  topView: boolean;
  playMode: boolean;
  playCameraMode: PlayCameraMode;
  editingVertices: boolean;
  chatOpen: boolean;

  setProjectName: (n: string) => void;
  setGridSize: (s: number) => void;
  toggleSnap: () => void;
  toggleMeasurements: () => void;
  setTransformMode: (m: TransformMode) => void;
  toggleTopView: () => void;
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
  snapEnabled: true,
  showMeasurements: false,
  transformMode: 'select',
  topView: false,
  playMode: false,
  playCameraMode: '3rd',
  editingVertices: false,
  chatOpen: false,

  setProjectName: (n) => set({ projectName: n }),
  setGridSize: (s) => set({ gridSize: Math.max(EDITOR.minGridSize, s) }),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  toggleMeasurements: () => set((s) => ({ showMeasurements: !s.showMeasurements })),
  setTransformMode: (m) => set({ transformMode: m }),
  toggleTopView: () => set((s) => ({ topView: !s.topView })),

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
    set({ playMode: true, topView: false });
  },
  exitPlayMode: () => set({ playMode: false }),
  togglePlayCameraMode: () => set((s) => ({
    playCameraMode: s.playCameraMode === '3rd' ? '1st' : '3rd',
  })),
});
