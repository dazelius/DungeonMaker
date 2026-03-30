import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { downloadBlob } from '../utils/download';
export { getViewportScene } from './sceneRegistry';

export async function exportGLTF(scene: THREE.Scene, filename: string, binary: boolean): Promise<void> {
  const exporter = new GLTFExporter();
  const exportScene = buildExportScene(scene);
  const data = await exporter.parseAsync(exportScene, { binary });
  if (binary) {
    downloadBlob(new Blob([data as ArrayBuffer], { type: 'application/octet-stream' }), filename.replace(/\.\w+$/, '.glb'));
  } else {
    const json = JSON.stringify(data, null, 2);
    downloadBlob(new Blob([json], { type: 'application/json' }), filename.replace(/\.\w+$/, '.gltf'));
  }
}

export function exportOBJ(scene: THREE.Scene, filename: string): void {
  const exporter = new OBJExporter();
  const exportScene = buildExportScene(scene);
  const result = exporter.parse(exportScene);
  downloadBlob(new Blob([result], { type: 'text/plain' }), filename.replace(/\.\w+$/, '.obj'));
}

function buildExportScene(scene: THREE.Scene): THREE.Scene {
  const exportScene = new THREE.Scene();
  scene.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && child.userData.levelObjectId) {
      const mesh = child as THREE.Mesh;
      const clone = mesh.clone();
      clone.matrixAutoUpdate = false;
      clone.matrix.copy(mesh.matrixWorld);
      clone.matrix.decompose(clone.position, clone.quaternion, clone.scale);
      clone.matrixAutoUpdate = true;
      exportScene.add(clone);
    }
  });
  return exportScene;
}
