import { useState, useMemo } from 'react';
import { useEditor } from '../store';
import { label, hierarchyRow } from '../styles/theme';

export function SceneHierarchy() {
  const objects = useEditor((s) => s.objects);
  const selectedIds = useEditor((s) => s.selectedIds);
  const groupNames = useEditor((s) => s.groupNames);
  const select = useEditor((s) => s.select);
  const selectMultiple = useEditor((s) => s.selectMultiple);
  const updateObject = useEditor((s) => s.updateObject);
  const removeObject = useEditor((s) => s.removeObject);
  const dissolveGroup = useEditor((s) => s.dissolveGroup);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { groups, ungrouped } = useMemo(() => {
    const gMap = new Map<string, typeof objects>();
    const ung: typeof objects = [];
    for (const obj of objects) {
      if (obj.groupId) {
        if (!gMap.has(obj.groupId)) gMap.set(obj.groupId, []);
        gMap.get(obj.groupId)!.push(obj);
      } else {
        ung.push(obj);
      }
    }
    return { groups: [...gMap.entries()], ungrouped: ung };
  }, [objects]);

  const toggleCollapse = (gid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid); else next.add(gid);
      return next;
    });
  };

  const selectGroup = (gid: string) => {
    const ids = objects.filter((o) => o.groupId === gid).map((o) => o.id);
    selectMultiple(ids);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
      <div style={label.sectionHeader}>Hierarchy</div>
      {objects.length === 0 && (
        <div style={{ fontSize: 11, color: '#555', fontStyle: 'italic' }}>No objects yet</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {groups.map(([gid, members]) => {
          const isCollapsed = collapsed.has(gid);
          const groupSel = members.some((m) => selectedIds.includes(m.id));
          const gName = groupNames[gid] || 'Group';
          return (
            <div key={gid}>
              {/* Group header */}
              <div
                onClick={() => selectGroup(gid)}
                onMouseEnter={() => setHoveredId(`g:${gid}`)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 6px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
                  background: groupSel ? 'rgba(37,99,235,0.2)' : hoveredId === `g:${gid}` ? '#2a2a2a' : 'transparent',
                  color: groupSel ? '#93c5fd' : '#ccc', fontWeight: 600,
                }}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCollapse(gid); }}
                  style={{ background: 'none', border: 'none', color: '#888', fontSize: 10, cursor: 'pointer', padding: 0, width: 14 }}
                >
                  {isCollapsed ? '▶' : '▼'}
                </button>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {gName} ({members.length})
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); dissolveGroup(gid); }}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    color: '#666', fontSize: 9, opacity: hoveredId === `g:${gid}` ? 1 : 0,
                  }}
                  title="Ungroup"
                >
                  ungroup
                </button>
              </div>
              {/* Group children */}
              {!isCollapsed && members.map((obj) => (
                <ObjectRow
                  key={obj.id}
                  obj={obj}
                  isSel={selectedIds.includes(obj.id)}
                  isHov={hoveredId === obj.id}
                  indent
                  onSelect={(e) => select(obj.id, e.shiftKey, e.altKey)}
                  onHoverIn={() => setHoveredId(obj.id)}
                  onHoverOut={() => setHoveredId(null)}
                  onToggleVis={() => updateObject(obj.id, { visible: !obj.visible })}
                  onRemove={() => removeObject(obj.id)}
                />
              ))}
            </div>
          );
        })}
        {ungrouped.map((obj) => (
          <ObjectRow
            key={obj.id}
            obj={obj}
            isSel={selectedIds.includes(obj.id)}
            isHov={hoveredId === obj.id}
            indent={false}
            onSelect={(e) => select(obj.id, e.shiftKey)}
            onHoverIn={() => setHoveredId(obj.id)}
            onHoverOut={() => setHoveredId(null)}
            onToggleVis={() => updateObject(obj.id, { visible: !obj.visible })}
            onRemove={() => removeObject(obj.id)}
          />
        ))}
      </div>
    </div>
  );
}

function ObjectRow({ obj, isSel, isHov, indent, onSelect, onHoverIn, onHoverOut, onToggleVis, onRemove }: {
  obj: { id: string; name: string; visible: boolean };
  isSel: boolean;
  isHov: boolean;
  indent: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onHoverIn: () => void;
  onHoverOut: () => void;
  onToggleVis: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      onMouseEnter={onHoverIn}
      onMouseLeave={onHoverOut}
      style={{ ...hierarchyRow.base(isSel, isHov), paddingLeft: indent ? 22 : 8 }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVis(); }}
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
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
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
}
