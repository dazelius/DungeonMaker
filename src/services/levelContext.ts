import { useEditor } from '../store';
import type { LevelObject } from '../types';
import { computeFreeEdges, computeFootprint, worldVerts, type Footprint } from '../utils/freeEdge';

const MAX_OBJECTS = 80;
const MAX_VERTICES_SHOWN = 6;

function summarizeObject(obj: LevelObject): string {
  const parts: string[] = [
    `id:"${obj.id}"`,
    `name:"${obj.name}"`,
    `type:${obj.type}`,
  ];

  const p = obj.position;
  if (p.x !== 0 || p.y !== 0 || p.z !== 0) {
    parts.push(`pos:{${p.x},${p.y},${p.z}}`);
  }

  const s = obj.scale;
  if (s.x !== 1 || s.y !== 1 || s.z !== 1) {
    parts.push(`scale:{${s.x},${s.y},${s.z}}`);
  }

  if (obj.color !== '#d0d0d0' && obj.color !== '#c8c8c8' && obj.color !== '#b0b0b0') {
    parts.push(`color:"${obj.color}"`);
  }

  if (obj.vertices && obj.vertices.length > 0) {
    if (obj.vertices.length <= MAX_VERTICES_SHOWN) {
      const vs = obj.vertices.map((v) => `{${v.x},${v.y},${v.z}}`).join(',');
      parts.push(`verts:[${vs}]`);
    } else {
      const first = obj.vertices.slice(0, 3).map((v) => `{${v.x},${v.y},${v.z}}`).join(',');
      parts.push(`verts:[${first},...](${obj.vertices.length}pts)`);
    }
  }

  if (obj.wallHeight) parts.push(`wallH:${obj.wallHeight}`);
  if (obj.wallThickness && obj.wallThickness !== 0.2) parts.push(`wallT:${obj.wallThickness}`);
  if (obj.roadWidth) parts.push(`roadW:${obj.roadWidth}`);
  if (obj.rampHeight) parts.push(`rampH:${obj.rampHeight}`);
  if (obj.rampWidth) parts.push(`rampW:${obj.rampWidth}`);
  if (obj.cliffHeight) parts.push(`cliffH:${obj.cliffHeight}`);
  if (obj.trimHeight) parts.push(`trimH:${obj.trimHeight}`);
  if (obj.trimThickness && obj.trimThickness !== 0.5) parts.push(`trimT:${obj.trimThickness}`);
  if (obj.extrudeHeight) parts.push(`extrude:${obj.extrudeHeight}`);
  if (obj.groupId) parts.push(`group:"${obj.groupId}"`);

  return `{${parts.join(', ')}}`;
}

function computeBounds(obj: LevelObject): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null {
  if (obj.vertices && obj.vertices.length >= 2) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const v of obj.vertices) {
      minX = Math.min(minX, v.x); minY = Math.min(minY, v.y ?? 0); minZ = Math.min(minZ, v.z);
      maxX = Math.max(maxX, v.x); maxY = Math.max(maxY, v.y ?? 0); maxZ = Math.max(maxZ, v.z);
    }
    const ox = obj.position.x, oy = obj.position.y, oz = obj.position.z;
    return {
      center: { x: r((minX + maxX) / 2 + ox), y: r((minY + maxY) / 2 + oy), z: r((minZ + maxZ) / 2 + oz) },
      size: { x: r(maxX - minX), y: r(maxY - minY), z: r(maxZ - minZ) },
    };
  }
  return {
    center: { x: r(obj.position.x), y: r(obj.position.y), z: r(obj.position.z) },
    size: { x: r(obj.scale.x), y: r(obj.scale.y), z: r(obj.scale.z) },
  };
}

function r(n: number): number { return Math.round(n * 100) / 100; }

const LINEAR_TYPES = new Set(['road', 'wall', 'ramp', 'cliff', 'trim']);

function isInsideFps(px: number, pz: number, fps: Footprint[]): boolean {
  for (const fp of fps) {
    if (px >= fp.minX && px <= fp.maxX && pz >= fp.minZ && pz <= fp.maxZ) return true;
  }
  return false;
}

