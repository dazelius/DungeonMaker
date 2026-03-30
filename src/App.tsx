import { Toolbar } from './components/Toolbar';
import { PrimitivePalette } from './components/PrimitivePalette';
import { SceneHierarchy } from './components/SceneHierarchy';
import { PropertiesPanel } from './components/PropertiesPanel';
import { Viewport } from './components/Viewport';
import { PlayHUD } from './components/PlayHUD';
import { ChatPanel } from './components/ChatPanel';
import { useEditor } from './store';

export function App() {
  const playMode = useEditor((s) => s.playMode);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', userSelect: 'none' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {!playMode && (
          <aside style={{ width: 200, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', background: 'var(--color-panel)', flexShrink: 0 }}>
            <PrimitivePalette />
            <SceneHierarchy />
          </aside>
        )}
        <main style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Viewport />
          {playMode && <PlayHUD />}
          {!playMode && <ChatPanel />}
        </main>
        {!playMode && (
          <aside style={{ width: 240, borderLeft: '1px solid var(--color-border)', background: 'var(--color-panel)', flexShrink: 0, overflowY: 'auto' }}>
            <PropertiesPanel />
          </aside>
        )}
      </div>
    </div>
  );
}
