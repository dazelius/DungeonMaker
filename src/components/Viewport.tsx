import { useEffect, useRef, useCallback } from 'react';
import { useEditor } from '../store';
import { createSceneContext, type SceneContext } from '../three/SceneSetup';
import { createInputHandler, type InputContext } from '../three/InputHandler';
import { createPlayEngine, type PlayContext } from '../three/play/PlayEngine';

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneContext | null>(null);
  const inputRef = useRef<InputContext | null>(null);
  const playRef = useRef<PlayContext | null>(null);

  const onKey = useCallback((e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const state = useEditor.getState();

    if (state.playMode) return;

    const input = inputRef.current;

    if (e.key === 'Escape') {
      if (state.editingVertices) state.exitVertexEdit();
      else if (state.extruding) state.cancelExtrude();
      else if (state.drawingPolygon) state.cancelDrawing();
      else if (state.drawingWall) state.cancelWallDrawing();
      else if (state.drawingRoad) state.cancelRoadDrawing();
      else if (state.drawingWallEdge) state.cancelWallEdgeDrawing();
      else state.cancelPlacing();
      return;
    }
    if (e.key === 'Enter') {
      if (state.drawingRoad && state.roadVertices.length >= 2) { state.finishRoad(); return; }
      if (state.drawingPolygon && state.drawVertices.length >= 3) { state.finishDrawing(); return; }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') state.removeSelected();
    if (e.key === 'q' || e.key === 'Q') { state.toggleTopView(); return; }
    if (e.key === 't' || e.key === 'T') {
      const sel = state.getSelected();
      if (sel && input) {
        const startH = sel.type === 'polygon' ? (sel.extrudeHeight ?? 0) : sel.scale.y;
        input.beginExtrude(startH);
        state.startExtruding();
      }
      return;
    }
    if (e.key === 'v' || e.key === 'V') state.setTransformMode('select');
    if (e.key === 'w' || e.key === 'W' || e.key === 'g' || e.key === 'G') state.setTransformMode('translate');
    if (e.key === 'e' || e.key === 'E') state.setTransformMode('rotate');
    if (e.key === 'r' || e.key === 'R') state.setTransformMode('scale');
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (state.drawingPolygon) state.undoDrawVertex();
      else if (state.drawingRoad) state.undoRoadVertex();
      else state.undo();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      if (state.drawingPolygon) state.redoDrawVertex();
      else if (state.drawingRoad) state.redoRoadVertex();
      else state.redo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      const pid = state.primarySelectedId();
      if (pid) state.duplicateObject(pid);
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      state.selectAll();
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sceneCtx = createSceneContext(container);
    const inputCtx = createInputHandler(sceneCtx);
    const playCtx = createPlayEngine(sceneCtx);
    sceneRef.current = sceneCtx;
    inputRef.current = inputCtx;
    playRef.current = playCtx;

    const unsub = useEditor.subscribe((state, prev) => {
      if (state.playMode && !prev.playMode) playCtx.enter();
      else if (!state.playMode && prev.playMode) playCtx.exit();
    });

    window.addEventListener('keydown', onKey);

    return () => {
      unsub();
      window.removeEventListener('keydown', onKey);
      playCtx.dispose();
      inputCtx.dispose();
      sceneCtx.dispose();
    };
  }, [onKey]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }} />;
}
