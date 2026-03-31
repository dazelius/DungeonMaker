import type { Vec3 } from '../types';

interface PatternObject {
  type: 'polygon';
  name: string;
  vertices: Vec3[];
  color: string;
}

export interface DungeonPattern {
  name: string;
  description: string;
  tags: string[];
  objects: PatternObject[];
}

function v(x: number, z: number): Vec3 {
  return { x, y: 0, z };
}

export const DUNGEON_PATTERNS: DungeonPattern[] = [

  // ── Hub: central room with corridors radiating to chambers ──
  {
    name: 'Hub Dungeon',
    description: 'Central hall with north and east corridors leading to distinct chambers',
    tags: ['hub', 'central', 'radial', 'crossroads', '허브', '중앙', '방사'],
    objects: [
      {
        type: 'polygon', name: 'Central Hall',
        vertices: [
          v(-5,-4), v(-1,-4), v(1,-4), v(5,-4),
          v(5,-1), v(5,1),
          v(5,4), v(1,4), v(-1,4), v(-5,4),
        ],
        color: '#c8b8a8',
      },
      {
        type: 'polygon', name: 'North Passage',
        vertices: [v(-1,-4), v(1,-4), v(1,-7), v(-1,-7)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'East Passage',
        vertices: [v(5,-1), v(5,1), v(9,1), v(9,-1)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'North Chamber',
        vertices: [v(-5,-7), v(-1,-7), v(1,-7), v(5,-7), v(4,-13), v(-4,-13)],
        color: '#a8b8c8',
      },
      {
        type: 'polygon', name: 'East Chamber',
        vertices: [v(9,-3), v(9,-1), v(9,1), v(9,3), v(15,2), v(15,-2)],
        color: '#b8c8a8',
      },
    ],
  },

  // ── Linear: rooms connected in sequence by corridors ──
  {
    name: 'Linear Dungeon',
    description: 'Entry hall through guard room to boss chamber, connected by narrow passages',
    tags: ['linear', 'sequence', 'gauntlet', '선형', '직선', '일자'],
    objects: [
      {
        type: 'polygon', name: 'Entry Hall',
        vertices: [
          v(0,0), v(8,0), v(8,1), v(8,3), v(8,6), v(3,6), v(3,3), v(0,3),
        ],
        color: '#c8b8a8',
      },
      {
        type: 'polygon', name: 'First Passage',
        vertices: [v(8,1), v(8,3), v(12,3), v(12,1)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'Guard Room',
        vertices: [
          v(12,-1), v(12,1), v(12,3), v(12,5),
          v(20,5), v(20,3), v(20,1), v(20,-1),
        ],
        color: '#a8b8c8',
      },
      {
        type: 'polygon', name: 'Second Passage',
        vertices: [v(20,1), v(20,3), v(24,3), v(24,1)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'Boss Chamber',
        vertices: [v(24,-2), v(24,1), v(24,3), v(24,6), v(32,5), v(32,-1)],
        color: '#c8a8b8',
      },
    ],
  },

  // ── Loop: rooms forming a circular path ──
  {
    name: 'Loop Dungeon',
    description: 'Four rooms at corners connected by corridors forming a ring — players can circle back',
    tags: ['loop', 'ring', 'circular', '루프', '순환', '원형'],
    objects: [
      {
        type: 'polygon', name: 'NW Room',
        vertices: [
          v(-10,-10), v(-5,-10), v(-5,-8), v(-5,-6), v(-5,-5),
          v(-6,-5), v(-8,-5), v(-10,-5),
        ],
        color: '#c8b8a8',
      },
      {
        type: 'polygon', name: 'NE Room',
        vertices: [
          v(5,-10), v(10,-10), v(10,-5), v(8,-5), v(6,-5),
          v(5,-5), v(5,-6), v(5,-8),
        ],
        color: '#a8b8c8',
      },
      {
        type: 'polygon', name: 'SE Room',
        vertices: [
          v(5,5), v(5,6), v(5,8), v(5,10),
          v(10,10), v(10,5), v(8,5), v(6,5),
        ],
        color: '#b8c8a8',
      },
      {
        type: 'polygon', name: 'SW Room',
        vertices: [
          v(-10,5), v(-8,5), v(-6,5), v(-5,5),
          v(-5,6), v(-5,8), v(-5,10), v(-10,10),
        ],
        color: '#c8a8b8',
      },
      {
        type: 'polygon', name: 'North Corridor',
        vertices: [v(-5,-8), v(-5,-6), v(5,-6), v(5,-8)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'East Corridor',
        vertices: [v(8,-5), v(6,-5), v(6,5), v(8,5)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'South Corridor',
        vertices: [v(5,8), v(5,6), v(-5,6), v(-5,8)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'West Corridor',
        vertices: [v(-8,5), v(-6,5), v(-6,-5), v(-8,-5)],
        color: '#a0a0a0',
      },
    ],
  },

  // ── Branching: spine corridor with rooms on sides ──
  {
    name: 'Branching Dungeon',
    description: 'Long spine corridor with rooms branching off to the south, north, and east end',
    tags: ['branch', 'spine', 'corridor', '가지', '분기', '복도'],
    objects: [
      {
        type: 'polygon', name: 'Spine Corridor',
        vertices: [
          v(0,-1), v(0,1),
          v(6,1), v(8,1),
          v(14,1), v(16,1),
          v(20,1), v(20,-1),
          v(16,-1), v(14,-1),
          v(8,-1), v(6,-1),
        ],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'South Chamber',
        vertices: [v(6,-1), v(8,-1), v(10,-5), v(7,-8), v(4,-5)],
        color: '#c8b8a8',
      },
      {
        type: 'polygon', name: 'North Alcove',
        vertices: [v(14,1), v(16,1), v(18,5), v(12,5)],
        color: '#a8b8c8',
      },
      {
        type: 'polygon', name: 'East Hall',
        vertices: [v(20,-3), v(20,-1), v(20,1), v(20,3), v(28,3), v(28,-3)],
        color: '#b8c8a8',
      },
    ],
  },

  // ── Irregular Cavern: organic shapes with narrow passages ──
  {
    name: 'Irregular Cavern',
    description: 'Organic cave chambers connected by winding narrow passages',
    tags: ['cavern', 'cave', 'organic', 'irregular', '동굴', '자연', '비정형'],
    objects: [
      {
        type: 'polygon', name: 'Entrance Grotto',
        vertices: [v(0,0), v(6,-2), v(8,2), v(7,6), v(4,6), v(2,7), v(-1,4)],
        color: '#c8b8a8',
      },
      {
        type: 'polygon', name: 'First Squeeze',
        vertices: [v(4,6), v(7,6), v(9,10), v(6,10)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'Crystal Chamber',
        vertices: [v(6,10), v(9,10), v(11,9), v(14,12), v(10,15), v(4,14)],
        color: '#b8b8c8',
      },
      {
        type: 'polygon', name: 'Second Squeeze',
        vertices: [v(14,12), v(10,15), v(12,19), v(16,16)],
        color: '#a0a0a0',
      },
      {
        type: 'polygon', name: 'Deep Cavern',
        vertices: [v(12,19), v(16,16), v(20,18), v(22,22), v(16,24), v(10,22)],
        color: '#c8c8a8',
      },
    ],
  },
];

export function patternToJson(pattern: DungeonPattern): string {
  const objects = pattern.objects.map((obj) => ({
    type: obj.type,
    name: obj.name,
    vertices: obj.vertices,
    color: obj.color,
  }));
  return JSON.stringify({ objects, remove: [], description: pattern.description }, null, 2);
}

export function findPatternsByKeywords(text: string): DungeonPattern[] {
  const lower = text.toLowerCase();
  const scored = DUNGEON_PATTERNS.map((p) => {
    const hits = p.tags.filter((t) => lower.includes(t)).length;
    return { pattern: p, hits };
  });
  scored.sort((a, b) => b.hits - a.hits);
  return scored.filter((s) => s.hits > 0).map((s) => s.pattern);
}
