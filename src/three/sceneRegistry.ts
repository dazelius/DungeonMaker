import type * as THREE from 'three';

let _viewportScene: THREE.Scene | null = null;

export function registerViewportScene(scene: THREE.Scene): void {
  _viewportScene = scene;
}

export function getViewportScene(): THREE.Scene | null {
  return _viewportScene;
}
