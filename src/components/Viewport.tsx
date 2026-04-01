import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useEditor } from '../store';
import { createSceneContext, type SceneContext } from '../three/SceneSetup';
import { createInputHandler, type InputContext } from '../three/InputHandler';
import { createPlayEngine, type PlayContext } from '../three/play/PlayEngine';

function DrawYIndicator() {
  const drawY = useEditor((s) => s.drawY);
  const isDrawing = useEditor((s) =>
    s.drawingRoad || s.drawingPolygon || s.drawingWall ||
    s.drawingRamp || s.drawingCliff || s.drawingTrim
  );
  const { drawYUp, drawYDown } = useEditor.getState();
  if (!isDrawing) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', alignItems: 'center', gap: 6, zIndex: 10,
      background: 'rgba(0,0,0,0.7)', borderRadius: 6, padding: '5px 12px',
      pointerEvents: 'auto', border: '1px solid #7c3aed',
    }}>
      <span style={{ fontSize: 10, color: '#999', fontWeight: 600, letterSpacing: 1 }}>DRAW Y</span>
      <button
        onClick={drawYDown}
        style={{
          background: '#333', color: '#ccc', border: 'none', borderRadius: 3,
          width: 22, height: 22, cursor: 'pointer', fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >-</button>
      <span style={{
        color: '#a78bfa', fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
        minWidth: 32, textAlign: 'center',
      }}>{drawY}</span>
      <button
        onClick={drawYUp}
        style={{
          background: '#333', color: '#ccc', border: 'none', borderRadius: 3,
          width: 22, height: 22, cursor: 'pointer', fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >+</button>
      <span style={{ fontSize: 9, color: '#666' }}>[ / ]</span>
    </div>
  );
}

function FloorIndicator() {
  const floorY = useEditor((s) => s.floorY);
  const floorIsolate = useEditor((s) => s.floorIsolate);
  const { setFloorY, toggleFloorIsolate } = useEditor.getState();

  const RANGE = 5;
  const levels: number[] = [];
  for (let y = floorY + RANGE; y >= floorY - RANGE; y--) levels.push(y);

  return (
    <div style={{
      position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1,
      zIndex: 10, background: 'rgba(0,0,0,0.55)', borderRadius: 6,
      padding: '6px 3px', pointerEvents: 'auto', minWidth: 38,
    }}>
      <div style={{
        fontSize: 8, color: '#999', fontWeight: 600, letterSpacing: 1.2,
        textAlign: 'center', marginBottom: 2, textTransform: 'uppercase',
      }}>Floor</div>
      {levels.map(y => {
        const isCurrent = y === floorY;
        const dist = Math.abs(y - floorY);
        const opacity = isCurrent ? 1 : Math.max(0.35, 1 - dist * 0.13);
        return (
          <div
            key={y}
            onClick={() => setFloorY(y)}
            style={{
              height: isCurrent ? 22 : 15,
              background: isCurrent ? '#7c3aed' : 'transparent',
              color: isCurrent ? '#fff' : '#aaa',
              fontSize: isCurrent ? 12 : 9,
              fontWeight: isCurrent ? 700 : 400,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 3, cursor: 'pointer', opacity,
              transition: 'all 0.15s ease', fontFamily: 'monospace',
              borderLeft: isCurrent ? '3px solid #a78bfa' : '1px solid rgba(100,100,100,0.3)',
              paddingLeft: isCurrent ? 0 : 2,
            }}
          >
            {y}
          </div>
        );
      })}
      <div
        onClick={toggleFloorIsolate}
        style={{
          marginTop: 4, fontSize: 9, textAlign: 'center', cursor: 'pointer',
          color: floorIsolate ? '#a78bfa' : '#666', fontWeight: 600,
          background: floorIsolate ? 'rgba(124,58,237,0.25)' : 'transparent',
          borderRadius: 3, padding: '3px 0',
        }}
        title="Isolate current floor (fade others)"
      >
        {floorIsolate ? 'ISO ON' : 'ISO'}
      </div>
    </div>
  );
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SceneContext | null>(null);
  const inputRef = useRef<InputContext | null>(null);
  const playRef = useRef<PlayContext | null>(null);
  const playMode = useEditor((s) => s.playMode);

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
    const isDrawing = state.drawingRoad || state.drawingPolygon || state.drawingWall ||
      state.drawingRamp || state.drawingCliff || state.drawingTrim;
    if (e.key === '[') { isDrawing ? state.drawYDown() : state.floorDown(); return; }
    if (e.key === ']') { isDrawing ? state.drawYUp() : state.floorUp(); return; }
    if (e.key === 'q' || e.key === 'Q') {
      const cycle: Record<string, string> = { perspective: 'top', top: 'iso', iso: 'perspective' };
      state.setViewMode((cycle[state.viewMode] ?? 'perspective') as any);
      return;
    }
    if (e.key === 't' || e.key === 'T') {
      const sel = state.getSelected();
      if (sel && input) {
        const startH = sel.type === 'polygon' ? (sel.extrudeHeight ?? 0) : sel.scale.y;
        input.beginExtrude(startH);
        state.startExtruding();
      }
      return;
    }
    if (e.key === 'f' || e.key === 'F') {
      const scene = sceneRef.current;
      if (scene && state.selectedIds.length > 0) {
        const box = new THREE.Box3();
        for (const id of state.selectedIds) {
          const mesh = scene.meshMap.get(id);
          if (mesh) box.expandByObject(mesh);
        }
        if (!box.isEmpty()) {
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z, 1);
          const cam = scene.getCamera();
          const dir = new THREE.Vector3();
          cam.getWorldDirection(dir);
          scene.orbitControls.target.copy(center);
          cam.position.copy(center).addScaledVector(dir, -maxDim * 1.5);
          scene.orbitControls.update();
        }
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
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('graybox-quick-save'));
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      state.copySelected();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      state.pasteClipboard();
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

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {!playMode && <FloorIndicator />}
      {!playMode && <DrawYIndicator />}
    </div>
  );
}
