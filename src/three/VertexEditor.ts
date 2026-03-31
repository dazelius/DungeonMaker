import * as THREE from 'three';
import type { SceneContext } from './SceneSetup';
import { useEditor } from '../store';
import { VERTEX_EDIT } from '../constants';
import { snapVec3 } from '../utils/math';
import type { Vec3 } from '../types';

export interface VertexEditorContext {
  update(pointer: THREE.Vector2): void;
  handlePointerDown(pointer: THREE.Vector2): boolean;
  handlePointerMove(pointer: THREE.Vector2): void;
  handlePointerUp(): void;
  isDragging(): boolean;
  dispose(): void;
}

export function createVertexEditor(ctx: SceneContext): VertexEditorContext {
  const { scene, groundPlane, meshMap } = ctx;

  const handleGroup = new THREE.Group();
  handleGroup.name = '__vertex_handles__';
  handleGroup.visible = false;
  scene.add(handleGroup);

  const handleGeo = new THREE.SphereGeometry(VERTEX_EDIT.handleRadius, 12, 8);
  const handles: THREE.Mesh[] = [];
  const raycaster = new THREE.Raycaster();

  let dragIdx = -1;
  let hoverIdx = -1;
  let targetObjectId: string | null = null;
  let connectionLine: THREE.Line | null = null;
  let objOffset: Vec3 = { x: 0, y: 0, z: 0 };

  function rebuildLine(verts: Vec3[], off: Vec3) {
    if (connectionLine) {
      handleGroup.remove(connectionLine);
      connectionLine.geometry.dispose();
      (connectionLine.material as THREE.Material).dispose();
      connectionLine = null;
    }
    if (verts.length < 2) return;

    const pts = verts.map((v) =>
      new THREE.Vector3(v.x + off.x, (v.y ?? 0) + off.y + 0.05, v.z + off.z),
    );
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: VERTEX_EDIT.lineColor,
      transparent: true,
      opacity: VERTEX_EDIT.lineOpacity,
      depthTest: false,
    });
    connectionLine = new THREE.Line(geo, mat);
    connectionLine.renderOrder = 999;
    handleGroup.add(connectionLine);
  }

  function syncHandles() {
    const state = useEditor.getState();
    if (!state.editingVertices) {
      handleGroup.visible = false;
      return;
    }

    const sel = state.getSelected();
    if (!sel || !sel.vertices || sel.vertices.length < 2) {
      handleGroup.visible = false;
      state.exitVertexEdit();
      return;
    }

    handleGroup.visible = true;
    targetObjectId = sel.id;
    objOffset = sel.position;
    const verts = sel.vertices;

    while (handles.length < verts.length) {
      const mat = new THREE.MeshBasicMaterial({ color: VERTEX_EDIT.handleColor, depthTest: false });
      const mesh = new THREE.Mesh(handleGeo, mat);
      mesh.renderOrder = 1000;
      handles.push(mesh);
      handleGroup.add(mesh);
    }
    while (handles.length > verts.length) {
      const h = handles.pop()!;
      handleGroup.remove(h);
      (h.material as THREE.Material).dispose();
    }

    for (let i = 0; i < verts.length; i++) {
      const wx = verts[i].x + objOffset.x;
      const wy = (verts[i].y ?? 0) + objOffset.y + 0.15;
      const wz = verts[i].z + objOffset.z;
      handles[i].position.set(wx, wy, wz);
      handles[i].userData.vertexIndex = i;
      const mat = handles[i].material as THREE.MeshBasicMaterial;
      if (i === dragIdx) mat.color.setHex(VERTEX_EDIT.handleDragColor);
      else if (i === hoverIdx) mat.color.setHex(VERTEX_EDIT.handleHoverColor);
      else mat.color.setHex(VERTEX_EDIT.handleColor);
    }

    rebuildLine(verts, objOffset);
  }

  function getSurfaceHit(pointer: THREE.Vector2): THREE.Vector3 | null {
    raycaster.setFromCamera(pointer, ctx.getCamera());
    const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
    const meshHits = raycaster.intersectObjects(meshes, false);
    const groundHits = raycaster.intersectObject(groundPlane);

    type Hit = { point: THREE.Vector3; distance: number };
    const candidates: Hit[] = [];
    if (groundHits.length > 0) candidates.push({ point: groundHits[0].point, distance: groundHits[0].distance });
    for (const mh of meshHits) candidates.push({ point: mh.point, distance: mh.distance });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0].point;
  }

  function hitTestHandles(pointer: THREE.Vector2): number {
    if (handles.length === 0) return -1;
    raycaster.setFromCamera(pointer, ctx.getCamera());
    const hits = raycaster.intersectObjects(handles, false);
    if (hits.length > 0) {
      return hits[0].object.userData.vertexIndex as number;
    }
    return -1;
  }

  function update(pointer: THREE.Vector2) {
    syncHandles();

    const state = useEditor.getState();
    if (!state.editingVertices || dragIdx >= 0) return;
    const newHover = hitTestHandles(pointer);
    if (newHover !== hoverIdx) {
      hoverIdx = newHover;
    }
  }

  function handlePointerDown(pointer: THREE.Vector2): boolean {
    const state = useEditor.getState();
    if (!state.editingVertices) return false;

    const idx = hitTestHandles(pointer);
    if (idx >= 0 && targetObjectId) {
      dragIdx = idx;
      state.beginBatch(targetObjectId);
      ctx.orbitControls.enabled = false;
      return true;
    }
    return false;
  }

  function handlePointerMove(pointer: THREE.Vector2): void {
    const state = useEditor.getState();
    if (!state.editingVertices || dragIdx < 0 || !targetObjectId) return;

    const pt = getSurfaceHit(pointer);
    if (!pt) return;

    const { gridSize, snapEnabled } = state;
    const snapped = snapVec3(
      { x: pt.x - objOffset.x, y: pt.y - objOffset.y, z: pt.z - objOffset.z },
      gridSize, snapEnabled,
    );

    const sel = state.objects.find((o) => o.id === targetObjectId);
    if (!sel || !sel.vertices) return;

    const newVerts = sel.vertices.map((v, i) =>
      i === dragIdx ? { x: snapped.x, y: snapped.y, z: snapped.z } : v,
    );
    state.updateObject(targetObjectId, { vertices: newVerts });
  }

  function handlePointerUp(): void {
    if (dragIdx >= 0) {
      dragIdx = -1;
      hoverIdx = -1;
      useEditor.getState().commitBatch();
      ctx.orbitControls.enabled = true;
    }
  }

  function dispose() {
    for (const h of handles) {
      handleGroup.remove(h);
      (h.material as THREE.Material).dispose();
    }
    handles.length = 0;
    if (connectionLine) {
      connectionLine.geometry.dispose();
      (connectionLine.material as THREE.Material).dispose();
    }
    scene.remove(handleGroup);
    handleGeo.dispose();
  }

  return {
    update,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    isDragging: () => dragIdx >= 0,
    dispose,
  };
}
