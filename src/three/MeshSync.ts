import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { LevelObject } from '../types';
import { createGeometry, createPolygonGeometry, createRoadGeometry, createWallGeometry, createCurvedWallGeometry, createRampGeometry, createCliffGeometry } from './primitiveGeometry';
import { getCheckerTexture } from './checkerTexture';
import { SCENE_COLORS, EDITOR, OBJECT_DEFAULTS } from '../constants';
import type { SceneContext } from './SceneSetup';

export function syncMeshes(ctx: SceneContext, objects: LevelObject[], selectedIds: string[], floorY = 0, floorIsolate = false): void {
  const selSet = new Set(selectedIds);
  const existingIds = new Set<string>();
  const { meshMap, scene, transformControls } = ctx;
  const tcDragging = (transformControls as any).dragging;
  const tcMesh = transformControls.object;

  for (const obj of objects) {
    existingIds.add(obj.id);
    let mesh = meshMap.get(obj.id);
    const vHash = getVertexHash(obj);
    const needsRebuild = !mesh
      || mesh.userData.primType !== obj.type
      || ((obj.type === 'polygon' || obj.type === 'road' || obj.type === 'wall' || obj.type === 'ramp' || obj.type === 'cliff' || obj.type === 'trim') && mesh.userData.vertexHash !== vHash);
    if (needsRebuild) {
      if (mesh) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      mesh = createMesh(obj);
      scene.add(mesh);
      meshMap.set(obj.id, mesh);
    }
    if (!(tcDragging && mesh === tcMesh)) {
      applyTransform(mesh!, obj);
    }
    const mat = mesh!.material as THREE.MeshStandardMaterial;
    mat.color.set(obj.color);
    mat.emissive.setHex(selSet.has(obj.id) ? SCENE_COLORS.selectEmissive : 0x000000);
    mesh!.visible = obj.visible;

    if (floorIsolate) {
      const baseY = getObjectBaseY(obj);
      const onFloor = Math.abs(baseY - floorY) < 1.5;
      const targetOpacity = onFloor ? 1.0 : 0.15;
      if (mat.opacity !== targetOpacity) {
        mat.opacity = targetOpacity;
        mat.transparent = targetOpacity < 1;
        mat.needsUpdate = true;
      }
      mesh!.renderOrder = onFloor ? 0 : -1;
    } else if (mat.opacity !== 1) {
      mat.opacity = 1;
      mat.transparent = false;
      mat.needsUpdate = true;
      mesh!.renderOrder = 0;
    }
  }

  for (const [id, mesh] of meshMap) {
    if (!existingIds.has(id)) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      meshMap.delete(id);
    }
  }

  syncLabels(ctx, objects);
}

const BAKED_TYPES = new Set(['polygon', 'road', 'wall', 'ramp', 'cliff', 'trim']);

function getObjectBaseY(obj: LevelObject): number {
  if (obj.vertices && obj.vertices.length > 0) {
    let minY = Infinity;
    for (const v of obj.vertices) minY = Math.min(minY, v.y ?? 0);
    return minY + obj.position.y;
  }
  return obj.position.y;
}

function getVertexCenter(obj: LevelObject): { x: number; y: number; z: number } | null {
  if (!obj.vertices || obj.vertices.length < 2) return null;
  let cx = 0, cy = 0, cz = 0;
  for (const v of obj.vertices) {
    cx += v.x;
    cy += (v.y ?? 0);
    cz += v.z;
  }
  const n = obj.vertices.length;
  return { x: cx / n, y: cy / n, z: cz / n };
}

export function syncGizmo(
  ctx: SceneContext,
  primaryId: string | null,
  transformMode: string,
  snapEnabled: boolean,
  gridSize: number,
  objects: LevelObject[],
): void {
  const { transformControls, meshMap, gizmoPivot } = ctx;
  if (transformMode === 'select') {
    transformControls.detach();
    return;
  }
  if (primaryId) {
    const levelObj = objects.find((o) => o.id === primaryId);
    const mesh = meshMap.get(primaryId);
    const isBaked = levelObj && BAKED_TYPES.has(levelObj.type) && levelObj.vertices && levelObj.vertices.length >= 2;

    if (isBaked && levelObj) {
      const vc = getVertexCenter(levelObj)!;
      gizmoPivot.userData.levelObjectId = primaryId;
      gizmoPivot.userData.isBakedPivot = true;
      gizmoPivot.userData.vertexCenter = vc;
      const tcDragging = (transformControls as any).dragging;
      if (!tcDragging || transformControls.object !== gizmoPivot) {
        gizmoPivot.position.set(
          vc.x + levelObj.position.x,
          vc.y + levelObj.position.y,
          vc.z + levelObj.position.z,
        );
      }
      if (transformControls.object !== gizmoPivot) {
        transformControls.attach(gizmoPivot);
      }
    } else if (mesh) {
      gizmoPivot.userData.isBakedPivot = false;
      if (transformControls.object !== mesh) {
        transformControls.attach(mesh);
      }
    }
  } else {
    transformControls.detach();
  }
  transformControls.setMode(transformMode as 'translate' | 'rotate' | 'scale');
  transformControls.setTranslationSnap(snapEnabled ? gridSize : null);
  transformControls.setRotationSnap(snapEnabled ? THREE.MathUtils.degToRad(EDITOR.snapRotationDeg) : null);
  transformControls.setScaleSnap(snapEnabled ? EDITOR.snapScaleStep : null);
}

