import * as THREE from 'three';
import { PLAY } from '../../constants';

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  yaw: number;
  pitch: number;

  onMouseMove(dx: number, dy: number): void;
  onWheel(deltaY: number): void;
  update(dt: number, playerPos: THREE.Vector3, mode: '3rd' | '1st'): void;
  resize(w: number, h: number): void;
}

export function createCameraRig(): CameraRig {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  let yaw = Math.PI;
  let pitch = -Math.PI * 0.15;
  let thirdDist: number = PLAY.thirdPersonDist;

  const _target = new THREE.Vector3();
  const _offset = new THREE.Vector3();

  function onMouseMove(dx: number, dy: number) {
    yaw -= dx * PLAY.mouseSensitivity;
    pitch -= dy * PLAY.mouseSensitivity;
    pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, pitch));
  }

  function onWheel(deltaY: number) {
    thirdDist += deltaY * 0.01;
    thirdDist = Math.max(2, Math.min(20, thirdDist));
  }

  function update(dt: number, playerPos: THREE.Vector3, mode: '3rd' | '1st') {
    if (mode === '1st') {
      _target.set(playerPos.x, playerPos.y + PLAY.eyeHeight, playerPos.z);
      camera.position.copy(_target);

      const lookX = Math.sin(yaw) * Math.cos(pitch);
      const lookY = Math.sin(pitch);
      const lookZ = Math.cos(yaw) * Math.cos(pitch);
      camera.lookAt(_target.x + lookX, _target.y + lookY, _target.z + lookZ);
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