function buildSelectionSummary(selected: LevelObject[], allObjects: LevelObject[]): string {
  if (selected.length === 0) return 'SELECTED: nothing';

  if (selected.length === 1) {
    const obj = selected[0];
    const bounds = computeBounds(obj);
    const parts = [`>>> SELECTED: "${obj.name}" (${obj.type}, id:${obj.id})`];
    if (bounds) {
      parts.push(`  center: {${bounds.center.x}, ${bounds.center.y}, ${bounds.center.z}}`);
      parts.push(`  size: {${bounds.size.x}, ${bounds.size.y}, ${bounds.size.z}}`);
    }

    const wv = worldVerts(obj);
    if (wv.length >= 2) {
      if (LINEAR_TYPES.has(obj.type)) {
        const start = wv[0], end = wv[wv.length - 1];
        parts.push(`  startPt: {${start.x}, ${start.y}, ${start.z}}`);
        parts.push(`  endPt: {${end.x}, ${end.y}, ${end.z}}`);

        const otherFps: Footprint[] = [];
        for (const other of allObjects) {
          if (other.id === obj.id) continue;
          const fp = computeFootprint(other);
          if (fp) otherFps.push(fp);
        }
        const startFree = !isInsideFps(start.x, start.z, otherFps);
        const endFree = !isInsideFps(end.x, end.z, otherFps);
        if (startFree) parts.push(`  → startPt is FREE (connect new room here)`);
        if (endFree) parts.push(`  → endPt is FREE (connect new room here)`);
        if (!startFree && !endFree) parts.push(`  → both ends connected`);
      } else {
        const vs = wv.map((v) => `{${v.x},${v.y},${v.z}}`).join(',');
        parts.push(`  worldVerts: [${vs}]`);

        const freeEdges = computeFreeEdges(obj, allObjects);
        if (freeEdges.length > 0) {
          parts.push(`  OPEN EDGES (use these coordinates to connect):`);
          for (const e of freeEdges) {
            const rs = { x: r(e.midpoint.x + e.normal.x * 0.5), z: r(e.midpoint.z + e.normal.z * 0.5) };
            const re = { x: r(e.midpoint.x + e.normal.x * 3), z: r(e.midpoint.z + e.normal.z * 3) };
            parts.push(`    ${e.label}: edge (${e.edgeFrom.x},${e.edgeFrom.z})→(${e.edgeTo.x},${e.edgeTo.z}) | road from {${rs.x},${e.midpoint.y},${rs.z}} to {${re.x},${e.midpoint.y},${re.z}}`);
          }
        }
      }
    }

    return parts.join('\n');
  }

  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  let avgY = 0;
  for (const obj of selected) {
    const b = computeBounds(obj);
    if (!b) continue;
    minX = Math.min(minX, b.center.x - b.size.x / 2);
    minZ = Math.min(minZ, b.center.z - b.size.z / 2);
    maxX = Math.max(maxX, b.center.x + b.size.x / 2);
    maxZ = Math.max(maxZ, b.center.z + b.size.z / 2);
    avgY += b.center.y;
  }
  avgY = r(avgY / selected.length);
  const cx = r((minX + maxX) / 2), cz = r((minZ + maxZ) / 2);

  const names = selected.slice(0, 5).map((o) => `"${o.name}"`).join(', ');
  const more = selected.length > 5 ? ` +${selected.length - 5} more` : '';
  return `>>> SELECTED: ${selected.length} objects [${names}${more}]\n  area center: {${cx}, ${avgY}, ${cz}}, area size: {${r(maxX - minX)}, 0, ${r(maxZ - minZ)}}`;
}

