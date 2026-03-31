import * as THREE from 'three';
import { SCENE_COLORS } from '../constants';
import { createGeometry } from './primitiveGeometry';
import type { PrimitiveType, Vec3 } from '../types';

export interface PlaceGhost {
  mesh: THREE.Mesh | null;
  type: PrimitiveType | null;
}

export function updatePlaceGhost(
  ghost: PlaceGhost,
  scene: THREE.Scene,
  placingType: PrimitiveType | null,
  surfacePoint: Vec3 | null,
): PlaceGhost {
  if (!placingType) {
    if (ghost.mesh) {
      scene.remove(ghost.mesh);
      ghost.mesh.geometry.dispose();
      (ghost.mesh.material as THREE.Material).dispose();
    }
    return { mesh: null, type: null };
  }

  let { mesh, type } = ghost;

  if (type !== placingType) {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    const geo = createGeometry(placingType);
    const mat = new THREE.MeshStandardMaterial({
      color: SCENE_COLORS.ghost, transparent: true, opacity: 0.4, depthWrite: false,
    });
    mesh = new THREE.Mesh(geo, mat);
    mesh.userData.isGhost = true;
    scene.add(mesh);
    type = placingType;
  }

  if (surfacePoint && mesh) {
    mesh.position.set(surfacePoint.x, surfacePoint.y, surfacePoint.z);
    mesh.visible = true;
  }

  return { mesh, type };
}
