/** Shared UI style tokens — single source of truth for all component styles */

// --- Button styles ---

const btnBase: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: 4,
  fontSize: 11,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  transition: 'background .15s',
};

export const btn = {
  base: btnBase,
  off: { ...btnBase, background: '#383838', color: '#bbb' } as React.CSSProperties,
  accent: { ...btnBase, background: '#2563eb', color: '#fff' } as React.CSSProperties,
  snap: { ...btnBase, background: '#d97706', color: '#fff' } as React.CSSProperties,
  snapOff: { ...btnBase, background: '#383838', color: '#888' } as React.CSSProperties,
  measure: { ...btnBase, background: '#ea580c', color: '#fff' } as React.CSSProperties,
  measureOff: { ...btnBase, background: '#383838', color: '#888' } as React.CSSProperties,
  extrude: { ...btnBase, background: '#d97706', color: '#fff' } as React.CSSProperties,
  viewActive: { ...btnBase, background: '#7c3aed', color: '#fff' } as React.CSSProperties,
  exportGreen: { ...btnBase, background: '#047857', color: '#fff' } as React.CSSProperties,
  exportTeal: { ...btnBase, background: '#0f766e', color: '#fff' } as React.CSSProperties,
  danger: { ...btnBase, background: '#7f1d1d', color: '#fca5a5' } as React.CSSProperties,
  dangerHover: '#991b1b',
  neutral: { ...btnBase, background: '#333', color: '#ccc' } as React.CSSProperties,
  neutralHover: '#444',
  disabled: (base: React.CSSProperties) => ({ ...base, opacity: 0.3 }) as React.CSSProperties,
  play: { ...btnBase, background: '#16a34a', color: '#fff', fontWeight: 700 } as React.CSSProperties,
  stop: { ...btnBase, background: '#dc2626', color: '#fff', fontWeight: 700 } as React.CSSProperties,
  camMode: { ...btnBase, background: '#6d28d9', color: '#fff' } as React.CSSProperties,
  camModeOff: { ...btnBase, background: '#383838', color: '#aaa' } as React.CSSProperties,
} as const;

// --- Input styles ---

export const input = {
  base: {
    width: '100%',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 3,
    padding: '4px 6px',
    color: '#ddd',
    fontSize: 11,
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  number: {
    width: 50,
    background: '#333',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '3px 4px',
    fontSize: 11,
    textAlign: 'center' as const,
    color: '#ddd',
    outline: 'none',
  } as React.CSSProperties,
} as const;

// --- Label styles ---

export const label = {
  section: {
    fontSize: 10,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 4,
    display: 'block',
  } as React.CSSProperties,
  sectionHeader: {
    fontSize: 10,
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 6,
  } as React.CSSProperties,
} as const;

// --- Panel / layout styles ---

export const panel = {
  sidebar: {
    padding: 8,
    borderBottom: '1px solid var(--color-border)',
  } as React.CSSProperties,
  toolbar: {
    height: 40,
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '0 8px',
    borderBottom: '1px solid var(--color-border)',
    background: '#1a1a1a',
    flexShrink: 0,
  } as React.CSSProperties,
} as const;

// --- Palette item styles ---

export const paletteItem = {
  base: (active: boolean): React.CSSProperties => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 2, padding: '8px 4px', borderRadius: 4,
    border: active ? '1px solid #3b82f6' : '1px solid transparent',
    background: active ? '#1e3a5f' : '#2a2a2a',
    color: active ? '#93c5fd' : '#bbb',
    cursor: 'pointer', fontSize: 10, transition: 'all .15s',
  }),
  hover: { background: '#3a3a3a', color: '#fff' },
  normal: { background: '#2a2a2a', color: '#bbb' },
} as const;

export const drawButton = {
  base: (active: boolean): React.CSSProperties => ({
    width: '100%', marginTop: 6, padding: '8px 4px', borderRadius: 4,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    border: active ? '1px solid #22cc66' : '1px solid transparent',
    background: active ? '#0f3d2a' : '#2a2a2a',
    color: active ? '#6ee7a0' : '#bbb',
    cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all .15s',
  }),
  activeColor: '#6ee7a0',
  inactiveColor: '#999',
} as const;

export const statusMsg = {
  placing: {
    marginTop: 6, padding: '4px 6px', borderRadius: 3,
    background: '#1e3a5f', color: '#93c5fd', fontSize: 10, textAlign: 'center' as const,
  } as React.CSSProperties,
  drawing: {
    marginTop: 6, padding: '4px 6px', borderRadius: 3,
    background: '#0f3d2a', color: '#6ee7a0', fontSize: 10, textAlign: 'center' as const,
  } as React.CSSProperties,
} as const;

// --- Hierarchy row ---

export const hierarchyRow = {
  base: (selected: boolean, hovered: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
    background: selected ? 'rgba(37, 99, 235, 0.25)' : hovered ? '#2a2a2a' : 'transparent',
    color: selected ? '#93c5fd' : '#ccc',
  }),
} as const;

// --- Axis colors for vec3 inputs ---

export const AXIS_COLORS = ['#f87171', '#4ade80', '#60a5fa'] as const;
