import * as THREE from 'three';
import type { SceneContext } from './SceneSetup';
import type { Vec3 } from '../types';
import { useEditor } from '../store';
import { snapVec3 } from '../utils/math';
import { EDITOR, SCENE_COLORS } from '../constants';
import { renderDrawingPreview } from './DrawingMode';
import { renderWallPreview } from './WallPreview';
import { renderRoadPreview } from './RoadPreview';
import { renderRampPreview } from './RampPreview';
import { renderCliffPreview } from './CliffPreview';
import { renderTrimPreview } from './TrimPreview';
import { updatePlaceGhost, type PlaceGhost } from './PlaceMode';
import { updateMeasurements } from './MeasureOverlay';
// import { updateFreeEdgeOverlay } from './FreeEdgeOverlay';
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

  // --- Fly mode (Unity-style RMB + WASD) ---
  let flyActive = false;
  let flyYaw = 0;
  let flyPitch = 0;
  const flyKeys = { w: false, a: false, s: false, d: false, q: false, e: false, shift: false };
  const FLY_SPEED = 8;
  const FLY_FAST = 24;
  const FLY_SENSITIVITY = 0.003;

  function onFlyKeyDown(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'w') flyKeys.w = true;
    else if (k === 'a') flyKeys.a = true;
    else if (k === 's') flyKeys.s = true;
    else if (k === 'd') flyKeys.d = true;
    else if (k === 'q') flyKeys.q = true;
    else if (k === 'e') flyKeys.e = true;
    if (e.key === 'Shift') flyKeys.shift = true;
  }

  function onFlyKeyUp(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === 'w') flyKeys.w = false;
    else if (k === 'a') flyKeys.a = false;
    else if (k === 's') flyKeys.s = false;
    else if (k === 'd') flyKeys.d = false;
    else if (k === 'q') flyKeys.q = false;
    else if (k === 'e') flyKeys.e = false;
    if (e.key === 'Shift') flyKeys.shift = false;
  }

  function startFly() {
    if (flyActive) return;
    flyActive = true;
    orbitControls.enabled = false;
    const cam = ctx.getCamera();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    flyYaw = Math.atan2(dir.x, dir.z);
    flyPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    window.addEventListener('keydown', onFlyKeyDown);
    window.addEventListener('keyup', onFlyKeyUp);
  }

  function stopFly() {
    if (!flyActive) return;
    flyActive = false;
    flyKeys.w = flyKeys.a = flyKeys.s = flyKeys.d = flyKeys.q = flyKeys.e = flyKeys.shift = false;
    window.removeEventListener('keydown', onFlyKeyDown);
    window.removeEventListener('keyup', onFlyKeyUp);

    const cam = ctx.getCamera();
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    orbitControls.target.copy(cam.position).add(dir.multiplyScalar(5));
    orbitControls.update();
  }

  function updateFly(dt: number) {
    if (!flyActive) return;
    const cam = ctx.getCamera();
    const speed = (flyKeys.shift ? FLY_FAST : FLY_SPEED) * dt;

    const forward = new THREE.Vector3(Math.sin(flyYaw) * Math.cos(flyPitch), Math.sin(flyPitch), Math.cos(flyYaw) * Math.cos(flyPitch));
    const right = new THREE.Vector3(-Math.cos(flyYaw), 0, Math.sin(flyYaw));
    const move = new THREE.Vector3();

    if (flyKeys.w) move.add(forward);
    if (flyKeys.s) move.sub(forward);
    if (flyKeys.d) move.add(right);
    if (flyKeys.a) move.sub(right);
    if (flyKeys.e) move.y += 1;
    if (flyKeys.q) move.y -= 1;

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      cam.position.add(move);
      orbitControls.target.add(move);
    }

    const lookTarget = cam.position.clone().add(forward);
    cam.lookAt(lookTarget);
  }

  function syncOrbitButtons() {
    const state = useEditor.getState();
    const isSelect = state.transformMode === 'select';
    const vm = ctx.getViewMode();
    const isOrtho = vm !== 'perspective';
    const key = `${isSelect ? 's' : 'n'}_${vm}`;
    if (key === prevOrbitKey) return;
    prevOrbitKey = key;

    if (isSelect) {
      orbitControls.mouseButtons = {
        LEFT: -1 as THREE.MOUSE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: isOrtho ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      };
    } else if (isOrtho) {
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
    const box = new THREE.Box3();
    const corners = [
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
      new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    ];
    for (const [id, mesh] of meshMap) {
      if (!mesh.visible) continue;
      box.setFromObject(mesh);
      if (box.isEmpty()) continue;
      const { min, max } = box;
      corners[0].set(min.x, min.y, min.z);
      corners[1].set(max.x, min.y, min.z);
      corners[2].set(min.x, max.y, min.z);
      corners[3].set(max.x, max.y, min.z);
      corners[4].set(min.x, min.y, max.z);
      corners[5].set(max.x, min.y, max.z);
      corners[6].set(min.x, max.y, max.z);
      corners[7].set(max.x, max.y, max.z);
      let hit = false;
      for (const c of corners) {
        projected.copy(c).project(cam);
        if (projected.x >= ndcLeft && projected.x <= ndcRight &&
            projected.y >= ndcBottom && projected.y <= ndcTop) {
          hit = true;
          break;
        }
      }
      if (hit) ids.push(id);
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

  function getSnappedSurface(): Vec3 | null {
    raycaster.setFromCamera(pointer, ctx.getCamera());
    const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
    const meshHits = raycaster.intersectObjects(meshes, false);
    const groundHits = raycaster.intersectObject(groundPlane);

    type Hit = { point: THREE.Vector3; distance: number };
    const candidates: Hit[] = [];

    if (groundHits.length > 0) {
      candidates.push({ point: groundHits[0].point, distance: groundHits[0].distance });
    }
    for (const mh of meshHits) {
      candidates.push({ point: mh.point, distance: mh.distance });
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.distance - b.distance);
    const best = candidates[0];

    const { gridSize, snapEnabled } = useEditor.getState();
    const snapped = snapVec3({ x: best.point.x, y: best.point.y, z: best.point.z }, gridSize, snapEnabled);
    return snapped;
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

    if (flyActive) {
      flyYaw -= e.movementX * FLY_SENSITIVITY;
      flyPitch -= e.movementY * FLY_SENSITIVITY;
      flyPitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, flyPitch));
      return;
    }

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
    if (e.button === 2) {
      const state = useEditor.getState();
      if (!state.playMode && ctx.getViewMode() === 'perspective') {
        const isBusy = state.drawingPolygon || state.drawingWall || state.drawingRoad
          || state.drawingWallEdge || state.drawingRamp || state.drawingCliff || state.drawingTrim || state.extruding;
        if (!isBusy) {
          startFly();
          renderer.domElement.requestPointerLock();
        }
      }
      return;
    }
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
      || state.drawingWallEdge || state.drawingRamp || state.drawingCliff || state.drawingTrim || state.placingType || state.extruding;
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
    if (e.button === 2) {
      if (flyActive) {
        stopFly();
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock();
        }
        orbitControls.enabled = true;
      }
      return;
    }
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
      const pt = getSnappedSurface();
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
      const pt = getSnappedSurface();
      if (pt) state.addWallVertex(pt);
      return;
    }

    if (state.drawingRoad) {
      const pt = getSnappedSurface();
      if (pt) state.addRoadVertex(pt);
      return;
    }

    if (state.drawingRamp) {
      const pt = getSnappedSurface();
      if (pt) state.addRampVertex(pt);
      return;
    }

    if (state.drawingCliff) {
      const pt = getSnappedSurface();
      if (pt) state.addCliffVertex(pt);
      return;
    }

    if (state.drawingTrim) {
      const pt = getSnappedSurface();
      if (pt) state.addTrimVertex(pt);
      return;
    }

    if (state.drawingWallEdge) {
      handleWallEdgeClick(state);
      return;
    }

    if (state.placingType) {
      const pt = getSnappedSurface();
      if (pt) state.placeAt(pt);
      return;
    }

    raycaster.setFromCamera(pointer, ctx.getCamera());
    const meshes = Array.from(meshMap.values()).filter((m) => m.visible);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length > 0) {
      const id = hits[0].object.userData.levelObjectId;
      if (id) state.select(id, e.shiftKey, e.altKey);
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
    if (flyActive) return;
    const state = useEditor.getState();
    if (state.playMode) return;
    if (state.extruding) state.cancelExtrude();
    else if (state.drawingPolygon) state.cancelDrawing();
    else if (state.drawingWall) state.cancelWallDrawing();
    else if (state.drawingRoad) state.cancelRoadDrawing();
    else if (state.drawingRamp) state.cancelRampDrawing();
    else if (state.drawingCliff) state.cancelCliffDrawing();
    else if (state.drawingTrim) state.cancelTrimDrawing();
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
    const { objects, selectedIds, transformMode, gridSize, snapEnabled, showMeasurements, editingVertices, floorY, floorIsolate } = state;
    const primaryId = selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null;

    syncMeshes(ctx, objects, selectedIds, floorY, floorIsolate);
    if (editingVertices) {
      ctx.transformControls.detach();
    } else {
      syncGizmo(ctx, primaryId, transformMode, snapEnabled, gridSize, objects);
    }
    syncGrid(ctx, gridSize, floorY);
    ctx.groundPlane.position.y = floorY;
    updateMeasurements(measureGroup, objects, selectedIds, showMeasurements);
    // updateFreeEdgeOverlay(ctx.freeEdgeGroup, objects, selectedIds);
  }

  const unsub = useEditor.subscribe(syncScene);
  syncScene();

  // --- Animation loop ---
  let animId = 0;
  let lastFrameTime = performance.now();
  const animate = () => {
    animId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
    lastFrameTime = now;

    const state = useEditor.getState();

    if (state.playMode) return;

    updateFly(dt);
    syncOrbitButtons();
    if (!flyActive) orbitControls.update();

    if (state.viewMode !== ctx.getViewMode()) ctx.setViewMode(state.viewMode);

    const { placingType: placing, drawingPolygon: drawing, extruding, drawingWall, drawingRoad, drawingWallEdge, drawingRamp, drawingCliff, drawingTrim } = state;

    if (extruding) {
      orbitControls.enabled = false;
      renderer.domElement.style.cursor = 'ns-resize';
    }

    clearGroup(drawGroup);
    if (drawing) {
      orbitControls.enabled = false;
      renderDrawingPreview(drawGroup, state.drawVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingWall) {
      orbitControls.enabled = false;
      renderWallPreview(drawGroup, state.wallVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingRoad) {
      orbitControls.enabled = false;
      renderRoadPreview(drawGroup, state.roadVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingRamp) {
      orbitControls.enabled = false;
      renderRampPreview(drawGroup, state.rampVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingCliff) {
      orbitControls.enabled = false;
      renderCliffPreview(drawGroup, state.cliffVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingTrim) {
      orbitControls.enabled = false;
      renderTrimPreview(drawGroup, state.trimVertices, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (drawingWallEdge) {
      orbitControls.enabled = false;
      renderEdgeHighlight(drawGroup, state, getGroundPoint());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (placing) {
      ghost = updatePlaceGhost(ghost, scene, placing, getSnappedSurface());
      renderer.domElement.style.cursor = 'crosshair';
    } else if (state.editingVertices) {
      vertexEditor.update(pointer);
      if (!vertexEditor.isDragging()) orbitControls.enabled = true;
      renderer.domElement.style.cursor = vertexEditor.isDragging() ? 'grabbing' : 'grab';
    } else {
      if (!extruding && !transformControls.dragging) orbitControls.enabled = true;
      ghost = updatePlaceGhost(ghost, scene, null, null);

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
    stopFly();
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
