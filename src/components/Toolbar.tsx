import { useEditor } from '../store';
import type { TransformMode } from '../types';
import { btn, input, panel } from '../styles/theme';

const modes: { key: TransformMode; label: string; shortcut: string }[] = [
  { key: 'select', label: 'Select', shortcut: 'V' },
  { key: 'translate', label: 'Move', shortcut: 'W' },
  { key: 'rotate', label: 'Rotate', shortcut: 'E' },
  { key: 'scale', label: 'Scale', shortcut: 'R' },
];

export function Toolbar() {
  const transformMode = useEditor((s) => s.transformMode);
  const snapEnabled = useEditor((s) => s.snapEnabled);
  const gridSize = useEditor((s) => s.gridSize);
  const showMeasurements = useEditor((s) => s.showMeasurements);
  const undoStack = useEditor((s) => s.undoStack);
  const redoStack = useEditor((s) => s.redoStack);
  const extruding = useEditor((s) => s.extruding);
  const topView = useEditor((s) => s.topView);
  const playMode = useEditor((s) => s.playMode);
  const playCameraMode = useEditor((s) => s.playCameraMode);
  const selectedObj = useEditor((s) => {
    const pid = s.selectedIds[s.selectedIds.length - 1];
    return pid ? s.objects.find((o) => o.id === pid) : undefined;
  });
  const chatOpen = useEditor((s) => s.chatOpen);
  const { setTransformMode, toggleSnap, toggleMeasurements, setGridSize, undo, redo, startExtruding, toggleTopView, enterPlayMode, exitPlayMode, togglePlayCameraMode, toggleChat } = useEditor.getState();

  return (
    <header style={panel.toolbar}>
      <span style={{ fontWeight: 700, color: '#999', marginRight: 12, fontSize: 12, letterSpacing: 1.5 }}>GRAYBOX</span>

      {!playMode && (
        <>
          <div style={{ display: 'flex', gap: 2, marginRight: 8 }}>
            {modes.map((m) => (
              <button
                key={m.key}
                onClick={() => setTransformMode(m.key)}
                style={transformMode === m.key ? btn.accent : btn.off}
                title={`${m.label} (${m.shortcut})`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            onClick={toggleTopView}
            style={topView ? btn.topView : btn.off}
            title="Top View (Q) — 2D drawing mode"
          >
            ⊞ Top
          </button>

          {selectedObj && (
            <button
              onClick={() => startExtruding()}
              style={extruding ? btn.extrude : btn.off}
              title="Extrude / Height (T) — move mouse up/down"
            >
              Extrude
            </button>
          )}

          {selectedObj && (selectedObj.type === 'polygon' || selectedObj.type === 'plane') && (
            <button
              onClick={() => useEditor.getState().startDrawingWallEdge()}
              style={useEditor.getState().drawingWallEdge ? btn.accent : btn.off}
              title="Add wall on polygon/plane edge"
            >
              Wall on Edge
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
            <button onClick={toggleSnap} style={snapEnabled ? btn.snap : btn.snapOff} title="Toggle grid snap">
              Snap
            </button>
            <input
              type="number"
              value={gridSize}
              min={0.1}
              step={0.25}
              onChange={(e) => setGridSize(parseFloat(e.target.value) || 1)}
              style={input.number}
              title="Grid size"
            />
          </div>

          <button onClick={toggleMeasurements} style={showMeasurements ? btn.measure : btn.measureOff} title="Toggle measurement guides">
            Measure
          </button>

          <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
            <button onClick={undo} disabled={undoStack.length === 0} style={undoStack.length === 0 ? btn.disabled(btn.off) : btn.off} title="Undo (Ctrl+Z)">Undo</button>
            <button onClick={redo} disabled={redoStack.length === 0} style={redoStack.length === 0 ? btn.disabled(btn.off) : btn.off} title="Redo (Ctrl+Y)">Redo</button>
          </div>
        </>
      )}

      {playMode && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            onClick={togglePlayCameraMode}
            style={playCameraMode === '3rd' ? btn.camMode : btn.camModeOff}
            title="3rd person quarter view (V to toggle)"
          >
            3rd Person
          </button>
          <button
            onClick={togglePlayCameraMode}
            style={playCameraMode === '1st' ? btn.camMode : btn.camModeOff}
            title="1st person FPS (V to toggle)"
          >
            1st Person
          </button>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {!playMode && (
        <button
          onClick={toggleChat}
          style={chatOpen ? { ...btn.base, background: '#7c3aed', color: '#fff' } : btn.off}
          title="AI Level Design Chat"
        >
          AI Chat
        </button>
      )}

      <button
        onClick={() => playMode ? exitPlayMode() : enterPlayMode()}
        style={playMode ? btn.stop : btn.play}
        title={playMode ? 'Stop playtest (ESC)' : 'Play — test your level'}
      >
        {playMode ? '■ Stop' : '▶ Play'}
      </button>

      {!playMode && <ExportMenu />}
    </header>
  );
}

function ExportMenu() {
  const projectName = useEditor((s) => s.projectName);

  const handleExport = async (format: 'glb' | 'gltf' | 'obj' | 'json') => {
    const { downloadBlob } = await import('../utils/download');
    if (format === 'json') {
      const json = useEditor.getState().exportProjectJson();
      downloadBlob(new Blob([json], { type: 'application/json' }), `${projectName}.json`);
      return;
    }
    const { exportGLTF, exportOBJ } = await import('../three/exporters');
    const { getViewportScene } = await import('../three/exporters');
    const scene = getViewportScene();
    if (!scene) return;

    if (format === 'glb') await exportGLTF(scene, `${projectName}.glb`, true);
    else if (format === 'gltf') await exportGLTF(scene, `${projectName}.gltf`, false);
    else if (format === 'obj') exportOBJ(scene, `${projectName}.obj`);
  };

  const handleLoad = () => {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = '.json';
    el.onchange = async () => {
      const file = el.files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        const data = JSON.parse(text);
        useEditor.getState().loadProject(data);
      } catch { /* ignore bad files */ }
    };
    el.click();
  };

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <button onClick={handleLoad} style={btn.off}>Open</button>
      <button onClick={() => handleExport('json')} style={btn.off}>Save</button>
      <button onClick={() => handleExport('glb')} style={btn.exportGreen}>GLB</button>
      <button onClick={() => handleExport('gltf')} style={btn.exportGreen}>glTF</button>
      <button onClick={() => handleExport('obj')} style={btn.exportTeal}>OBJ</button>
    </div>
  );
}
