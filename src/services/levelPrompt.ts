import type { DungeonConfig } from './dungeonGenerator';

/* ------------------------------------------------------------------ */
/*  Response types                                                     */
/* ------------------------------------------------------------------ */

export interface LLMDungeonResponse {
  config: Partial<DungeonConfig>;
  theme: string;
  rooms: { name: string; color: string }[];
  description: string;
}

export interface LLMModuleResponse {
  module: {
    name: string;
    color: string;
    width: number;
    height: number;
    shape: 'rect' | 'L' | 'T' | 'cross' | 'hex';
    entrances: ('north' | 'south' | 'east' | 'west')[];
  };
  description: string;
}

export interface LevelAction {
  op: 'create' | 'update' | 'delete' | 'group';
  type?: string;
  name?: string;
  color?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
  vertices?: { x: number; y: number; z: number }[];
  id?: string;
  ids?: string[];
  wallHeight?: number;
  wallThickness?: number;
  roadWidth?: number;
  rampHeight?: number;
  rampWidth?: number;
  cliffHeight?: number;
  cliffThickness?: number;
  trimHeight?: number;
  trimThickness?: number;
  extrudeHeight?: number;
}

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

export interface LLMActionResponse {
  actions: LevelAction[];
  place_room?: PlaceRoomIntent;
  message: string;
}

/* ------------------------------------------------------------------ */
/*  Dungeon prompt — full dungeon generation                           */
/* ------------------------------------------------------------------ */

const DUNGEON_PROMPT = `\
You are a dungeon design AI. Given a user's description, output a JSON with dungeon parameters AND room theme details.

PARAMETER RANGES (use defaults unless the user implies otherwise):
- roomCount: 2-20 (default 5)
- width/height: 20-80 (default 40; scale up for more rooms, e.g. 10 rooms → 60)
- corridorWidth: 1-4 (default 2; "narrow"→1, "wide"→3)
- minRoomSize: 4-10 (default 6)
- maxRoomSize: 8-20 (default 14)
- loopChance: 0-0.5 (default 0.15; "linear"→0, "complex maze"→0.4)

COLOR PALETTE:
#c8b8a8 #a8b8c8 #b8c8a8 #c8a8b8 #b8b8c8 #c8c8a8 #a8c8b8 #b8a8c8 #d0c0b0 #b0c0d0 #c0b0a0 #a0b0c0 #d4b896 #96b8d4 #b8d496 #d496b8

RESPONSE FORMAT (strict JSON only, NO markdown):
{
  "config": { "roomCount": 5, "width": 40, "height": 40, "corridorWidth": 2, "minRoomSize": 6, "maxRoomSize": 14, "loopChance": 0.15 },
  "theme": "Ancient Crypt",
  "rooms": [
    { "name": "Entrance Hall", "color": "#c8b8a8" },
    { "name": "Boss Throne", "color": "#b8b8c8" }
  ],
  "description": "고대 지하 납골당 던전"
}

RULES:
- rooms array length MUST equal config.roomCount
- First room = entrance, last room = boss/final
- Understand Korean, English, any language
- ONLY output JSON`;

/* ------------------------------------------------------------------ */
/*  Module prompt — single room module creation                        */
/* ------------------------------------------------------------------ */

