import { v4 as uuid } from 'uuid';
import type { LevelObject, Vec3 } from '../types';
import { OBJECT_DEFAULTS } from '../constants';
import { computeFreeEdges, isFootprintOverlapping, type FreeEdge } from '../utils/freeEdge';

export interface PlaceRoomIntent {
  intent: 'place_room';
  direction?: 'north' | 'south' | 'east' | 'west' | null;
  roomWidth?: number;
  roomDepth?: number;
  name?: string;
  color?: string;
  corridorLength?: number;
  corridorWidth?: number;
}

export interface PlaceResult {
  objects: LevelObject[];
  message: string;
}

type Dir = 'north' | 'south' | 'east' | 'west';

function r(n: number): number { return Math.round(n * 10) / 10; }
function ri(n: number): number { return Math.round(n); }

function pickEdge(edges: FreeEdge[], direction: Dir | null | undefined): FreeEdge | null {
  if (edges.length === 0) return null;
  if (direction) {
    const match = edges.find((e) => e.label === direction);
    if (match) return match;
  }
  return edges[0];
}

function makePolygonVertices(
  cx: number, cz: number, w: number, d: number, y: number,
): Vec3[] {
  const hw = w / 2, hd = d / 2;
  return [
    { x: ri(cx - hw), y, z: ri(cz - hd) },
    { x: ri(cx + hw), y, z: ri(cz - hd) },
    { x: ri(cx + hw), y, z: ri(cz + hd) },
    { x: ri(cx - hw), y, z: ri(cz + hd) },
  ];
}

export function placeRoom(
  selectedObj: LevelObject,
  allObjects: LevelObject[],
  params: PlaceRoomIntent,
): PlaceResult {
  const roomW = params.roomWidth ?? 8;
  const roomD = params.roomDepth ?? 8;
  const corrLen = params.corridorLength ?? 4;
  const corrW = params.corridorWidth ?? 3;
  const roomName = params.name ?? 'New Room';
  const roomColor = params.color ?? '#a8b8c8';
  const y = selectedObj.position.y;

  const freeEdges = computeFreeEdges(selectedObj, allObjects);
  const edge = pickEdge(freeEdges, params.direction);

  if (!edge) {
    return { objects: [], message: '연결 가능한 free edge가 없습니다.' };
  }

  const nx = edge.normal.x;
  const nz = edge.normal.z;
  const mx = edge.midpoint.x;
  const mz = edge.midpoint.z;

  const roomCenterDist = 0.5 + corrLen + (Math.abs(nx) > Math.abs(nz) ? roomW / 2 : roomD / 2);
  const roomCx = ri(mx + nx * roomCenterDist);
  const roomCz = ri(mz + nz * roomCenterDist);

  const hw = roomW / 2, hd = roomD / 2;
  const rMinX = roomCx - hw;
  const rMaxX = roomCx + hw;
  const rMinZ = roomCz - hd;
  const rMaxZ = roomCz + hd;

  if (isFootprintOverlapping(rMinX, rMaxX, rMinZ, rMaxZ, allObjects)) {
    const shrinkW = Math.max(4, roomW - 2);
    const shrinkD = Math.max(4, roomD - 2);
    const shw = shrinkW / 2, shd = shrinkD / 2;
    if (isFootprintOverlapping(roomCx - shw, roomCx + shw, roomCz - shd, roomCz + shd, allObjects)) {
      return { objects: [], message: `${edge.label}쪽 방향에 공간이 부족합니다. 다른 방향을 시도해 주세요.` };
    }
    return placeWithDims(selectedObj, edge, shrinkW, shrinkD, corrLen, corrW, roomName, roomColor, y);
  }

  return placeWithDims(selectedObj, edge, roomW, roomD, corrLen, corrW, roomName, roomColor, y);
}

function placeWithDims(
  _selectedObj: LevelObject,
  edge: FreeEdge,
  roomW: number, roomD: number,
  corrLen: number, corrW: number,
  roomName: string, roomColor: string,
  y: number,
): PlaceResult {
  const nx = edge.normal.x;
  const nz = edge.normal.z;
  const mx = edge.midpoint.x;
  const mz = edge.midpoint.z;

  const roadStart: Vec3 = { x: r(mx + nx * 0.5), y, z: r(mz + nz * 0.5) };
  const roadEnd: Vec3 = { x: r(mx + nx * (0.5 + corrLen)), y, z: r(mz + nz * (0.5 + corrLen)) };

  const roomCenterDist = 0.5 + corrLen + (Math.abs(nx) > Math.abs(nz) ? roomW / 2 : roomD / 2);
  const roomCx = ri(mx + nx * roomCenterDist);
  const roomCz = ri(mz + nz * roomCenterDist);

  const road: LevelObject = {
    id: uuid(),
    name: `${roomName} Corridor`,
    type: 'road',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: OBJECT_DEFAULTS.roadColor,
    visible: true,
    vertices: [roadStart, roadEnd],
    roadWidth: corrW,
  };

  const polygon: LevelObject = {
    id: uuid(),
    name: roomName,
    type: 'polygon',
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    color: roomColor,
    visible: true,
    vertices: makePolygonVertices(roomCx, roomCz, roomW, roomD, y),
  };

  const dirLabel = edge.label === 'north' ? '북' : edge.label === 'south' ? '남' : edge.label === 'east' ? '동' : '서';
  return {
    objects: [road, polygon],
    message: `${dirLabel}쪽에 "${roomName}" (${roomW}x${roomD})을 배치했습니다.`,
  };
}
