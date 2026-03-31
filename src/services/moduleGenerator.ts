import { v4 as uuid } from 'uuid';
import type { LevelObject, Vec3 } from '../types';
import type { LLMModuleResponse } from './levelPrompt';
import { OBJECT_DEFAULTS } from '../constants';

type Dir = 'north' | 'south' | 'east' | 'west';

export interface ModuleResult {
  floor: LevelObject;
  walls: LevelObject[];
}

const ENTRANCE_WIDTH = 2;

export function generateModule(design: LLMModuleResponse): ModuleResult {
  const m = design.module;
  const hw = m.width / 2;
  const hh = m.height / 2;
  const entranceSet = new Set<Dir>(m.entrances);

  const vertices = buildShape(m.shape, hw, hh);
  const floor = makeFloor(m.name, vertices, m.color);

  const walls = buildWallsWithEntrances(vertices, entranceSet, hw, hh);

  return { floor, walls };
}

function buildShape(shape: string, hw: number, hh: number): Vec3[] {
  switch (shape) {
    case 'L': {
      const cx = hw * 0.4, cz = hh * 0.4;
      return [
        v(-hw, -hh), v(hw, -hh), v(hw, hh - cz),
        v(hw - cx, hh - cz), v(hw - cx, hh), v(-hw, hh),
      ];
    }
    case 'T': {
      const wing = hw * 0.3;
      return [
        v(-hw, -hh), v(hw, -hh), v(hw, -hh + wing * 2),
        v(hw * 0.4, -hh + wing * 2), v(hw * 0.4, hh),
        v(-hw * 0.4, hh), v(-hw * 0.4, -hh + wing * 2),
        v(-hw, -hh + wing * 2),
      ];
    }
    case 'cross': {
      const arm = Math.min(hw, hh) * 0.35;
      return [
        v(-arm, -hh), v(arm, -hh), v(arm, -arm),
        v(hw, -arm), v(hw, arm), v(arm, arm),
        v(arm, hh), v(-arm, hh), v(-arm, arm),
        v(-hw, arm), v(-hw, -arm), v(-arm, -arm),
      ];
    }
    case 'hex': {
      const r = Math.min(hw, hh);
      const pts: Vec3[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        pts.push(v(Math.round(Math.cos(angle) * r), Math.round(Math.sin(angle) * r)));
      }
      return pts;
    }
    default:
      return [v(-hw, -hh), v(hw, -hh), v(hw, hh), v(-hw, hh)];
  }
}

function buildWallsWithEntrances(
  vertices: Vec3[],
  entrances: Set<Dir>,
  hw: number,
  hh: number,
): LevelObject[] {
  const walls: LevelObject[] = [];
  const ehw = ENTRANCE_WIDTH / 2;

  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    const dir = edgeDirection(a, b, hw, hh);

    if (dir && entrances.has(dir)) {
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const isHorizontal = Math.abs(a.z - b.z) < 0.01;

      if (isHorizontal) {
        const leftEnd = { x: Math.min(a.x, b.x), y: 0, z: a.z };
        const rightEnd = { x: Math.max(a.x, b.x), y: 0, z: a.z };
        if (mx - ehw > leftEnd.x + 0.1) {
          walls.push(makeWall([leftEnd, v(mx - ehw, a.z)]));
        }
        if (mx + ehw < rightEnd.x - 0.1) {
          walls.push(makeWall([v(mx + ehw, a.z), rightEnd]));
        }
      } else {
        const topEnd = { x: a.x, y: 0, z: Math.min(a.z, b.z) };
        const botEnd = { x: a.x, y: 0, z: Math.max(a.z, b.z) };
        if (mz - ehw > topEnd.z + 0.1) {
          walls.push(makeWall([topEnd, v(a.x, mz - ehw)]));
        }
        if (mz + ehw < botEnd.z - 0.1) {
          walls.push(makeWall([v(a.x, mz + ehw), botEnd]));
        }
      }
    } else {
      walls.push(makeWall([a, b]));
    }
  }

  return walls;
}

function edgeDirection(a: Vec3, b: Vec3, hw: number, hh: number): Dir | null {
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  const isHoriz = Math.abs(a.z - b.z) < 0.5;
  const isVert = Math.abs(a.x - b.x) < 0.5;

  if (isHoriz) {
    if (Math.abs(mz + hh) < 1) return 'north';
    if (Math.abs(mz - hh) < 1) return 'south';
  }
  if (isVert) {
    if (Math.abs(mx - hw) < 1) return 'east';
    if (Math.abs(mx + hw) < 1) return 'west';
  }
  return null;
}

function v(x: number, z: number): Vec3 {
  return { x, y: 0, z };
}

function makeFloor(name: string, vertices: Vec3[], color: string): LevelObject {
  return {
    id: uuid(), name, type: 'polygon',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color, visible: true,
    vertices: [...vertices],
  };
}

function makeWall(verts: Vec3[]): LevelObject {
  return {
    id: uuid(), name: 'Wall', type: 'wall',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: OBJECT_DEFAULTS.wallColor,
    visible: true,
    vertices: verts,
    wallHeight: OBJECT_DEFAULTS.wallHeight,
    wallThickness: OBJECT_DEFAULTS.wallThickness,
  };
}
