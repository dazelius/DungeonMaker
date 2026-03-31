/** Centralized constants — no magic numbers elsewhere */

export const SCENE_COLORS = {
  bg: 0x1a1a1a,
  gridCenter: 0x333333,
  grid: 0x222222,
  axisX: 0x884444,
  axisZ: 0x444488,
  selectEmissive: 0x1a6dd4,
  hoverEmissive: 0x0e3d6e,
  measure: 0xffaa00,
  ghost: 0x44aaff,
  drawDot: 0x22cc66,
  drawLine: 0x22cc66,
  drawClose: 0xffcc00,
  roadPreview: 0xee8833,
  wallPreview: 0x55aadd,
  edgeHighlight: 0xffdd44,
  rampPreview: 0xccaa44,
  cliffPreview: 0x886644,
  trimPreview: 0x66aaaa,
} as const;

export const OBJECT_DEFAULTS = {
  color: '#d0d0d0',
  planeColor: '#b0b0b0',
  polygonColor: '#b0b0b0',
  roadColor: '#a0a0a0',
  wallColor: '#c8c8c8',
  rampColor: '#c8b888',
  cliffColor: '#8b7355',
  roadWidth: 3,
  wallHeight: 3,
  wallThickness: 0.2,
  rampHeight: 3,
  rampWidth: 2,
  cliffHeight: 3,
  cliffThickness: 0.2,
  trimColor: '#a0b0b0',
  trimHeight: 1,
  trimThickness: 0.5,
} as const;

export const EDITOR = {
  closeThreshold: 0.6,
  extrudeSensitivity: 0.02,
  polyThin: 0.05,
  orthoSize: 15,
  orthoHeight: 50,
  maxUndoStack: 50,
  defaultGridSize: 1,
  minGridSize: 0.1,
  groundPlaneSize: 400,
  gridExtent: 100,
  defaultCameraPos: { x: 8, y: 6, z: 8 } as const,
  stairSteps: 4,
  cylinderSegments: 24,
  sphereWidthSegments: 24,
  sphereHeightSegments: 16,
  planeSize: 4,
  snapRotationDeg: 15,
  snapScaleStep: 0.25,
  roadSegmentsPerPoint: 10,
} as const;

export const GEOMETRY = {
  polyThin: 0.05,
  vertexDedupeEps: 0.001,
} as const;

export const VERTEX_EDIT = {
  handleRadius: 0.25,
  handleColor: 0xee8833,
  handleHoverColor: 0x22cc66,
  handleDragColor: 0xff4444,
  lineColor: 0xee8833,
  lineOpacity: 0.6,
} as const;

export const PLAY = {
  moveSpeed: 5,
  sprintMultiplier: 1.8,
  jumpForce: 6,
  gravity: -15,
  mouseSensitivity: 0.002,
  playerRadius: 0.3,
  playerHeight: 1.8,
  eyeHeight: 1.6,
  thirdPersonDist: 8,
  thirdPersonAngle: 45,
  thirdPersonHeight: 6,
  clickMoveSpeed: 6,
  capsuleColor: 0x4488ff,
  groundY: -100,
} as const;
