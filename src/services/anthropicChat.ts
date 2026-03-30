import { v4 as uuid } from 'uuid';
import type { LevelObject, PrimitiveType } from '../types';
import { buildSystemPrompt } from './levelPrompt';
import { OBJECT_DEFAULTS } from '../constants';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiLevelResponse {
  objects: LevelObject[];
  remove: string[];
  description: string;
}

const VALID_TYPES = new Set<PrimitiveType>([
  'box', 'cylinder', 'stairs', 'sphere', 'plane', 'polygon', 'road', 'wall',
]);

const API_PATH = '/api/anthropic/v1/messages';

export async function streamChatMessage(
  apiKey: string,
  history: ChatMessage[],
  sceneObjects: LevelObject[],
  onText: (accumulated: string) => void,
  onObject?: (obj: LevelObject) => void,
): Promise<AiLevelResponse> {
  const systemPrompt = buildSystemPrompt(sceneObjects);

  const messages = history.map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  const resp = await fetch(API_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';
  let emittedCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);
        if (event.type === 'content_block_delta' && event.delta?.text) {
          accumulated += event.delta.text;
          onText(accumulated);

          if (onObject) {
            const newObjs = extractCompleteObjects(accumulated, emittedCount);
            for (const obj of newObjs) {
              onObject(obj);
              emittedCount++;
            }
          }
        }
      } catch { /* skip malformed SSE lines */ }
    }
  }

  if (!accumulated) throw new Error('Empty response from API');
  return parseResponse(accumulated);
}

function parseResponse(raw: string): AiLevelResponse {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in AI response');

  let parsed: { objects?: unknown[]; remove?: string[]; description?: string };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error('Failed to parse AI response JSON');
  }

  const description = typeof parsed.description === 'string' ? parsed.description : 'Objects generated';
  const remove = Array.isArray(parsed.remove)
    ? parsed.remove.filter((id): id is string => typeof id === 'string')
    : [];

  const objects: LevelObject[] = [];
  if (Array.isArray(parsed.objects)) {
    for (const raw of parsed.objects) {
      const obj = normalizeObject(raw);
      if (obj) objects.push(obj);
    }
  }

  return { objects, remove, description };
}

function normalizeObject(raw: unknown): LevelObject | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  const type = r.type as string;
  if (!VALID_TYPES.has(type as PrimitiveType)) return null;

  const pType = type as PrimitiveType;

  const colorForType = pType === 'plane' ? OBJECT_DEFAULTS.planeColor
    : pType === 'polygon' ? OBJECT_DEFAULTS.polygonColor
    : pType === 'road' ? OBJECT_DEFAULTS.roadColor
    : pType === 'wall' ? OBJECT_DEFAULTS.wallColor
    : OBJECT_DEFAULTS.color;

  const obj: LevelObject = {
    id: uuid(),
    name: typeof r.name === 'string' ? r.name : pType,
    type: pType,
    position: toVec3(r.position, { x: 0, y: 0, z: 0 }),
    rotation: toVec3(r.rotation, { x: 0, y: 0, z: 0 }),
    scale: toVec3(r.scale, { x: 1, y: 1, z: 1 }),
    color: typeof r.color === 'string' ? r.color : colorForType,
    visible: true,
  };

  if (Array.isArray(r.vertices)) {
    obj.vertices = r.vertices
      .map((v) => toVec3(v, null))
      .filter((v): v is { x: number; y: number; z: number } => v !== null);
    if (obj.vertices.length < 2) obj.vertices = undefined;
  }

  if (typeof r.extrudeHeight === 'number') obj.extrudeHeight = Math.max(0, r.extrudeHeight);
  if (typeof r.roadWidth === 'number') obj.roadWidth = Math.max(0.5, r.roadWidth);
  if (typeof r.wallHeight === 'number') obj.wallHeight = Math.max(0.1, r.wallHeight);
  if (typeof r.wallThickness === 'number') obj.wallThickness = Math.max(0.05, r.wallThickness);

  if ((pType === 'polygon' || pType === 'road' || pType === 'wall') && !obj.vertices) {
    return null;
  }

  return obj;
}

function toVec3(v: unknown, fallback: { x: number; y: number; z: number }): { x: number; y: number; z: number };
function toVec3(v: unknown, fallback: null): { x: number; y: number; z: number } | null;
function toVec3(v: unknown, fallback: { x: number; y: number; z: number } | null) {
  if (!v || typeof v !== 'object') return fallback;
  const o = v as Record<string, unknown>;
  const x = typeof o.x === 'number' ? o.x : 0;
  const y = typeof o.y === 'number' ? o.y : 0;
  const z = typeof o.z === 'number' ? o.z : 0;
  return { x, y, z };
}

function extractCompleteObjects(text: string, alreadyEmitted: number): LevelObject[] {
  const arrMatch = text.match(/"objects"\s*:\s*\[/);
  if (!arrMatch || arrMatch.index === undefined) return [];

  const startIdx = arrMatch.index + arrMatch[0].length;
  const rawStrings: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];

    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        rawStrings.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }
  }

  const newResults: LevelObject[] = [];
  for (let j = alreadyEmitted; j < rawStrings.length; j++) {
    try {
      const raw = JSON.parse(rawStrings[j]);
      const obj = normalizeObject(raw);
      if (obj) newResults.push(obj);
    } catch { /* incomplete JSON, skip */ }
  }
  return newResults;
}
