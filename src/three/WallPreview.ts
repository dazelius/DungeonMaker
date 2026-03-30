import * as THREE from 'three';
import { SCENE_COLORS, OBJECT_DEFAULTS } from '../constants';
import type { Vec3 } from '../types';
import { clearGroup } from './threeUtils';

export function renderWallPreview(
  drawGroup: THREE.Group,
  wallVerts: Vec3[],
  cursorPt: Vec3 | null,
): void {
  clearGroup(drawGroup);
  const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);

  for (const v of wallVerts) {
    const mat = new THREE.MeshBasicMaterial({ color: SCENE_COLORS.wallPreview, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, mat);
    dot.position.set(v.x, 0.02, v.z);
    dot.renderOrder = 999;
    drawGroup.add(dot);
  }

  if (wallVerts.length === 1 && cursorPt) {
    const start = wallVerts[0];
    const pts = [
      new THREE.Vector3(start.x, 0.01, start.z),
      new THREE.Vector3(cursorPt.x, 0.01, cursorPt.z),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.wallPreview, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 998;
    drawGroup.add(line);

    const dx = cursorPt.x - start.x;
    const dz = cursorPt.z - start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.01) {
      const angle = Math.atan2(dz, dx);
      const hw = OBJECT_DEFAULTS.wallThickness / 2;
      const nx = -Math.sin(angle) * hw;
      const nz = Math.cos(angle) * hw;
      const ghostPts = [
        new THREE.Vector3(start.x + nx, 0.01, start.z + nz),
        new THREE.Vector3(cursorPt.x + nx, 0.01, cursorPt.z + nz),
        new THREE.Vector3(cursorPt.x - nx, 0.01, cursorPt.z - nz),
        new THREE.Vector3(start.x - nx, 0.01, start.z - nz),
        new THREE.Vector3(start.x + nx, 0.01, start.z + nz),
      ];
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(ghostPts);
      const outlineMat = new THREE.LineDashedMaterial({
        color: SCENE_COLORS.wallPreview, dashSize: 0.2, gapSize: 0.1,
        depthTest: false, transparent: true, opacity: 0.5,
      });
      const outline = new THREE.Line(outlineGeo, outlineMat);
      outline.computeLineDistances();
      outline.renderOrder = 998;
      drawGroup.add(outline);
    }

    const curDotMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.wallPreview, depthTest: false, transparent: true, opacity: 0.6,
    });
    const curDot = new THREE.Mesh(dotGeo, curDotMat);
    curDot.position.set(cursorPt.x, 0.02, cursorPt.z);
    curDot.renderOrder = 999;
    drawGroup.add(curDot);
  }
}