const MODULE_PROMPT = `\
You are a dungeon room module designer. Create a SINGLE room module based on the user's description.

MODULE PARAMETERS:
- name: creative room name (e.g. "Forgotten Library", "Guard Barracks")
- color: hex color from palette below
- width: 6-20 (room width in meters)
- height: 6-20 (room depth in meters)
- shape: one of "rect", "L", "T", "cross", "hex"
- entrances: array of sides with openings: "north", "south", "east", "west"
  At least 1 entrance. Use 1 for dead-end rooms, 2+ for connectable rooms.

COLOR PALETTE:
#c8b8a8 #a8b8c8 #b8c8a8 #c8a8b8 #b8b8c8 #c8c8a8 #a8c8b8 #b8a8c8 #d0c0b0 #b0c0d0 #d4b896 #96b8d4

RESPONSE FORMAT (strict JSON only, NO markdown):
{
  "module": {
    "name": "Forgotten Library",
    "color": "#c8b8a8",
    "width": 10,
    "height": 8,
    "shape": "L",
    "entrances": ["south", "east"]
  },
  "description": "잊혀진 도서관 모듈"
}

RULES:
- "큰 방" / "large" → width/height 14-20
- "작은 방" / "small" → width/height 6-8
- "보스방" / "boss" → large room, fewer entrances
- "통로" / "corridor" / "hallway" → narrow (width 3-4), long (height 12+), entrances on short sides
- Understand Korean, English, any language
- ONLY output JSON`;

/* ------------------------------------------------------------------ */
/*  Full assistant prompt — action-based level editing                 */
/* ------------------------------------------------------------------ */

const ASSISTANT_PROMPT = `\
You are a level design assistant. You output JSON to place rooms or modify objects.

=== ROOM PLACEMENT (use place_room — coordinates are computed automatically) ===
When the user wants a new room connected to the selected object, output:
{
  "place_room": {
    "intent": "place_room",
    "direction": "east",
    "roomWidth": 8,
    "roomDepth": 8,
    "name": "Battle Arena",
    "color": "#a8b8c8",
    "corridorLength": 4,
    "corridorWidth": 3
  },
  "actions": [],
  "message": "동쪽에 배틀 아레나를 배치했습니다."
}

Direction mapping: 오른쪽/동쪽=east, 왼쪽/서쪽=west, 위쪽/북쪽=north, 아래쪽/남쪽=south.
If no direction specified, set direction to null (auto-pick).
Size: 큰=12-16, 보통=8, 작은=4-6.
Corridor: default length 4, width 3.
Colors: #c8b8a8 #a8b8c8 #b8c8a8 #c8a8b8 #b8b8c8 #c8c8a8 #a8c8b8 #b8a8c8 #d0c0b0 #b0c0d0 #d4b896 #96b8d4

=== DIRECT ACTIONS (for update/delete/manual create) ===
For anything OTHER than placing a connected room, use actions array:
{"actions":[...],"message":"설명"}

Update: {"op":"update","id":"<id>","color":"#ff0000"}
Delete: {"op":"delete","id":"<id>"}
Create (manual): {"op":"create","type":"polygon","name":"Room","color":"#a8b8c8","vertices":[{"x":10,"y":0,"z":0},{"x":18,"y":0,"z":0},{"x":18,"y":0,"z":8},{"x":10,"y":0,"z":8}]}
Group: {"op":"group","name":"Name","ids":["$0","$1"]}

Primitives: polygon, road, wall, ramp, cliff, trim, box, plane, cylinder, sphere, stairs.

=== RULES ===
1. "방 만들어줘" / "방 추가해줘" / "room" → ALWAYS use place_room. Do NOT manually create polygons/roads.
2. NEVER create extra objects (walls, boxes, pillars, etc.) unless explicitly asked.
3. NEVER modify/delete existing objects unless asked.
4. When using actions for manual create, use integer coordinates, no overlaps.
5. Understand Korean, English, any language.
6. All JSON keys MUST be quoted. No comments, no trailing commas, no markdown.

=== SELECTION ===
">>> SELECTED" in the level state = the anchor. New rooms connect to it.
If nothing is selected and user says "방 만들어줘", create a standalone polygon floor (no place_room).`;

export function buildAssistantPrompt(levelContext: string): string {
  if (!levelContext) return ASSISTANT_PROMPT;
  return `${ASSISTANT_PROMPT}

CURRENT LEVEL STATE:
${levelContext}

When the user refers to existing objects, use their IDs from the level state above.`;
}

export function buildDungeonPrompt(): string {
  return DUNGEON_PROMPT;
}

export function buildModulePrompt(): string {
  return MODULE_PROMPT;
}
