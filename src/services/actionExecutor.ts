import { v4 as uuid } from 'uuid';
import { useEditor } from '../store';
import type { LevelObject, PrimitiveType } from '../types';
import type { LevelAction, LLMActionResponse, PlaceRoomIntent } from './levelPrompt';
import { OBJECT_DEFAULTS } from '../constants';

const VALID_TYPES = new Set<string>([
  'box', 'cylinder', 'stairs', 'sphere', 'plane',
  'polygon', 'road', 'wall', 'ramp', 'cliff', 'trim',
]);

const TYPE_COLORS: Partial<Record<PrimitiveType, string>> = {
  plane: OBJECT_DEFAULTS.planeColor,
  polygon: OBJECT_DEFAULTS.polygonColor,
  road: OBJECT_DEFAULTS.roadColor,
  wall: OBJECT_DEFAULTS.wallColor,
  ramp: OBJECT_DEFAULTS.rampColor,
  cliff: OBJECT_DEFAULTS.cliffColor,
  trim: OBJECT_DEFAULTS.trimColor,
};

function cleanJsonString(raw: string): string {
  let s = raw;
  // Remove single-line comments
  s = s.replace(/\/\/[^\n]*/g, '');
  // Remove multi-line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  // Quote unquoted property names: {x: 1} → {"x": 1}
  s = s.replace(/([{,]\s*)([a-zA-Z_$]\w*)\s*:/g, '$1"$2":');
  // Remove trailing commas before } or ]
  s = s.replace(/,\s*([}\]])/g, '$1');
  // Remove ellipsis patterns like "..." or ...
  s = s.replace(/,?\s*"?\.\.\."?\s*,?/g, '');
  // Remove leftover empty array entries
  s = s.replace(/\[\s*,/g, '[');
  s = s.replace(/,\s*\]/g, ']');
  return s;
}

export function parseActionResponse(text: string): LLMActionResponse {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI 응답에서 JSON을 찾을 수 없습니다');

  let jsonStr = match[0];

  function normalize(raw: any): LLMActionResponse {
    const result: LLMActionResponse = {
      actions: Array.isArray(raw.actions) ? raw.actions : [],
      message: raw.message ?? '',
    };
    if (raw.place_room && raw.place_room.intent === 'place_room') {
      result.place_room = raw.place_room as PlaceRoomIntent;
    }
    return result;
  }

  try {
    return normalize(JSON.parse(jsonStr));
  } catch {
    jsonStr = cleanJsonString(jsonStr);
    try {
      return normalize(JSON.parse(jsonStr));
    } catch (e2) {
      throw new Error(`AI 응답 JSON 파싱 실패: ${e2 instanceof Error ? e2.message : 'unknown'}`);
    }
  }
}

export interface ExecutionResult {
  created: number;
  updated: number;
  deleted: number;
  grouped: number;
  message: string;
}

export function executeActions(
  response: LLMActionResponse,
  onProgress?: (count: number, total: number) => void,
): ExecutionResult {
  const { actions, message } = response;
  const store = useEditor.getState;
  const idMap = new Map<string, string>();
  const result: ExecutionResult = { created: 0, updated: 0, deleted: 0, grouped: 0, message: message ?? '' };

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    onProgress?.(i + 1, actions.length);

    switch (action.op) {
      case 'create': {
        const id = executeCreate(action);
        if (id) {
          idMap.set(`$${i}`, id);
          result.created++;
        }
        break;
      }
      case 'update': {
        if (action.id && executeUpdate(action)) result.updated++;
        break;
      }
      case 'delete': {
        if (action.id && executeDelete(action.id)) result.deleted++;
        break;
      }
      case 'group': {
        if (action.name && action.ids) {
          executeGroup(action.name, action.ids, idMap);
          result.grouped++;
        }
        break;
      }
    }
  }

  store().finalizeStream();
  return result;
}

