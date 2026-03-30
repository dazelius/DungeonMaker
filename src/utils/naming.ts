import type { PrimitiveType } from '../types';

const PRIM_LABELS: Record<PrimitiveType, string> = {
  box: 'Box',
  cylinder: 'Cylinder',
  stairs: 'Stairs',
  sphere: 'Sphere',
  plane: 'Plane',
  polygon: 'Polygon',
  road: 'Road',
  wall: 'Wall',
};

const counts: Record<string, number> = {};

export function nextPrimitiveName(type: PrimitiveType): string {
  counts[type] = (counts[type] ?? 0) + 1;
  return `${PRIM_LABELS[type]} ${counts[type]}`;
}

export function resetNamingCounters(): void {
  for (const key of Object.keys(counts)) delete counts[key];
}
