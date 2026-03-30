import * as THREE from 'three';

export function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    if ((child as THREE.Mesh).material) {
      const m = (child as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
      else (m as THREE.Material).dispose();
    }
  }
}
