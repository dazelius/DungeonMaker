import * as THREE from 'three';

const CHECKER_SIZE = 64;

let cachedTexture: THREE.CanvasTexture | null = null;

export function getCheckerTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture;

  const canvas = document.createElement('canvas');
  canvas.width = CHECKER_SIZE;
  canvas.height = CHECKER_SIZE;
  const ctx = canvas.getContext('2d')!;

  const half = CHECKER_SIZE / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CHECKER_SIZE, CHECKER_SIZE);
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;

  cachedTexture = tex;
  return tex;
}