function buildOccupancyMap(objects: LevelObject[]): string {
  const footprints: Footprint[] = [];
  for (const obj of objects) {
    const fp = computeFootprint(obj);
    if (fp) footprints.push(fp);
  }
  if (footprints.length === 0) return '';

  let gMinX = Infinity, gMaxX = -Infinity, gMinZ = Infinity, gMaxZ = -Infinity;
  for (const fp of footprints) {
    gMinX = Math.min(gMinX, fp.minX);
    gMaxX = Math.max(gMaxX, fp.maxX);
    gMinZ = Math.min(gMinZ, fp.minZ);
    gMaxZ = Math.max(gMaxZ, fp.maxZ);
  }

  const CELL = 2;
  const PAD = 4;
  const originX = Math.floor(gMinX / CELL) * CELL - PAD;
  const originZ = Math.floor(gMinZ / CELL) * CELL - PAD;
  const endX = Math.ceil(gMaxX / CELL) * CELL + PAD;
  const endZ = Math.ceil(gMaxZ / CELL) * CELL + PAD;
  const cols = Math.min((endX - originX) / CELL, 40);
  const rows = Math.min((endZ - originZ) / CELL, 30);

  const grid: string[][] = [];
  for (let row = 0; row < rows; row++) {
    grid.push(new Array(cols).fill('.'));
  }

  const legend = new Map<string, string>();
  let labelIdx = 0;
  const labels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

  for (const fp of footprints) {
    let ch = legend.get(fp.name);
    if (!ch) {
      ch = labelIdx < labels.length ? labels[labelIdx++] : '#';
      legend.set(fp.name, ch);
    }
    const r0 = Math.max(0, Math.floor((fp.minZ - originZ) / CELL));
    const r1 = Math.min(rows - 1, Math.ceil((fp.maxZ - originZ) / CELL) - 1);
    const c0 = Math.max(0, Math.floor((fp.minX - originX) / CELL));
    const c1 = Math.min(cols - 1, Math.ceil((fp.maxX - originX) / CELL) - 1);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        grid[row][col] = ch;
      }
    }
  }

  const xLabels: string[] = [];
  for (let c = 0; c < cols; c++) {
    const val = originX + c * CELL;
    xLabels.push(String(val).padStart(3));
  }

  const mapLines: string[] = [];
  mapLines.push(`GRID MAP (${CELL}m cells, . = free):`);

  const legendStr = Array.from(legend.entries()).map(([name, ch]) => `${ch}="${name}"`).join(' ');
  mapLines.push(`Legend: ${legendStr}`);

  mapLines.push('     ' + xLabels.join(''));
  for (let row = 0; row < rows; row++) {
    const zVal = String(originZ + row * CELL).padStart(4);
    mapLines.push(`Z${zVal} ` + grid[row].map((ch) => `  ${ch}`).join(''));
  }

  return '\n' + mapLines.join('\n');
}

export function buildLevelContext(): string {
  const state = useEditor.getState();
  const objects = state.objects.filter((o) => o.visible);
  const selectedIds = new Set(state.selectedIds);
  const selectedObjects = objects.filter((o) => selectedIds.has(o.id));

  if (objects.length === 0) return 'Empty level (no objects).\nSELECTED: nothing';

  let included: LevelObject[];
  if (objects.length <= MAX_OBJECTS) {
    included = objects;
  } else {
    const rest = objects.filter((o) => !selectedIds.has(o.id));
    const remaining = MAX_OBJECTS - selectedObjects.length;
    included = [...selectedObjects, ...rest.slice(0, Math.max(0, remaining))];
  }

  const lines = included.map((obj) => {
    const prefix = selectedIds.has(obj.id) ? '→ ' : '  ';
    return prefix + summarizeObject(obj);
  });

  const header = `${objects.length} objects total${objects.length > included.length ? ` (showing ${included.length})` : ''}`;
  const groupInfo = Object.entries(state.groupNames);
  let groupLine = '';
  if (groupInfo.length > 0) {
    groupLine = '\nGroups: ' + groupInfo.map(([id, name]) => `"${name}"(${id})`).join(', ');
  }

  const selSummary = buildSelectionSummary(selectedObjects, objects);
  const occupancy = buildOccupancyMap(objects);

  return `${selSummary}\n\n${header}${groupLine}${occupancy}\n${lines.join('\n')}`;
}
