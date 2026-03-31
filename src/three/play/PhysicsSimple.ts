import * as THREE from 'three';
import { PLAY } from '../../constants';
import type { LevelObject } from '../../types';

export interface PhysicsResult {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  grounded: boolean;
}

export interface PhysicsWorld {
  update(position: THREE.Vector3, velocity: THREE.Vector3, dt: number): PhysicsResult;
  rebuild(meshes: THREE.Mesh[], objects?: LevelObject[]): void;
}

interface ColliderBox {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

interface TriSurface {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
}

/* ── triangle helpers ── */

function surfaceYAtXZ(px: number, pz: number, t: TriSurface): number | null {
  const d1x = t.bx - t.ax, d1z = t.bz - t.az;
  const d2x = t.cx - t.ax, d2z = t.cz - t.az;
  const d0x = px - t.ax, d0z = pz - t.az;

  const dot11 = d1x * d1x + d1z * d1z;
  const dot12 = d1x * d2x + d1z * d2z;
  const dot1p = d1x * d0x + d1z * d0z;
  const dot22 = d2x * d2x + d2z * d2z;
  const dot2p = d2x * d0x + d2z * d0z;

  const denom = dot11 * dot22 - dot12 * dot12;
  if (Math.abs(denom) < 1e-10) return null;

  const inv = 1 / denom;
  const v = (dot22 * dot1p - dot12 * dot2p) * inv;
  const w = (dot11 * dot2p - dot12 * dot1p) * inv;
  const u = 1 - v - w;

  if (u < -0.01 || v < -0.01 || w < -0.01) return null;

  return u * t.ay + v * t.by + w * t.cy;
}

function extractTopSurfaces(mesh: THREE.Mesh): TriSurface[] {
  const geo = mesh.geometry;
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  if (!posAttr) return [];

  mesh.updateMatrixWorld(true);
  const wm = mesh.matrixWorld;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  const tris: TriSurface[] = [];

  const index = geo.getIndex();
  const triCount = index ? index.count / 3 : posAttr.count / 3;

  for (let i = 0; i < triCount; i++) {
    const i0 = index ? index.getX(i * 3) : i * 3;
    const i1 = index ? index.getX(i * 3 + 1) : i * 3 + 1;
    const i2 = index ? index.getX(i * 3 + 2) : i * 3 + 2;

    va.fromBufferAttribute(posAttr, i0).applyMatrix4(wm);
    vb.fromBufferAttribute(posAttr, i1).applyMatrix4(wm);
    vc.fromBufferAttribute(posAttr, i2).applyMatrix4(wm);

    e1.subVectors(vb, va);
    e2.subVectors(vc, va);
    n.crossVectors(e1, e2);

    if (n.y <= 0) continue;

    tris.push({
      ax: va.x, ay: va.y, az: va.z,
      bx: vb.x, by: vb.y, bz: vb.z,
      cx: vc.x, cy: vc.y, cz: vc.z,
    });
  }

  return tris;
}

/* ── physics world ── */

export function createPhysicsWorld(meshes: THREE.Mesh[], objects?: LevelObject[]): PhysicsWorld {
  let colliders: ColliderBox[] = [];
  let rampSurfaces: TriSurface[] = [];
  let rampIdSet = new Set<string>();

  function rebuild(meshList: THREE.Mesh[], objList?: LevelObject[]) {
    colliders = [];
    rampSurfaces = [];
    rampIdSet = new Set<string>();

    if (objList) {
      for (const obj of objList) {
        if (!obj.visible) continue;
        if (obj.type === 'ramp') rampIdSet.add(obj.id);
      }
    }

    const MIN_COLLIDER_THICKNESS = 0.3;
    const box = new THREE.Box3();
    for (const mesh of meshList) {
      if (!mesh.visible) continue;
      const id = mesh.userData.levelObjectId as string | undefined;

      if (id && rampIdSet.has(id)) {
        const surfs = extractTopSurfaces(mesh);
        rampSurfaces.push(...surfs);
        continue;
      }

      box.setFromObject(mesh);
      if (box.isEmpty()) continue;
      const bMin = box.min.clone();
      const bMax = box.max.clone();
      if (bMax.y - bMin.y < MIN_COLLIDER_THICKNESS) {
        bMin.y = bMax.y - MIN_COLLIDER_THICKNESS;
      }
      colliders.push({ min: bMin, max: bMax });
    }
  }

  rebuild(meshes, objects);

  const STEP_HEIGHT = 0.55;

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
    const stepUp = box.max.y - pos.y;

    if (stepUp > 0 && stepUp <= STEP_HEIGHT && pos.y >= box.min.y) {
      pushOut.y = stepUp;
    } else if (overlapX <= overlapY && overlapX <= overlapZ) {
      pushOut.x = pos.x < (box.min.x + box.max.x) / 2 ? -overlapX : overlapX;
    } else if (overlapZ <= overlapY && overlapZ <= overlapX) {
      pushOut.z = pos.z < (box.min.z + box.max.z) / 2 ? -overlapZ : overlapZ;
    } else {
      const pushUp = box.max.y - pos.y;
      const pushDown = box.min.y - (pos.y + height);
      pushOut.y = Math.abs(pushUp) < Math.abs(pushDown) ? pushUp : pushDown;
    }
    return { intersects: true, pushOut };
  }

  let wasGrounded = false;

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

    let bestRampY: number | null = null;
    for (const tri of rampSurfaces) {
      const surfY = surfaceYAtXZ(pos.x, pos.z, tri);
      if (surfY === null) continue;
      if (bestRampY === null || surfY > bestRampY) bestRampY = surfY;
    }

    if (bestRampY !== null) {
      const diff = bestRampY - pos.y;
      if (diff >= 0 && diff < STEP_HEIGHT) {
        pos.y = bestRampY;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      } else if (diff < 0 && diff > -STEP_HEIGHT && (grounded || wasGrounded)) {
        pos.y = bestRampY;
        if (vel.y < 0) vel.y = 0;
        grounded = true;
      }
    }

    wasGrounded = grounded;
    return { position: pos, velocity: vel, grounded };
  }

  return { update, rebuild };
}
