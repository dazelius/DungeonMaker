import * as THREE from 'three';
import { PLAY } from '../../constants';

export interface PhysicsResult {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
}

export interface PhysicsWorld {
  update(position: THREE.Vector3, velocity: THREE.Vector3, dt: number): PhysicsResult;
  rebuild(meshes: THREE.Mesh[]): void;
}

interface ColliderBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export function createPhysicsWorld(meshes: THREE.Mesh[]): PhysicsWorld {
  let colliders: ColliderBox[] = [];

  function rebuild(meshList: THREE.Mesh[]) {
    colliders = [];
    const box = new THREE.Box3();
    for (const mesh of meshList) {
      if (!mesh.visible) continue;
      box.setFromObject(mesh);
      if (box.isEmpty()) continue;
      colliders.push({ min: box.min.clone(), max: box.max.clone() });
    }
  }

  rebuild(meshes);

  function capsuleIntersectsAABB(
    pos: THREE.Vector3,
    radius: number,
    height: number,
    box: ColliderBox,
  ): { intersects: boolean; pushOut: THREE.Vector3 } {
    const capsuleMin = new THREE.Vector3(pos.x - radius, pos.y, pos.z - radius);
    const capsuleMax = new THREE.Vector3(pos.x + radius, pos.y + height, pos.z + radius);

    const overlapX = Math.min(capsuleMax.x, box.max.x) - Math.max(capsuleMin.x, box.min.x);
    const overlapY = Math.min(capsuleMax.y, box.max.y) - Math.max(capsuleMin.y, box.min.y);
    const overlapZ = Math.min(capsuleMax.z, box.max.z) - Math.max(capsuleMin.z, box.min.z);

    if (overlapX <= 0 || overlapY <= 0 || overlapZ <= 0) {
      return { intersects: false, pushOut: new THREE.Vector3() };
    }

    const pushOut = new THREE.Vector3();
    if (overlapX <= overlapY && overlapX <= overlapZ) {
      pushOut.x = pos.x < (box.min.x + box.max.x) / 2 ? -overlapX : overlapX;
    } else if (overlapZ <= overlapY && overlapZ <= overlapX) {
      pushOut.z = pos.z < (box.min.z + box.max.z) / 2 ? -overlapZ : overlapZ;
    } else {
      pushOut.y = pos.y < (box.min.y + box.max.y) / 2 ? -overlapY : overlapY;
    }
    return { intersects: true, pushOut };
  }

  function update(position: THREE.Vector3, velocity: THREE.Vector3, dt: number): PhysicsResult {
    const r = PLAY.playerRadius;
    const h = PLAY.playerHeight;
    const pos = position.clone();
    const vel = velocity.clone();

    vel.y += PLAY.gravity * dt;
    pos.add(vel.clone().multiplyScalar(dt));

    let grounded = false;

    if (pos.y <= PLAY.groundY) {
      pos.y = PLAY.groundY;
      if (vel.y < 0) vel.y = 0;
      grounded = true;
    }

    for (const box of colliders) {
      const result = capsuleIntersectsAABB(pos, r, h, box);
      if (!result.intersects) continue;

      pos.add(result.pushOut);

      if (result.pushOut.y > 0) {
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      } else if (result.pushOut.y < 0) {
        if (vel.y > 0) vel.y = 0;
      }
    }

    return { position: pos, velocity: vel, grounded };
  }

  return { update, rebuild };
}
