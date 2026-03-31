import { useEffect, useRef } from 'react';
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
  const viewMode = useEditor((s) => s.viewMode);
  const playMode = useEditor((s) => s.playMode);
  const playCameraMode = useEditor((s) => s.playCameraMode);
  const selectedObj = useEditor((s) => {
    const pid = s.selectedIds[s.selectedIds.length - 1];
    return pid ? s.objects.find((o) => o.id === pid) : undefined;
  });
  const chatOpen = useEditor((s) => s.chatOpen);
  const projectName = useEditor((s) => s.projectName);
  const floorY = useEditor((s) => s.floorY);
  const floorIsolate = useEditor((s) => s.floorIsolate);
  const { setProjectName, setTransformMode, toggleSnap, toggleMeasurements, setGridSize, setFloorY, floorUp, floorDown, toggleFloorIsolate, undo, redo, startExtruding, setViewMode, enterPlayMode, exitPlayMode, togglePlayCameraMode, toggleChat } = useEditor.getState();

  return (
    <header style={panel.toolbar}>
      <span style={{ fontWeight: 700, color: '#999', marginRight: 4, fontSize: 12, letterSpacing: 1.5 }}>GRAYBOX</span>
      <input
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
        style={{
          background: 'transparent', border: 'none', borderBottom: '1px solid #555',
          color: '#ccc', fontSize: 12, fontWeight: 600, width: 120, padding: '2px 4px',
          outline: 'none', marginRight: 10,
        }}
        title="Project name (used for export filenames)"
      />

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

          <div style={{ display: 'flex', gap: 2, marginRight: 4 }}>
            <button
              onClick={() => setViewMode('perspective')}
              style={viewMode === 'perspective' ? btn.viewActive : btn.off}
              title="Perspective View (Q to cycle)"
            >
              3D
            </button>
            <button
              onClick={() => setViewMode('top')}
              style={viewMode === 'top' ? btn.viewActive : btn.off}
              title="Top View (Q to cycle)"
            >
              Top
            </button>
            <button
              onClick={() => setViewMode('iso')}
              style={viewMode === 'iso' ? btn.viewActive : btn.off}
              title="Isometric View (Q to cycle)"
            >
              Iso
            </button>
          </div>

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

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginRight: 8 }}>
            <span style={{ fontSize: 10, color: '#999', whiteSpace: 'nowrap' }}>Floor</span>
            <button onClick={floorDown} style={btn.snapOff} title="Floor down 1m">-</button>
            <input
              type="number"
              value={floorY}
              step={1}
              onChange={(e) => setFloorY(parseFloat(e.target.value) || 0)}
              style={{ ...input.number, width: 40 }}
              title="Floor Y height"
            />
            <button onClick={floorUp} style={btn.snapOff} title="Floor up 1m">+</button>
            <button
              onClick={toggleFloorIsolate}
              style={floorIsolate ? { ...btn.snapOff, background: '#7c3aed', color: '#fff' } : btn.snapOff}
              title="Isolate current floor (fade other floors)"
            >
              Iso
            </button>
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
            title="3rd person quarter view (V to cycle)"
          >
            3rd Person
          </button>
          <button
            onClick={togglePlayCameraMode}
            style={playCameraMode === 'back' ? btn.camMode : btn.camModeOff}
            title="3rd person back view (V to cycle)"
          >
            Back View
          </button>
          <button
            onClick={togglePlayCameraMode}
            style={playCameraMode === 'iso' ? btn.camMode : btn.camModeOff}
            title="Isometric view (V to cycle)"
          >
            Iso
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

let _savedDirHandle: FileSystemDirectoryHandle | null = null;
let _dirHandleLoaded = false;

const IDB_NAME = 'graybox-settings';
const IDB_STORE = 'kv';
const IDB_KEY = 'exportDirHandle';

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(handle: FileSystemDirectoryHandle) {
  const db = await openIDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
  db.close();
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
      req.onerror = () => { db.close(); resolve(null); };
    });
  } catch { return null; }
}

(async () => {
  const handle = await loadDirHandle();
  if (handle) _savedDirHandle = handle;
  _dirHandleLoaded = true;
})();

