import { useEditor } from '../store';
import type { Vec3 } from '../types';
import { btn, input as inputStyle, label as labelStyle, AXIS_COLORS } from '../styles/theme';

export function PropertiesPanel() {
  const selectedIds = useEditor((s) => s.selectedIds);
  const objects = useEditor((s) => s.objects);
  const updateObject = useEditor((s) => s.updateObject);
  const duplicateObject = useEditor((s) => s.duplicateObject);
  const removeSelected = useEditor((s) => s.removeSelected);
  const editingVertices = useEditor((s) => s.editingVertices);

  const primaryId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;
  const obj = primaryId ? objects.find((o) => o.id === primaryId) : undefined;

  if (!obj) {
    return (
      <div style={{ padding: 12, fontSize: 11, color: '#555', fontStyle: 'italic' }}>
        Select an object to edit its properties
      </div>
    );
  }

  if (selectedIds.length > 1) {
    return (
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginBottom: 8 }}>
          {selectedIds.length} objects selected
        </div>
        <button
          onClick={removeSelected}
          style={{ ...btn.danger, width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = btn.dangerHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}
        >
          Delete All Selected
        </button>
      </div>
    );
  }

  const patch = (field: string, value: unknown) => updateObject(obj.id, { [field]: value });

  return (
    <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle.section}>Name</label>
        <input
          value={obj.name}
          onChange={(e) => patch('name', e.target.value)}
          style={inputStyle.base}
        />
      </div>

      <div>
        <label style={labelStyle.section}>Type</label>
        <span style={{ color: '#bbb', textTransform: 'capitalize', fontSize: 11 }}>{obj.type}</span>
      </div>

      <Vec3Input label="Position" value={obj.position} onChange={(v) => patch('position', v)} step={0.25} />
      <Vec3Input label="Rotation" value={obj.rotation} onChange={(v) => patch('rotation', v)} step={15} />
      <Vec3Input label="Scale" value={obj.scale} onChange={(v) => patch('scale', v)} step={0.25} min={0.01} />

      {obj.type === 'polygon' ? (
        <HeightControl
          label="Extrude Height"
          value={obj.extrudeHeight ?? 0}
          onChange={(h) => patch('extrudeHeight', h)}
        />
      ) : (
        <HeightControl
          label="Height (Y)"
          value={obj.scale.y}
          onChange={(h) => patch('scale', { ...obj.scale, y: Math.max(0.01, h) })}
        />
      )}

      {obj.type === 'wall' && (
        <>
          <HeightControl
            label="Wall Height"
            value={obj.wallHeight ?? 3}
            onChange={(h) => patch('wallHeight', Math.max(0.1, h))}
          />
          <div>
            <label style={labelStyle.section}>Wall Thickness</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="range"
                min={0.05}
                max={2}
                step={0.05}
                value={obj.wallThickness ?? 0.2}
                onChange={(e) => patch('wallThickness', parseFloat(e.target.value))}
                style={{ flex: 1, accentColor: '#55aadd', cursor: 'pointer' }}
              />
              <input
                type="number"
                value={Math.round((obj.wallThickness ?? 0.2) * 100) / 100}
                min={0.05}
                step={0.05}
                onChange={(e) => patch('wallThickness', Math.max(0.05, parseFloat(e.target.value) || 0.2))}
                style={{ ...inputStyle.base, width: 52, textAlign: 'center', padding: '3px 2px' }}
              />
            </div>
          </div>
        </>
      )}

      {obj.type === 'road' && (
        <div>
          <label style={labelStyle.section}>Road Width</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="range"
              min={0.5}
              max={20}
              step={0.5}
              value={obj.roadWidth ?? 3}
              onChange={(e) => patch('roadWidth', parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: '#ee8833', cursor: 'pointer' }}
            />
            <input
              type="number"
              value={Math.round((obj.roadWidth ?? 3) * 100) / 100}
              min={0.5}
              step={0.5}
              onChange={(e) => patch('roadWidth', Math.max(0.5, parseFloat(e.target.value) || 3))}
              style={{ ...inputStyle.base, width: 52, textAlign: 'center', padding: '3px 2px' }}
            />
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle.section}>Color</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={obj.color}
            onChange={(e) => patch('color', e.target.value)}
            style={{ width: 32, height: 32, borderRadius: 4, border: '1px solid #555', cursor: 'pointer', background: 'transparent', padding: 0 }}
          />
          <input
            value={obj.color}
            onChange={(e) => patch('color', e.target.value)}
            style={{ ...inputStyle.base, flex: 1 }}
          />
        </div>
      </div>

      {obj.vertices && obj.vertices.length >= 2 && (
        <button
          onClick={() => {
            const s = useEditor.getState();
            if (s.editingVertices) s.exitVertexEdit();
            else s.enterVertexEdit();
          }}
          style={{
            ...btn.accent,
            width: '100%',
            background: editingVertices ? '#b45309' : undefined,
          }}
          title="Edit control point positions (drag handles)"
        >
          {editingVertices ? '✓ Editing Vertices' : 'Edit Vertices'}
        </button>
      )}

      {(obj.type === 'polygon' || obj.type === 'plane' || obj.type === 'road') && (
        <button
          onClick={() => useEditor.getState().createWallsFromAllEdges(obj.id)}
          style={{ ...btn.accent, width: '100%' }}
          title="Create walls on all edges of this polygon/plane"
        >
          Create Walls on All Edges
        </button>
      )}

      <div style={{ display: 'flex', gap: 4, paddingTop: 4 }}>
        <button
          onClick={() => duplicateObject(obj.id)}
          style={{ ...btn.neutral, flex: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = btn.neutralHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#333'; }}
        >
          Duplicate
        </button>
        <button
          onClick={removeSelected}
          style={{ ...btn.danger, flex: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = btn.dangerHover; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#7f1d1d'; }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function Vec3Input({ label, value, onChange, step = 0.25, min }: {
  label: string;
  value: Vec3;
  onChange: (v: Vec3) => void;
  step?: number;
  min?: number;
}) {
  const axes: (keyof Vec3)[] = ['x', 'y', 'z'];

  return (
    <div>
      <label style={labelStyle.section}>{label}</label>
      <div style={{ display: 'flex', gap: 4 }}>
        {axes.map((axis, i) => (
          <div key={axis} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: AXIS_COLORS[i], textTransform: 'uppercase', width: 10 }}>{axis}</span>
            <input
              type="number"
              value={Math.round(value[axis] * 1000) / 1000}
              step={step}
              min={min}
              onChange={(e) => onChange({ ...value, [axis]: parseFloat(e.target.value) || 0 })}
              style={{ ...inputStyle.base, textAlign: 'center', padding: '3px 2px' }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeightControl({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  return (
    <div>
      <label style={labelStyle.section}>
        {label}
        <span style={{ color: '#555', fontWeight: 400, textTransform: 'none', marginLeft: 4 }}>
          {value > 0 ? `${value.toFixed(2)}m` : 'flat'}
        </span>
      </label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="range"
          min={0}
          max={20}
          step={0.25}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#f59e0b', cursor: 'pointer' }}
        />
        <input
          type="number"
          value={Math.round(value * 100) / 100}
          min={0}
          step={0.25}
          onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          style={{ ...inputStyle.base, width: 52, textAlign: 'center', padding: '3px 2px' }}
        />
      </div>
    </div>
  );
}
