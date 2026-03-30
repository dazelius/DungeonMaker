import type { Vec3 } from '../types';

export function snapValue(val: number, grid: number, enabled: boolean): number {
  if (!enabled || grid <= 0) return val;
  return Math.round(val / grid) * grid;
}

export function snapVec3(v: Vec3, grid: number, enabled: boolean): Vec3 {
  return {
    x: snapValue(v.x, grid, enabled),
    y: snapValue(v.y, grid, enabled),
    z: snapValue(v.z, grid, enabled),
  };
}
