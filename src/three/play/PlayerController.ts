import * as THREE from 'three';
import { PLAY } from '../../constants';
import type { PhysicsWorld } from './PhysicsSimple';
import type { PlayCameraMode } from '../../types';

const ISO_MOVE_YAW = Math.PI / 4 + Math.PI;

export interface KeyState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
}

export interface PlayerController {
  mesh: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
  navTarget: THREE.Vector3 | null;
  yaw: number;

  setNavTarget(target: THREE.Vector3): void;
  update(dt: number, keys: KeyState, cameraYaw: number, mode: PlayCameraMode, physics: PhysicsWorld): void;
  dispose(): void;
}

export function createPlayerController(scene: THREE.Scene): PlayerController {
  const group = new THREE.Group();

  const bodyGeo = new THREE.CapsuleGeometry(PLAY.playerRadius, PLAY.playerHeight - PLAY.playerRadius * 2, 8, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: PLAY.capsuleColor,
    roughness: 0.6,
    metalness: 0.1,
  });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = PLAY.playerHeight / 2;
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  const eyeGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.1, PLAY.eyeHeight, PLAY.playerRadius - 0.02);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.1, PLAY.eyeHeight, PLAY.playerRadius - 0.02);
  group.add(leftEye, rightEye);

  scene.add(group);

  const position = new THREE.Vector3(0, 0, 0);
  const velocity = new THREE.Vector3(0, 0, 0);
  let grounded = false;
  let navTarget: THREE.Vector3 | null = null;
  let yaw = 0;

  const _moveDir = new THREE.Vector3();

  function update(
    dt: number,
    keys: KeyState,
    cameraYaw: number,
    mode: PlayCameraMode,
    physics: PhysicsWorld,
  ) {
    const speed = PLAY.moveSpeed * (keys.sprint ? PLAY.sprintMultiplier : 1);

    if (mode === 'back') {
      _moveDir.set(0, 0, 0);
      if (keys.forward) _moveDir.z += 1;
      if (keys.backward) _moveDir.z -= 1;
      if (keys.left) _moveDir.x += 1;
      if (keys.right) _moveDir.x -= 1;

      if (_moveDir.lengthSq() > 0) {
        _moveDir.normalize();
        _moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), cameraYaw);
        velocity.x = _moveDir.x * speed;
        velocity.z = _moveDir.z * speed;
        yaw = Math.atan2(_moveDir.x, _moveDir.z);
      } else {
        velocity.x *= 0.85;
        velocity.z *= 0.85;
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
      }
    } else if (mode === 'iso') {
      _moveDir.set(0, 0, 0);
      if (keys.forward) _moveDir.z += 1;
      if (keys.backward) _moveDir.z -= 1;
      if (keys.left) _moveDir.x += 1;
      if (keys.right) _moveDir.x -= 1;

      if (_moveDir.lengthSq() > 0) {
        navTarget = null;
        _moveDir.normalize();
        _moveDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ISO_MOVE_YAW);
        velocity.x = _moveDir.x * speed;
        velocity.z = _moveDir.z * speed;
        yaw = Math.atan2(_moveDir.x, _moveDir.z);
      } else if (navTarget) {
        const toTarget = new THREE.Vector3().subVectors(navTarget, position);
        toTarget.y = 0;
        const dist = toTarget.length();
        if (dist < 0.2) {
          navTarget = null;
          velocity.x *= 0.5;
          velocity.z *= 0.5;
        } else {
          toTarget.normalize();
          velocity.x = toTarget.x * PLAY.clickMoveSpeed;
          velocity.z = toTarget.z * PLAY.clickMoveSpeed;
          yaw = Math.atan2(toTarget.x, toTarget.z);
        }
      } else {
        velocity.x *= 0.85;
        velocity.z *= 0.85;
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
      }
    } else {
      if (navTarget) {
        const toTarget = new THREE.Vector3().subVectors(navTarget, position);
        toTarget.y = 0;
        const dist = toTarget.length();
        if (dist < 0.2) {
          navTarget = null;
          velocity.x *= 0.5;
          velocity.z *= 0.5;
        } else {
          toTarget.normalize();
          velocity.x = toTarget.x * PLAY.clickMoveSpeed;
          velocity.z = toTarget.z * PLAY.clickMoveSpeed;
          yaw = Math.atan2(toTarget.x, toTarget.z);
        }
      } else {
        velocity.x *= 0.85;
        velocity.z *= 0.85;
        if (Math.abs(velocity.x) < 0.01) velocity.x = 0;
        if (Math.abs(velocity.z) < 0.01) velocity.z = 0;
      }
    }

    if (keys.jump && grounded) {
      velocity.y = PLAY.jumpForce;
    }

    const result = physics.update(position, velocity, dt);
    position.copy(result.position);
    velocity.copy(result.velocity);
    grounded = result.grounded;

    group.position.copy(position);
    group.rotation.y = yaw;
  }

  function dispose() {
    scene.remove(group);
    bodyGeo.dispose();
    bodyMat.dispose();
    eyeGeo.dispose();
    eyeMat.dispose();
  }

  return {
    mesh: group,
    get position() { return position; },
    get velocity() { return velocity; },
    get grounded() { return grounded; },
    get navTarget() { return navTarget; },
    set navTarget(v) { navTarget = v; },
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    setNavTarget(target: THREE.Vector3) { navTarget = target.clone(); },
    update,
    dispose,
  };
}
