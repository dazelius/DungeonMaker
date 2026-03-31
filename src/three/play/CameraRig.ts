import * as THREE from 'three';
import { PLAY } from '../../constants';
import type { PlayCameraMode } from '../../types';

const ISO_CAM_YAW = Math.PI / 4;
const ISO_ELEV = Math.atan(1 / Math.sqrt(2));

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch: number;

  onMouseMove(dx: number, dy: number): void;
  onWheel(deltaY: number, mode: PlayCameraMode): void;
  update(dt: number, playerPos: THREE.Vector3, mode: PlayCameraMode): void;
  resize(w: number, h: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  let yaw = Math.PI;
  let pitch = -Math.PI * 0.15;
  let thirdDist: number = PLAY.thirdPersonDist;
  let isoDist: number = PLAY.thirdPersonDist;

  const _target = new THREE.Vector3();
  const _offset = new THREE.Vector3();

  function onMouseMove(dx: number, dy: number) {
    yaw -= dx * PLAY.mouseSensitivity;
    pitch -= dy * PLAY.mouseSensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }

  function onWheel(deltaY: number, mode: PlayCameraMode) {
    if (mode === 'iso') {
      isoDist += deltaY * 0.01;
      isoDist = Math.max(3, Math.min(30, isoDist));
    } else if (mode === 'back') {
      backDist += deltaY * 0.01;
      backDist = Math.max(2, Math.min(12, backDist));
    } else {
      thirdDist += deltaY * 0.01;
      thirdDist = Math.max(2, Math.min(20, thirdDist));
    }
  }

  let backDist = 4;

  function update(dt: number, playerPos: THREE.Vector3, mode: PlayCameraMode) {
    if (mode === 'back') {
      const backHeight = 2.2;
      _target.set(playerPos.x, playerPos.y + PLAY.playerHeight * 0.6, playerPos.z);
      _offset.set(
        -Math.sin(yaw) * backDist,
        backHeight,
        -Math.cos(yaw) * backDist,
      );
      const desiredPos = _target.clone().add(_offset);
      camera.position.lerp(desiredPos, 1 - Math.pow(0.005, dt));
      camera.lookAt(_target);
    } else if (mode === 'iso') {
      _target.set(playerPos.x, playerPos.y + PLAY.playerHeight * 0.5, playerPos.z);
      _offset.set(
        Math.sin(ISO_CAM_YAW) * Math.cos(ISO_ELEV) * isoDist,
        Math.sin(ISO_ELEV) * isoDist,
        Math.cos(ISO_CAM_YAW) * Math.cos(ISO_ELEV) * isoDist,
      );
      const desiredPos = _target.clone().add(_offset);
      camera.position.lerp(desiredPos, 1 - Math.pow(0.01, dt));
      camera.lookAt(_target);
    } else {
      const angleRad = THREE.MathUtils.degToRad(PLAY.thirdPersonAngle);
      _offset.set(
        Math.sin(yaw) * Math.cos(angleRad) * thirdDist,
        Math.sin(angleRad) * thirdDist,
        Math.cos(yaw) * Math.cos(angleRad) * thirdDist,
      );

      _target.set(playerPos.x, playerPos.y + PLAY.playerHeight * 0.5, playerPos.z);
      const desiredPos = _target.clone().add(_offset);

      camera.position.lerp(desiredPos, 1 - Math.pow(0.01, dt));
      camera.lookAt(_target);
    }
  }

  function resize(w: number, h: number) {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    camera,
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = v; },
    onMouseMove,
    onWheel,
    update,
    resize,
  };
}
