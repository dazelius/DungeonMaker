export type PrimitiveType = 'box' | 'cylinder' | 'stairs' | 'sphere' | 'plane' | 'polygon' | 'road' | 'wall';

export type TransformMode = 'select' | 'translate' | 'rotate' | 'scale';

export type PlayCameraMode = '3rd' | '1st';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface LevelObject {
  id: string;
  name: string;
  type: PrimitiveType;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
  visible: boolean;
  vertices?: Vec3[];
  extrudeHeight?: number;
  roadWidth?: number;
  wallHeight?: number;
  wallThickness?: number;
}

export interface LevelProject {
  name: string;
  gridSize: number;
  objects: LevelObject[];
}

export interface Command {
  execute(): void;
  undo(): void;
}