function showToast(msg: string) {
  const div = document.createElement('div');
  div.textContent = msg;
  Object.assign(div.style, {
    position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
    background: '#22c55e', color: '#000', padding: '8px 20px', borderRadius: '6px',
    fontSize: '13px', fontWeight: '600', zIndex: '99999', pointerEvents: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  });
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 2000);
}

async function verifyPermission(dirHandle: FileSystemDirectoryHandle): Promise<boolean> {
  const opts = { mode: 'readwrite' as const };
  if (await (dirHandle as any).queryPermission(opts) === 'granted') return true;
  if (await (dirHandle as any).requestPermission(opts) === 'granted') return true;
  return false;
}

async function writeFileToDir(dirHandle: FileSystemDirectoryHandle, name: string, blob: Blob) {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
}

function ExportMenu() {
  const projectName = useEditor((s) => s.projectName);
  const exportRef = useRef<(format: 'fbx') => void>();

  useEffect(() => {
    const handler = () => exportRef.current?.('fbx');
    document.addEventListener('graybox-quick-save', handler);
    return () => document.removeEventListener('graybox-quick-save', handler);
  }, []);

  const pickDir = async () => {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      _savedDirHandle = handle;
      await saveDirHandle(handle);
    } catch { /* user cancelled */ }
  };

  const handleExport = async (format: 'glb' | 'gltf' | 'obj' | 'fbx' | 'json') => {
    try {
      const useDir = _savedDirHandle && await verifyPermission(_savedDirHandle);
      const { downloadBlob } = await import('../utils/download');

      if (format === 'json') {
        const json = useEditor.getState().exportProjectJson();
        if (useDir && _savedDirHandle) {
          await writeFileToDir(_savedDirHandle, `${projectName}.json`, new Blob([json], { type: 'application/json' }));
          showToast(`Saved ${projectName}.json → ${_savedDirHandle.name}/`);
        } else {
          downloadBlob(new Blob([json], { type: 'application/json' }), `${projectName}.json`);
          showToast(`Downloaded ${projectName}.json`);
        }
        return;
      }

      const { exportGLTF, exportOBJ, exportFBX, exportFBXToDir, exportOBJToDir, getViewportScene } = await import('../three/exporters');
      const scene = getViewportScene();
      if (!scene) return;

      if (useDir && _savedDirHandle) {
        if (format === 'fbx') await exportFBXToDir(scene, projectName, _savedDirHandle);
        else if (format === 'obj') await exportOBJToDir(scene, projectName, _savedDirHandle);
        else if (format === 'glb') await exportGLTF(scene, `${projectName}.glb`, true);
        else if (format === 'gltf') await exportGLTF(scene, `${projectName}.gltf`, false);
        showToast(`Saved ${projectName}.${format} → ${_savedDirHandle.name}/`);
      } else {
        if (format === 'glb') await exportGLTF(scene, `${projectName}.glb`, true);
        else if (format === 'gltf') await exportGLTF(scene, `${projectName}.gltf`, false);
        else if (format === 'obj') exportOBJ(scene, `${projectName}.obj`);
        else if (format === 'fbx') exportFBX(scene, `${projectName}.fbx`);
        showToast(`Downloaded ${projectName}.${format}`);
      }
    } catch (err) {
      showToast(`Export failed: ${(err as Error).message}`);
    }
  };

  exportRef.current = handleExport as any;

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

  const dirLabel = _savedDirHandle ? `📂 ${_savedDirHandle.name}` : '📂 Set Path';

  return (
    <div style={{ display: 'flex', gap: 2 }}>
      <button onClick={handleLoad} style={btn.off}>Open</button>
      <button onClick={() => handleExport('json')} style={btn.off}>Save</button>
      <button
        onClick={pickDir}
        style={{ ...btn.off, fontSize: 10, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={_savedDirHandle ? `Export path: ${_savedDirHandle.name}` : 'Set local export folder'}
      >
        {dirLabel}
      </button>
      <button onClick={() => handleExport('glb')} style={btn.exportGreen}>GLB</button>
      <button onClick={() => handleExport('gltf')} style={btn.exportGreen}>glTF</button>
      <button onClick={() => handleExport('obj')} style={btn.exportTeal}>OBJ</button>
      <button onClick={() => handleExport('fbx')} style={btn.exportTeal}>FBX</button>
    </div>
  );
}
