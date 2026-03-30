import * as THREE from 'three';
import type { SceneContext } from './SceneSetup';
import type { Vec3 } from '../types';
import { useEditor } from '../store';
import { snapVec3 } from '../utils/math';
import { EDITOR, SCENE_COLORS } from '../constants';
import { renderDrawingPreview } from './DrawingMode';
import { renderWallPreview } from './WallPreview';
import { renderRoadPreview } from './RoadPreview';
import { updatePlaceGhost, type PlaceGhost } from './PlaceMode';
import { updateMeasurements } from './MeasureOverlay';
import { syncMeshes, syncGizmo, syncGrid } from './MeshSync';
import { stripGizmoExtras } from './GizmoHelper';
import { clearGroup } from './threeUtils';
import { createVertexEditor } from './VertexEditor';

export interface InputContext {
  dispose(): void;
  beginExtrude(startHeight: number): void;
}

export function createInputHandler(ctx: SceneContext): InputContext {
  const { renderer, scene, orbitControls, transformControls, groundPlane, meshMap, drawGroup, measureGroup } = ctx;

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hoveredId: string | null = null;
  let extStartY = 0;
  let extStartHeight = 0;
  let lastClientY = 0;
  let ghost: PlaceGhost = { mesh: null, type: null };
  let vertexDragConsumed = false;
  const vertexEditor = createVertexEditor(ctx);

  let marqueeActive = false;
  let marqueeStart = { x: 0, y: 0 };
  let marqueeEnd = { x: 0, y: 0 };
  let marqueeDiv: HTMLDivElement | null = null;
  let prevOrbitKey = '';

  function syncOrbitButtons() {
    const state = useEditor.getState();
    const isSelect = state.transformMode === 'select';
    const isTop = ctx.isTopView();
    const key = `${isSelect ? 's' : 'n'}_${isTop ? 't' : 'p'}`;
    if (key === prevOrbitKey) return;
    prevOrbitKey = key;

    if (isSelect) {
      orbitControls.mouseButtons = {
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: isTop ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      };
    } else if (isTop) {
      orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    } else {
      orbitControls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN,
      };
    }
  }
  syncOrbitButtons();

  function createMarqueeDiv(): HTMLDivElement {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;border:1px solid #3b82f6;background:rgba(59,130,246,0.12);pointer-events:none;z-index:9999;';
    document.body.appendChild(div);
    return div;
  }

  function updateMarqueeRect() {
    if (!marqueeDiv) return;
    const x = Math.min(marqueeStart.x, marqueeEnd.x);
    const y = Math.min(marqueeStart.y, marqueeEnd.y);
    const w = Math.abs(marqueeEnd.x - marqueeStart.x);
    const h = Math.abs(marqueeEnd.y - marqueeStart.y);
    marqueeDiv.style.left = x + 'px';
    marqueeDiv.style.top = y + 'px';
    marqueeDiv.style.width = w + 'px';
    marqueeDiv.style.height = h + 'px';
  }

  function finishMarquee() {
    if (!marqueeDiv) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const x1 = (Math.min(marqueeStart.x, marqueeEnd.x) - rect.left) / rect.width * 2 - 1;
    const y1 = -((Math.min(marqueeStart.y, marqueeEnd.y) - rect.top) / rect.height) * 2 + 1;
    const x2 = (Math.max(marqueeStart.x, marqueeEnd.x) - rect.left) / rect.width * 2 - 1;
    const y2 = -((Math.max(marqueeStart.y, marqueeEnd.y) - rect.top) / rect.height) * 2 + 1;
    const ndcLeft = x1, ndcRight = x2, ndcTop = y1, ndcBottom = y2;

    const cam = ctx.getCamera();
    const ids: string[] = [];
    const projected = new THREE.Vector3();
    for (const [id, mesh] of meshMap) {
      if (!mesh.visible) continue;
      projected.setFromMatrixPosition(mesh.matrixWorld);
      projected.project(cam);
      if (projected.x >= ndcLeft && projected.x <= ndcRight &&
          projected.y >= ndcBottom && projected.y <= ndcTop) {
        ids.push(id);
      }
    }

    if (ids.length > 0) {
      useEditor.getState().selectMultiple(ids);
    } else {
      useEditor.getState().select(null);
    }

    document.body.removeChild(marqueeDiv);
    marqueeDiv = null;
    marqueeActive = false;
  }

  function getGroundPoint(): THREE.Vector3 | null {
    raycaster.setFromCamera(pointer, ctx.getCamera());
    const hits = raycaster.intersectObject(groundPlane);
    return hits.length > 0 ? hits[0].point : null;
  }

  function getSnappedGround(): Vec3 | null {
    const pt = getGroundPoint();
    if (!pt) return null;
    const { gridSize, snapEnabled } = useEditor.getState();
    return snapVec3({ x: pt.x, y: 0, z: pt.z }, gridSize, snapEnabled);
  }

  function updatePointer(e: { clientX: number; clientY: number }) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  const onPointerMove = (e: PointerEvent) => {
    updatePointer(e);
    lastClientY = e.clientY;

    const state = useEditor.getState();
    if (state.playMode) return;

    if (marqueeActive) {
      marqueeEnd = { x: e.clientX, y: e.clientY };
      if (!marqueeDiv) {
        const dx = Math.abs(marqueeEnd.x - marqueeStart.x);
        const dy = Math.abs(marqueeEnd.y - marqueeStart.y);
        if (dx > 4 || dy > 4) marqueeDiv = createMarqueeDiv();
      }
      if (marqueeDiv) updateMarqueeRect();
      return;
    }

    if (vertexEditor.isDragging()) {
      vertexEditor.handlePointerMove(pointer);
      return;
    }

    if (state.extruding) {
      const dy = extStartY - e.clientY;
      const { gridSize, snapEnabled } = state;
      let h = extStartHeight + dy * EDITOR.extrudeSensitivity;
      h = Math.max(0, h);
      if (snapEnabled) h = Math.round(h / gridSize) * gridSize;
      state.applyExtrude(h);
    }
  };

  const onDblClick = () => {
    const state = useEditor.getState();
    if (state.playMode) return;
    if (state.drawingPolygon && state.drawVertices.length >= 3) {
      state.finishDrawing();
    }
    if (state.drawingRoad && state.roadVertices.length >= 2) {
      state.finishRoad();
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    updatePointer(e);
    const state = useEditor.getState();
    if (state.playMode) return;
    if (state.editingVertices) {
      if (vertexEditor.handlePointerDown(pointer)) {
        vertexDragConsumed = true;
        return;
      }
    }
    if (transformControls.dragging) return;
    const isBusy = state.drawingPolygon || state.drawingWall || state.drawingRoad
      || state.drawingWallEdge || state.placingType || state.extruding;
    if (isBusy) return;

    const isSelectMode = state.transformMode === 'select';

    if (isSelectMode) {
      marqueeActive = true;
      marqueeStart = { x: e.clientX, y: e.clientY };
      marqueeEnd = { x: e.clientX, y: e.clientY };
      orbitControls.enabled = false;
      return;
    }

    raycaster.setFromCamera(pointer, ctx.getCamera());
    const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) {
      marqueeActive = true;
      marqueeStart = { x: e.clientX, y: e.clientY };
      marqueeEnd = { x: e.clientX, y: e.clientY };
      orbitControls.enabled = false;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if (marqueeActive) {
      if (marqueeDiv) {
        finishMarquee();
        vertexDragConsumed = true;
      }
      marqueeActive = false;
      orbitControls.enabled = true;
      return;
    }
    if (vertexEditor.isDragging()) {
      vertexEditor.handlePointerUp();
    }
  };

  const onClick = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (transformControls.dragging) return;
    if (vertexDragConsumed) { vertexDragConsumed = false; return; }
    updatePointer(e);

    const state = useEditor.getState();
    if (state.playMode) return;

    if (state.extruding) { state.confirmExtrude(); return; }

    if (state.drawingPolygon) {
      const pt = getSnappedGround();
      if (!pt) return;
      const verts = state.drawVertices;
      if (verts.length >= 3) {
        const first = verts[0];
        const dx = pt.x - first.x;
        const dz = pt.z - first.z;
        if (Math.sqrt(dx * dx + dz * dz) < EDITOR.closeThreshold) {
          state.finishDrawing();
          return;
        }
      }
      state.addDrawVertex(pt);
      return;
    }

    if (state.drawingWall) {
      const pt = getSnappedGround();
      if (pt) state.addWallVertex(pt);
      return;
    }

    if (state.drawingRoad) {
      const pt = getSnappedGround();
      if (pt) state.addRoadVertex(pt);
      return;
    }

    if (state.drawingWallEdge) {
      handleWallEdgeClick(state);
      return;
    }

    if (state.placingType) {
      const pt = getGroundPoint();
      if (pt) state.placeAt({ x: pt.x, y: pt.y, z: pt.z });
      return;
    }

    raycaster.setFromCamera(pointer, ctx.getCamera());
    const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.levelObjectId;
      if (id) state.select(id, e.shiftKey);
    } else {
      state.select(null);
    }
  };

  function handleWallEdgeClick(state: ReturnType<typeof useEditor.getState>) {
    const sel = state.getSelected();
    if (!sel || !sel.vertices || sel.vertices.length < 3) return;

    raycaster.setFromCamera(pointer, ctx.getCamera());
    const groundPt = getGroundPoint();
    if (!groundPt) return;
    const mx = groundPt.x;
    const mz = groundPt.z;

    let bestDist = Infinity;
    let bestStart: Vec3 | null = null;
    let bestEnd: Vec3 | null = null;
    const verts = sel.vertices;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const dist = pointToSegmentDist(mx, mz, a.x, a.z, b.x, b.z);
      if (dist < bestDist) {
        bestDist = dist;
        bestStart = a;
        bestEnd = b;
      }
    }
    if (bestStart && bestEnd && bestDist < 2) {
      state.createWallFromEdge(bestStart, bestEnd);
    }
  }

  const onRightClick = (e: MouseEvent) => {
    e.preventDefault();
    const state = useEditor.getState();
    if (state.playMode) return;
    if (state.extruding) state.cancelExtrude();
    else if (state.drawingPolygon) state.cancelDrawing();
    else if (state.drawingWall) state.cancelWallDrawing();
    else if (state.drawingRoad) state.cancelRoadDrawing();
    else if (state.drawingWallEdge) state.cancelWallEdgeDrawing();
    else if (state.placingType) state.cancelPlacing();
  };

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('click', onClick);
  renderer.domElement.addEventListener('dblclick', onDblClick);
  renderer.domElement.addEventListener('contextmenu', onRightClick);

  function syncScene() {
    const state = useEditor.getState();
    const { objects, selectedIds, transformMode, gridSize, snapEnabled, showMeasurements, editingVertices } = state;
    const primaryId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;

    syncMeshes(ctx, objects, selectedIds);
    if (editingVertices) {
      ctx.transformControls.detach();
    } else {
      syncGizmo(ctx, primaryId, transformMode, snapEnabled, gridSize);
    }
    syncGrid(ctx, gridSize);
    updateMeasurements(measureGroup, objects, selectedIds, showMeasurements);
  }

  const unsub = useEditor.subscribe(syncScene);
  syncScene();

  // --- Animation loop ---
  let animId = 0;
  const animate = () => {
    animId = requestAnimationFrame(animate);

    const state = useEditor.getState();

    if (state.playMode) return;

    syncOrbitButtons();
    orbitControls.update();

    if (state.topView && !ctx.isTopView()) ctx.switchToTopView();
    else if (!state.topView && ctx.isTopView()) ctx.switchToPerspective();

    const { placingType: placing, drawingPolygon: drawing, extruding, drawingWall, drawingRoad, drawingWallEdge } = state;

    if (extruding) {
      orbitControls.enabled = false;
      renderer.domElement.style.cursor = 'ns-resize';
    }

    clearGroup(drawGroup);
    if (drawing) {
      orbitControls.enabled = false;
      renderDrawingPreview(drawGroup, state.drawVertices, getSnappedGround());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingWall) {
      orbitControls.enabled = false;
      renderWallPreview(drawGroup, state.wallVertices, getSnappedGround());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingRoad) {
      orbitControls.enabled = false;
      renderRoadPreview(drawGroup, state.roadVertices, getSnappedGround());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingWallEdge) {
      orbitControls.enabled = false;
      renderEdgeHighlight(drawGroup, state, getGroundPoint());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (placing) {
      ghost = updatePlaceGhost(ghost, scene, placing, getGroundPoint(), state.gridSize, state.snapEnabled);
      renderer.domElement.style.cursor = 'crosshair';
    } else if (state.editingVertices) {
      vertexEditor.update(pointer);
      if (!vertexEditor.isDragging()) orbitControls.enabled = true;
      renderer.domElement.style.cursor = vertexEditor.isDragging() ? 'grabbing' : 'grab';
    } else {
      if (!extruding) orbitControls.enabled = true;
      ghost = updatePlaceGhost(ghost, scene, null, null, 0, false);

      raycaster.setFromCamera(pointer, ctx.getCamera());
      const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
      const hits = raycaster.intersectObjects(meshes, false);
      const newHover = hits.length > 0 ? (hits[0].object.userData.levelObjectId as string) : null;
      if (newHover !== hoveredId) {
        const selSet = new Set(state.selectedIds);
        if (hoveredId && meshMap.has(hoveredId)) {
          const mat = meshMap.get(hoveredId)!.material as THREE.MeshStandardMaterial;
          if (!selSet.has(hoveredId)) mat.emissive.setHex(0x000000);
        }
        if (newHover && meshMap.has(newHover)) {
          const mat = meshMap.get(newHover)!.material as THREE.MeshStandardMaterial;
          if (!selSet.has(newHover)) mat.emissive.setHex(SCENE_COLORS.hoverEmissive);
        }
        hoveredId = newHover;
        renderer.domElement.style.cursor = newHover ? 'pointer' : '';
      }
    }

    stripGizmoExtras(transformControls);
    renderer.render(scene, ctx.getCamera());
    ctx.labelRenderer.render(scene, ctx.getCamera());
  };
  animate();

  function dispose() {
    cancelAnimationFrame(animId);
    unsub();
    vertexEditor.dispose();
    renderer.domElement.removeEventListener('pointermove', onPointerMove);
    renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    renderer.domElement.removeEventListener('pointerup', onPointerUp);
    renderer.domElement.removeEventListener('click', onClick);
    renderer.domElement.removeEventListener('dblclick', onDblClick);
    renderer.domElement.removeEventListener('contextmenu', onRightClick);
  }

  function renderEdgeHighlight(
    group: THREE.Group,
    state: ReturnType<typeof useEditor.getState>,
    groundPt: THREE.Vector3 | null,
  ) {
    const sel = state.getSelected();
    if (!sel || !sel.vertices || sel.vertices.length < 3) return;
    const verts = sel.vertices;

    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const pts = [new THREE.Vector3(a.x, 0.02, a.z), new THREE.Vector3(b.x, 0.02, b.z)];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.wallPreview, depthTest: false, transparent: true, opacity: 0.3 });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 997;
      group.add(line);
    }

    if (groundPt) {
      const mx = groundPt.x;
      const mz = groundPt.z;
      let bestDist = Infinity;
      let bestA: Vec3 | null = null;
      let bestB: Vec3 | null = null;
      for (let i = 0; i < verts.length; i++) {
        const a = verts[i];
        const b = verts[(i + 1) % verts.length];
        const dist = pointToSegmentDist(mx, mz, a.x, a.z, b.x, b.z);
        if (dist < bestDist) { bestDist = dist; bestA = a; bestB = b; }
      }
      if (bestA && bestB && bestDist < 2) {
        const pts = [new THREE.Vector3(bestA.x, 0.03, bestA.z), new THREE.Vector3(bestB.x, 0.03, bestB.z)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.edgeHighlight, depthTest: false, linewidth: 2 });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        group.add(line);
      }
    }
  }

  return {
    dispose,
    beginExtrude(startHeight: number) {
      extStartHeight = startHeight;
      extStartY = lastClientY;
    },
  };
}

function pointToSegmentDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-8) return Math.sqrt((px - ax) ** 2 + (pz - az) ** 2);
  let t = ((px - ax) * dx + (pz - az) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return Math.sqrt((px - cx) ** 2 + (pz - cz) ** 2);
}