function executeCreate(action: LevelAction): string | null {
  if (!action.type || !VALID_TYPES.has(action.type)) return null;

  const type = action.type as PrimitiveType;
  const id = uuid();
  const defaultColor = TYPE_COLORS[type] ?? OBJECT_DEFAULTS.color;

  const obj: LevelObject = {
    id,
    name: action.name ?? type,
    type,
    position: action.position ? { ...action.position } : { x: 0, y: 0, z: 0 },
    rotation: action.rotation ? { ...action.rotation } : { x: 0, y: 0, z: 0 },
    scale: action.scale ? { ...action.scale } : { x: 1, y: 1, z: 1 },
    color: action.color ?? defaultColor,
    visible: true,
  };

  if (action.vertices && action.vertices.length >= 2) {
    obj.vertices = action.vertices.map((v) => ({ x: v.x, y: v.y ?? 0, z: v.z }));
  }

  if (type === 'wall') {
    obj.wallHeight = action.wallHeight ?? OBJECT_DEFAULTS.wallHeight;
    obj.wallThickness = action.wallThickness ?? OBJECT_DEFAULTS.wallThickness;
  }
  if (type === 'road') {
    obj.roadWidth = action.roadWidth ?? OBJECT_DEFAULTS.roadWidth;
  }
  if (type === 'ramp') {
    obj.rampHeight = action.rampHeight ?? OBJECT_DEFAULTS.rampHeight;
    obj.rampWidth = action.rampWidth ?? OBJECT_DEFAULTS.rampWidth;
  }
  if (type === 'cliff') {
    obj.cliffHeight = action.cliffHeight ?? OBJECT_DEFAULTS.cliffHeight;
    obj.cliffThickness = action.cliffThickness ?? OBJECT_DEFAULTS.cliffThickness;
  }
  if (type === 'trim') {
    obj.trimHeight = action.trimHeight ?? OBJECT_DEFAULTS.trimHeight;
    obj.trimThickness = action.trimThickness ?? OBJECT_DEFAULTS.trimThickness;
  }
  if (type === 'polygon' && action.extrudeHeight) {
    obj.extrudeHeight = action.extrudeHeight;
  }

  useEditor.getState().streamAddObject(obj);
  return id;
}

function executeUpdate(action: LevelAction): boolean {
  const state = useEditor.getState();
  const obj = state.objects.find((o) => o.id === action.id);
  if (!obj) return false;

  const patch: Partial<LevelObject> = {};
  if (action.name !== undefined) patch.name = action.name;
  if (action.color !== undefined) patch.color = action.color;
  if (action.position !== undefined) patch.position = { ...action.position };
  if (action.rotation !== undefined) patch.rotation = { ...action.rotation };
  if (action.scale !== undefined) patch.scale = { ...action.scale };
  if (action.vertices !== undefined) patch.vertices = action.vertices.map((v) => ({ x: v.x, y: v.y ?? 0, z: v.z }));
  if (action.wallHeight !== undefined) patch.wallHeight = action.wallHeight;
  if (action.wallThickness !== undefined) patch.wallThickness = action.wallThickness;
  if (action.roadWidth !== undefined) patch.roadWidth = action.roadWidth;
  if (action.rampHeight !== undefined) patch.rampHeight = action.rampHeight;
  if (action.rampWidth !== undefined) patch.rampWidth = action.rampWidth;
  if (action.cliffHeight !== undefined) patch.cliffHeight = action.cliffHeight;
  if (action.cliffThickness !== undefined) patch.cliffThickness = action.cliffThickness;
  if (action.trimHeight !== undefined) patch.trimHeight = action.trimHeight;
  if (action.trimThickness !== undefined) patch.trimThickness = action.trimThickness;
  if (action.extrudeHeight !== undefined) patch.extrudeHeight = action.extrudeHeight;

  if (Object.keys(patch).length === 0) return false;
  state.updateObject(action.id!, patch);
  return true;
}

function executeDelete(id: string): boolean {
  const state = useEditor.getState();
  const exists = state.objects.some((o) => o.id === id);
  if (!exists) return false;
  state.removeObject(id);
  return true;
}

function executeGroup(name: string, ids: string[], idMap: Map<string, string>): void {
  const resolvedIds = ids.map((ref) => {
    if (ref.startsWith('$')) return idMap.get(ref) ?? ref;
    return ref;
  }).filter(Boolean);

  if (resolvedIds.length > 0) {
    useEditor.getState().createGroup(name, resolvedIds);
  }
}
