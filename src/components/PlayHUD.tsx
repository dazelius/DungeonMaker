import { useEditor } from '../store';

export function PlayHUD() {
  const playCameraMode = useEditor((s) => s.playCameraMode);

  const hints = playCameraMode === 'back'
    ? 'WASD: Move / RightDrag: Rotate / Scroll: Zoom / V: Switch Camera / ESC: Exit'
    : 'Click: Move / Space: Jump / V: Switch Camera / ESC: Exit';

  return (
    <div style={{
      position: 'absolute',
      bottom: 16,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.6)',
      color: '#ddd',
      padding: '8px 20px',
      borderRadius: 8,
      fontSize: 12,
      letterSpacing: 0.5,
      pointerEvents: 'none',
      whiteSpace: 'nowrap',
      zIndex: 100,
    }}>
      {hints}
    </div>
  );
}
