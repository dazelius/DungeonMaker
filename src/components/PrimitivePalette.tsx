import { useEditor } from '../store';
import type { PrimitiveType } from '../types';
import { label, paletteItem, drawButton, statusMsg, panel } from '../styles/theme';

const PRIMS: { type: PrimitiveType; label: string }[] = [
  { type: 'box', label: 'Box' },
  { type: 'plane', label: 'Plane' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'sphere', label: 'Sphere' },
  { type: 'stairs', label: 'Stairs' },
];

export function PrimitivePalette() {
  const placingType = useEditor((s) => s.placingType);
  const drawingPolygon = useEditor((s) => s.drawingPolygon);
  const drawVertices = useEditor((s) => s.drawVertices);
  const drawingWall = useEditor((s) => s.drawingWall);
  const wallVertices = useEditor((s) => s.wallVertices);
  const drawingRoad = useEditor((s) => s.drawingRoad);
  const roadVertices = useEditor((s) => s.roadVertices);
  const startPlacing = useEditor((s) => s.startPlacing);
  const cancelPlacing = useEditor((s) => s.cancelPlacing);
  const startDrawingPolygon = useEditor((s) => s.startDrawingPolygon);
  const cancelDrawing = useEditor((s) => s.cancelDrawing);
  const startDrawingWall = useEditor((s) => s.startDrawingWall);
  const cancelWallDrawing = useEditor((s) => s.cancelWallDrawing);
  const startDrawingRoad = useEditor((s) => s.startDrawingRoad);
  const cancelRoadDrawing = useEditor((s) => s.cancelRoadDrawing);

  return (
    <div style={panel.sidebar}>
      <div style={label.sectionHeader}>
        Primitives <span style={{ color: '#555', fontWeight: 400, textTransform: 'none' }}>— click to place</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
        {PRIMS.map((p) => {
          const isActive = placingType === p.type;
          return (
            <button
              key={p.type}
              onClick={() => isActive ? cancelPlacing() : startPlacing(p.type)}
              style={paletteItem.base(isActive)}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = paletteItem.hover.background; e.currentTarget.style.color = paletteItem.hover.color; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = paletteItem.normal.background; e.currentTarget.style.color = paletteItem.normal.color; } }}
              title={isActive ? `Cancel placing ${p.label}` : `Place ${p.label} — click on ground`}
            >
              <PrimIcon type={p.type} active={isActive} />
              <span>{p.label}</span>
            </button>
          );
        })}
      </div>

      <button
        onClick={() => drawingPolygon ? cancelDrawing() : startDrawingPolygon()}
        style={drawButton.base(drawingPolygon)}
        onMouseEnter={(e) => { if (!drawingPolygon) { e.currentTarget.style.background = paletteItem.hover.background; e.currentTarget.style.color = paletteItem.hover.color; } }}
        onMouseLeave={(e) => { if (!drawingPolygon) { e.currentTarget.style.background = drawButton.base(false).background as string; e.currentTarget.style.color = drawButton.base(false).color as string; } }}
        title="Draw polygon by clicking vertices on the ground"
      >
        <svg width={16} height={16} viewBox="0 0 20 20">
          <polygon points="3,16 2,6 10,2 18,8 15,17" fill="none" stroke={drawingPolygon ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1.5"/>
          {[{cx:3,cy:16},{cx:2,cy:6},{cx:10,cy:2},{cx:18,cy:8},{cx:15,cy:17}].map((c, i) => (
            <circle key={i} cx={c.cx} cy={c.cy} r="1.5" fill={drawingPolygon ? drawButton.activeColor : drawButton.inactiveColor}/>
          ))}
        </svg>
        Draw Polygon
      </button>

      <button
        onClick={() => drawingWall ? cancelWallDrawing() : startDrawingWall()}
        style={drawButton.base(drawingWall)}
        onMouseEnter={(e) => { if (!drawingWall) { e.currentTarget.style.background = paletteItem.hover.background; e.currentTarget.style.color = paletteItem.hover.color; } }}
        onMouseLeave={(e) => { if (!drawingWall) { e.currentTarget.style.background = drawButton.base(false).background as string; e.currentTarget.style.color = drawButton.base(false).color as string; } }}
        title="Draw wall by clicking two points"
      >
        <svg width={16} height={16} viewBox="0 0 20 20">
          <rect x="2" y="4" width="16" height="12" rx="1" fill="none" stroke={drawingWall ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1.5"/>
          <line x1="6" y1="4" x2="6" y2="16" stroke={drawingWall ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1"/>
          <line x1="10" y1="4" x2="10" y2="16" stroke={drawingWall ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1"/>
          <line x1="14" y1="4" x2="14" y2="16" stroke={drawingWall ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1"/>
        </svg>
        Draw Wall
      </button>

      <button
        onClick={() => drawingRoad ? cancelRoadDrawing() : startDrawingRoad()}
        style={drawButton.base(drawingRoad)}
        onMouseEnter={(e) => { if (!drawingRoad) { e.currentTarget.style.background = paletteItem.hover.background; e.currentTarget.style.color = paletteItem.hover.color; } }}
        onMouseLeave={(e) => { if (!drawingRoad) { e.currentTarget.style.background = drawButton.base(false).background as string; e.currentTarget.style.color = drawButton.base(false).color as string; } }}
        title="Draw road spline by clicking control points"
      >
        <svg width={16} height={16} viewBox="0 0 20 20">
          <path d="M2,16 C6,4 14,18 18,4" fill="none" stroke={drawingRoad ? drawButton.activeColor : drawButton.inactiveColor} strokeWidth="1.5"/>
          <circle cx="2" cy="16" r="1.5" fill={drawingRoad ? drawButton.activeColor : drawButton.inactiveColor}/>
          <circle cx="18" cy="4" r="1.5" fill={drawingRoad ? drawButton.activeColor : drawButton.inactiveColor}/>
        </svg>
        Draw Road
      </button>

      {placingType && !drawingPolygon && !drawingWall && !drawingRoad && (
        <div style={statusMsg.placing}>Click on ground to place. ESC to cancel.</div>
      )}
      {drawingPolygon && (
        <div style={statusMsg.drawing}>
          {drawVertices.length === 0 && 'Click to place first vertex'}
          {drawVertices.length === 1 && '1 vertex — click to add more'}
          {drawVertices.length === 2 && '2 vertices — need at least 3'}
          {drawVertices.length >= 3 && `${drawVertices.length} vertices — click first point or double-click to close`}
        </div>
      )}
      {drawingWall && (
        <div style={statusMsg.drawing}>
          {wallVertices.length === 0 && 'Click first wall point'}
          {wallVertices.length === 1 && 'Click second point to create wall'}
        </div>
      )}
      {drawingRoad && (
        <div style={statusMsg.drawing}>
          {roadVertices.length === 0 && 'Click to place first control point'}
          {roadVertices.length === 1 && '1 point — click to add more'}
          {roadVertices.length >= 2 && `${roadVertices.length} points — double-click or Enter to finish`}
        </div>
      )}
    </div>
  );
}

function PrimIcon({ type, active }: { type: PrimitiveType; active: boolean }) {
  const s = 20;
  const c = active ? '#93c5fd' : '#999';
  switch (type) {
    case 'box':
      return <svg width={s} height={s} viewBox="0 0 20 20"><rect x="3" y="3" width="14" height="14" rx="1" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'plane':
      return <svg width={s} height={s} viewBox="0 0 20 20"><polygon points="2,12 10,7 18,12 10,17" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'polygon':
      return <svg width={s} height={s} viewBox="0 0 20 20"><polygon points="3,16 2,6 10,2 18,8 15,17" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'cylinder':
      return <svg width={s} height={s} viewBox="0 0 20 20"><ellipse cx="10" cy="5" rx="6" ry="2.5" fill="none" stroke={c} strokeWidth="1.5"/><line x1="4" y1="5" x2="4" y2="15" stroke={c} strokeWidth="1.5"/><line x1="16" y1="5" x2="16" y2="15" stroke={c} strokeWidth="1.5"/><ellipse cx="10" cy="15" rx="6" ry="2.5" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'sphere':
      return <svg width={s} height={s} viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'stairs':
      return <svg width={s} height={s} viewBox="0 0 20 20"><polyline points="3,17 3,12 8,12 8,7 13,7 13,3 17,3" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'road':
      return <svg width={s} height={s} viewBox="0 0 20 20"><path d="M2,16 C6,4 14,18 18,4" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
    case 'wall':
      return <svg width={s} height={s} viewBox="0 0 20 20"><rect x="2" y="4" width="16" height="12" rx="1" fill="none" stroke={c} strokeWidth="1.5"/></svg>;
  }
}