export function syncGrid(ctx: SceneContext, gridSize: number, floorY = 0): void {
  const needsRebuild = ctx.gridHelper.userData.lastGrid !== gridSize;
  if (needsRebuild) {
    const extent = EDITOR.gridExtent;
    const totalSize = extent * 2;
    const divisions = Math.round(totalSize / gridSize);
    ctx.scene.remove(ctx.gridHelper);
    const newGrid = new THREE.GridHelper(totalSize, divisions, SCENE_COLORS.gridCenter, SCENE_COLORS.grid);
    newGrid.userData.lastGrid = gridSize;
    newGrid.position.y = floorY;
    ctx.scene.add(newGrid);
    ctx.gridHelper = newGrid;
  } else if (ctx.gridHelper.position.y !== floorY) {
    ctx.gridHelper.position.y = floorY;
  }
}

function getVertexHash(obj: LevelObject): string {
  if (obj.type === 'polygon') return `${JSON.stringify(obj.vertices)}|${obj.extrudeHeight ?? 0}`;
  if (obj.type === 'road') return `${JSON.stringify(obj.vertices)}|${obj.roadWidth ?? 0}`;
  if (obj.type === 'wall') return `${JSON.stringify(obj.vertices)}|${obj.wallHeight ?? 0}|${obj.wallThickness ?? 0}`;
  if (obj.type === 'ramp') return `${JSON.stringify(obj.vertices)}|${obj.rampWidth ?? 0}|${obj.rampHeight ?? 0}`;
  if (obj.type === 'cliff') return `${JSON.stringify(obj.vertices)}|${obj.cliffHeight ?? 0}|${obj.cliffThickness ?? 0}`;
  if (obj.type === 'trim') return `${JSON.stringify(obj.vertices)}|${obj.trimHeight ?? 0}|${obj.trimThickness ?? 0}`;
  return '';
}

function getGeometry(obj: LevelObject): THREE.BufferGeometry {
  if (obj.type === 'polygon' && obj.vertices && obj.vertices.length >= 3) {
    return createPolygonGeometry(obj.vertices, obj.extrudeHeight ?? 0);
  }
  if (obj.type === 'road' && obj.vertices && obj.vertices.length >= 2) {
    return createRoadGeometry(obj.vertices, obj.roadWidth ?? 3);
  }
  if (obj.type === 'wall' && obj.vertices && obj.vertices.length >= 3) {
    return createCurvedWallGeometry(obj.vertices, obj.wallHeight ?? 3, obj.wallThickness ?? 0.2);
  }
  if (obj.type === 'wall' && obj.vertices && obj.vertices.length === 2) {
    return createWallGeometry(obj.vertices[0], obj.vertices[1], obj.wallHeight ?? 3, obj.wallThickness ?? 0.2);
  }
  if (obj.type === 'ramp' && obj.vertices && obj.vertices.length === 2) {
    return createRampGeometry(obj.vertices[0], obj.vertices[1], obj.rampWidth ?? OBJECT_DEFAULTS.rampWidth, obj.rampHeight ?? OBJECT_DEFAULTS.rampHeight);
  }
  if (obj.type === 'cliff' && obj.vertices && obj.vertices.length === 2) {
    return createCliffGeometry(obj.vertices[0], obj.vertices[1], obj.cliffHeight ?? OBJECT_DEFAULTS.cliffHeight, obj.cliffThickness ?? OBJECT_DEFAULTS.cliffThickness);
  }
  if (obj.type === 'trim' && obj.vertices && obj.vertices.length === 2) {
    return createWallGeometry(obj.vertices[0], obj.vertices[1], obj.trimHeight ?? OBJECT_DEFAULTS.trimHeight, obj.trimThickness ?? OBJECT_DEFAULTS.trimThickness);
  }
  return createGeometry(obj.type);
}

