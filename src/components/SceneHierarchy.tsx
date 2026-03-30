import { useState } from 'react';
import { useEditor } from '../store';
import { label, hierarchyRow } from '../styles/theme';

export function SceneHierarchy() {
  const objects = useEditor((s) => s.objects);
  const selectedIds = useEditor((s) => s.selectedIds);
  const select = useEditor((s) => s.select);
  const updateObject = useEditor((s) => s.updateObject);
  const removeObject = useEditor((s) => s.removeObject);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
      <div style={label.sectionHeader}>Hierarchy</div>
      {objects.length === 0 && (
        <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>No objects yet</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {objects.map((obj) => {
          const isSel = selectedIds.includes(obj.id);
          const isHov = hoveredId === obj.id;
          return (
            <div
              key={obj.id}
              onClick={(e) => select(obj.id, e.shiftKey)}
              onMouseEnter={() => setHoveredId(obj.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={hierarchyRow.base(isSel, isHov)}
            >
              <button
                onClick={(e) => { e.stopPropagation(); updateObject(obj.id, { visible: !obj.visible }); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: obj.visible ? '#888' : '#444', fontSize: 12, width: 16, textAlign: 'center',
                }}
                title={obj.visible ? 'Hide' : 'Show'}
              >
                {obj.visible ? '●' : '○'}
              </button>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {obj.name}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeObject(obj.id); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                  color: '#666', fontSize: 10, opacity: isHov ? 1 : 0, transition: 'opacity .15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#f87171'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#666'; }}
                title="Delete"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
