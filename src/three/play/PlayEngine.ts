import * as THREE from 'three';
import type { SceneContext } from '../SceneSetup';
import type { PlayCameraMode } from '../../types';
import { useEditor } from '../../store';
import { createPhysicsWorld, type PhysicsWorld } from './PhysicsSimple';
import { createPlayerController, type PlayerController, type KeyState } from './PlayerController';
import { createCameraRig, type CameraRig } from './CameraRig';

export interface PlayContext {
  enter(): void;
  exit(): void;
  dispose(): void;
  isActive(): boolean;
}

export function createPlayEngine(ctx: SceneContext): PlayContext {
  let active = false;
  let animId = 0;
  let lastTime = 0;

  let player: PlayerController | null = null;
  let physics: PhysicsWorld | null = null;
  let cameraRig: CameraRig | null = null;

  const keys: KeyState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function onKeyDown(e: KeyboardEvent) {
    if (!active) return;
    updateKey(e.code, true);
    if (e.key === 'Escape') {
      useEditor.getState().exitPlayMode();
    }
    const mode = useEditor.getState().playCameraMode;
    if (e.key === 'v' || e.key === 'V') {
      useEditor.getState().togglePlayCameraMode();
    }
    if (mode === 'back') e.preventDefault();
  }

  function onKeyUp(e: KeyboardEvent) {
    if (!active) return;
    updateKey(e.code, false);
  }

  function updateKey(code: string, pressed: boolean) {
    switch (code) {
      case 'KeyW': case 'ArrowUp': keys.forward = pressed; break;
      case 'KeyS': case 'ArrowDown': keys.backward = pressed; break;
      case 'KeyA': case 'ArrowLeft': keys.left = pressed; break;
      case 'KeyD': case 'ArrowRight': keys.right = pressed; break;
      case 'Space': keys.jump = pressed; break;
      case 'ShiftLeft': case 'ShiftRight': keys.sprint = pressed; break;
    }
  }

  let skipNextMove = false;
  const MAX_MOVE = 80;

  function onMouseMove(e: MouseEvent) {
    if (!active || !cameraRig) return;
    const mode = useEditor.getState().playCameraMode;
    if (mode === 'back' && document.pointerLockElement === ctx.renderer.domElement) {
      if (skipNextMove) { skipNextMove = false; return; }
      const dx = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, e.movementX));
      const dy = Math.max(-MAX_MOVE, Math.min(MAX_MOVE, e.movementY));
      cameraRig.onMouseMove(dx, dy);
    }
  }

  function onPointerDown(_e: PointerEvent) {
    if (!active) return;
    const mode = useEditor.getState().playCameraMode;
    if (mode === 'back' && document.pointerLockElement !== ctx.renderer.domElement) {
      skipNextMove = true;
      ctx.renderer.domElement.requestPointerLock();
    }
  }

  function onPointerUp() {
    // no-op
  }

  function onClick(e: MouseEvent) {
    if (!active || !player || !cameraRig) return;
    const mode = useEditor.getState().playCameraMode;

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (mode === 'back' || mode === '3rd' || mode === 'iso') {
      raycaster.setFromCamera(pointer, cameraRig.camera);
      const hits = raycaster.intersectObject(ctx.groundPlane);
      if (hits.length > 0) {
        player.setNavTarget(hits[0].point);
      }
    }
  }

  function onWheel(e: WheelEvent) {
    if (!active || !cameraRig) return;
    const mode = useEditor.getState().playCameraMode;
    if (mode === '3rd' || mode === 'iso' || mode === 'back') {
      e.preventDefault();
      cameraRig.onWheel(e.deltaY, mode);
    }
  }

  function onContextMenu(e: MouseEvent) {
    if (active) e.preventDefault();
  }

  function onPointerLockChange() {
    // Pointer lock exited (e.g. ESC key) — no action needed, user clicks to re-lock
  }

  function enter() {
    if (active) return;
    active = true;

    ctx.orbitControls.enabled = false;
    ctx.transformControls.detach();
    (ctx.transformControls as unknown as THREE.Object3D).visible = false;

    const meshes = Array.from(ctx.meshMap.values()).filter((m) => m.visible);
    const objects = useEditor.getState().objects;
    physics = createPhysicsWorld(meshes, objects);
    player = createPlayerController(ctx.scene);
    cameraRig = createCameraRig();

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    cameraRig.resize(rect.width, rect.height);

    ctx.drawGroup.visible = false;
    ctx.measureGroup.visible = false;
    ctx.gridHelper.visible = false;

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    ctx.renderer.domElement.addEventListener('mousemove', onMouseMove);
    ctx.renderer.domElement.addEventListener('click', onClick);
    ctx.renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    ctx.renderer.domElement.addEventListener('contextmenu', onContextMenu);
    ctx.renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    lastTime = performance.now();
    animate();
  }

  function exit() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(animId);

    if (document.pointerLockElement === ctx.renderer.domElement) {
      document.exitPointerLock();
    }

    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    ctx.renderer.domElement.removeEventListener('mousemove', onMouseMove);
    ctx.renderer.domElement.removeEventListener('click', onClick);
    ctx.renderer.domElement.removeEventListener('wheel', onWheel);
    ctx.renderer.domElement.removeEventListener('contextmenu', onContextMenu);
    ctx.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointerlockchange', onPointerLockChange);

    if (player) { player.dispose(); player = null; }
    physics = null;
    cameraRig = null;

    resetKeys();

    ctx.orbitControls.enabled = true;
    (ctx.transformControls as unknown as THREE.Object3D).visible = true;
    ctx.drawGroup.visible = true;
    ctx.measureGroup.visible = true;
    ctx.gridHelper.visible = true;
  }

  function resetKeys() {
    keys.forward = keys.backward = keys.left = keys.right = keys.jump = keys.sprint = false;
  }

  function animate() {
    if (!active) return;
    animId = requestAnimationFrame(animate);

    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (!player || !physics || !cameraRig) return;

    const mode = useEditor.getState().playCameraMode as PlayCameraMode;

    if (mode !== 'back' && document.pointerLockElement === ctx.renderer.domElement) {
      document.exitPointerLock();
    }

    player.update(dt, keys, cameraRig.yaw, mode, physics);
    cameraRig.update(dt, player.position, mode);

    player.mesh.visible = true;

    const rect = ctx.renderer.domElement.getBoundingClientRect();
    cameraRig.resize(rect.width, rect.height);

    ctx.renderer.render(ctx.scene, cameraRig.camera);
    ctx.labelRenderer.render(ctx.scene, cameraRig.camera);
  }

  function dispose() {
    exit();
  }

  return { enter, exit, dispose, isActive: () => active };
}