function createMesh(obj: LevelObject): THREE.Mesh {
  const geo = getGeometry(obj);
  const checker = getCheckerTexture().clone();
  checker.needsUpdate = true;
  const bakedGeometry = obj.type === 'road' || obj.type === 'wall' || obj.type === 'polygon' || obj.type === 'ramp' || obj.type === 'cliff' || obj.type === 'trim';
  if (bakedGeometry) {
    checker.repeat.set(1, 1);
  } else {
    const baseRepeat = obj.type === 'plane' ? EDITOR.planeSize : 1;
    checker.repeat.set(baseRepeat * obj.scale.x * 0.5, baseRepeat * obj.scale.z * 0.5);
  }
  const doubleSided = obj.type === 'polygon' || obj.type === 'road';
  const mat = new THREE.MeshStandardMaterial({
    color: obj.color,
    map: checker,
    roughness: 0.85,
    metalness: 0.05,
    flatShading: true,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.levelObjectId = obj.id;
  mesh.userData.primType = obj.type;
  mesh.userData.vertexHash = getVertexHash(obj);
  mesh.name = obj.name;
  return mesh;
}

const DEFAULT_NAME_RE = /^(Box|Cylinder|Stairs|Sphere|Plane|Polygon|Road|Wall|Ramp|Cliff|Trim) \d+$/;

function syncLabels(ctx: SceneContext, objects: LevelObject[]): void {
  const { scene, labelMap } = ctx;
  const existingIds = new Set<string>();

  for (const obj of objects) {
    if (!obj.visible) continue;
    if (obj.type === 'wall') continue;

    const isCustomName = !DEFAULT_NAME_RE.test(obj.name);
    if (!isCustomName) {
      const existing = labelMap.get(obj.id);
      if (existing) {
        scene.remove(existing);
        labelMap.delete(obj.id);
      }
      continue;
    }

    existingIds.add(obj.id);

    let label = labelMap.get(obj.id);
    if (!label) {
      const div = document.createElement('div');
      div.style.cssText =
        'color:#fff;font-size:11px;font-weight:600;font-family:sans-serif;' +
        'background:rgba(0,0,0,0.55);padding:2px 6px;border-radius:3px;' +
        'white-space:nowrap;pointer-events:none;user-select:none;';
      label = new CSS2DObject(div);
      label.layers.set(0);
      scene.add(label);
      labelMap.set(obj.id, label);
    }

    const div = label.element;
    if (div.textContent !== obj.name) {
      div.textContent = obj.name;
    }

    const center = getLabelPosition(obj);
    label.position.set(center.x, center.y, center.z);
  }

  for (const [id, label] of labelMap) {
    if (!existingIds.has(id)) {
      scene.remove(label);
      labelMap.delete(id);
    }
  }
}

function getLabelPosition(obj: LevelObject): { x: number; y: number; z: number } {
  if (obj.vertices && obj.vertices.length >= 2) {
    let cx = 0, cz = 0;
    for (const v of obj.vertices) { cx += v.x; cz += v.z; }
    cx /= obj.vertices.length;
    cz /= obj.vertices.length;
    const y = obj.position.y + (obj.extrudeHeight ?? 0) + 0.15;
    return { x: cx + obj.position.x, y, z: cz + obj.position.z };
  }
  return { x: obj.position.x, y: obj.position.y + obj.scale.y + 0.5, z: obj.position.z };
}

function applyTransform(mesh: THREE.Mesh, obj: LevelObject): void {
  mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
  mesh.rotation.set(
    THREE.MathUtils.degToRad(obj.rotation.x),
    THREE.MathUtils.degToRad(obj.rotation.y),
    THREE.MathUtils.degToRad(obj.rotation.z),
  );
  mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
  const mat = mesh.material as THREE.MeshStandardMaterial;
  if (mat.map) {
    const bakedGeometry = obj.type === 'road' || obj.type === 'wall' || obj.type === 'polygon' || obj.type === 'ramp' || obj.type === 'cliff' || obj.type === 'trim';
    if (!bakedGeometry) {
      const baseRepeat = obj.type === 'plane' ? EDITOR.planeSize : 1;
      mat.map.repeat.set(baseRepeat * obj.scale.x * 0.5, baseRepeat * obj.scale.z * 0.5);
    }
  }
}
