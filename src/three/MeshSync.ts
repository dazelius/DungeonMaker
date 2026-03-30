import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import type { LevelObject } from '../types';
import { createGeometry, createPolygonGeometry, createRoadGeometry, createWallGeometry, createCurvedWallGeometry } from './primitiveGeometry';
import { getCheckerTexture } from './checkerTexture';
import { SCENE_COLORS, EDITOR } from '../constants';
import type { SceneContext } from './SceneSetup';

export function syncMeshes(ctx: SceneContext, objects: LevelObject[], selectedIds: string[]): void {
  const selSet = new Set(selectedIds);
  const existingIds = new Set<string>();
  const { meshMap, scene } = ctx;

  for (const obj of objects) {
    existingIds.add(obj.id);
    let mesh = meshMap.get(obj.id);
    const vHash = getVertexHash(obj);
    const needsRebuild = !mesh
      || mesh.userData.primType !== obj.type
      || ((obj.type === 'polygon' || obj.type === 'road' || obj.type === 'wall') && mesh.userData.vertexHash !== vHash);
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
    applyTransform(mesh!, obj);
    const mat = mesh!.material as THREE.MeshStandardMaterial;
    mat.color.set(obj.color);
    mat.emissive.setHex(selSet.has(obj.id) ? SCENE_COLORS.selectEmissive : 0x000000);
    mesh!.visible = obj.visible;
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

export function syncGizmo(
  ctx: SceneContext,
  primaryId: string | null,
  transformMode: string,
  snapEnabled: boolean,
  gridSize: number,
): void {
  const { transformControls, meshMap } = ctx;
  if (transformMode === 'select') {
    transformControls.detach();
    return;
  }
  if (primaryId) {
    const mesh = meshMap.get(primaryId);
    if (mesh && transformControls.object !== mesh) {
      transformControls.attach(mesh);
    }
  } else {
    transformControls.detach();
  }
  transformControls.setMode(transformMode as 'translate' | 'rotate' | 'scale');
  transformControls.setTranslationSnap(snapEnabled ? gridSize : null);
  transformControls.setRotationSnap(snapEnabled ? THREE.MathUtils.degToRad(EDITOR.snapRotationDeg) : null);
  transformControls.setScaleSnap(snapEnabled ? EDITOR.snapScaleStep : null);
}

export function syncGrid(ctx: SceneContext, gridSize: number): void {
  if (ctx.gridHelper.userData.lastGrid === gridSize) return;
  const extent = EDITOR.gridExtent;
  const totalSize = extent * 2;
  const divisions = Math.round(totalSize / gridSize);
  ctx.scene.remove(ctx.gridHelper);
  const newGrid = new THREE.GridHelper(totalSize, divisions, SCENE_COLORS.gridCenter, SCENE_COLORS.grid);
  newGrid.userData.lastGrid = gridSize;
  ctx.scene.add(newGrid);
  ctx.gridHelper = newGrid;
}

function getVertexHash(obj: LevelObject): string {
  if (obj.type === 'polygon') return `${JSON.stringify(obj.vertices)}|${obj.extrudeHeight ?? 0}`;
  if (obj.type === 'road') return `${JSON.stringify(obj.vertices)}|${obj.roadWidth ?? 0}`;
  if (obj.type === 'wall') return `${JSON.stringify(obj.vertices)}|${obj.wallHeight ?? 0}|${obj.wallThickness ?? 0}`;
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
  return createGeometry(obj.type);
}

function createMesh(obj: LevelObject): THREE.Mesh {
  const geo = getGeometry(obj);
  const checker = getCheckerTexture().clone();
  checker.needsUpdate = true;
  const bakedGeometry = obj.type === 'road' || obj.type === 'wall' || obj.type === 'polygon';
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

function syncLabels(ctx: SceneContext, objects: LevelObject[]): void {
  const { scene, labelMap } = ctx;
  const existingIds = new Set<string>();

  for (const obj of objects) {
    if (!obj.visible) continue;
    if (obj.type === 'wall') continue;
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
    const y = (obj.extrudeHeight ?? 0) + 0.15;
    return { x: cx, y, z: cz };
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
    const bakedGeometry = obj.type === 'road' || obj.type === 'wall' || obj.type === 'polygon';
    if (!bakedGeometry) {
      const baseRepeat = obj.type === 'plane' ? EDITOR.planeSize : 1;
      mat.map.repeat.set(baseRepeat * obj.scale.x * 0.5, baseRepeat * obj.scale.z * 0.5);
    }
  }
}
