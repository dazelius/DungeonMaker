import * as THREE from 'three';
import { SCENE_COLORS, OBJECT_DEFAULTS } from '../constants';
import type { Vec3 } from '../types';
import { clearGroup } from './threeUtils';

export function renderCliffPreview(
  drawGroup: THREE.Group,
  cliffVerts: Vec3[],
  cursorPt: Vec3 | null,
): void {
  clearGroup(drawGroup);
  const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);

  for (const v of cliffVerts) {
    const mat = new THREE.MeshBasicMaterial({ color: SCENE_COLORS.cliffPreview, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, mat);
    dot.position.set(v.x, (v.y ?? 0) + 0.02, v.z);
    dot.renderOrder = 999;
    drawGroup.add(dot);
  }

  if (cliffVerts.length === 1 && cursorPt) {
    const start = cliffVerts[0];
    const sy = (start.y ?? 0) + 0.01;
    const cy = (cursorPt.y ?? 0) + 0.01;

    const pts = [
      new THREE.Vector3(start.x, sy, start.z),
      new THREE.Vector3(cursorPt.x, cy, cursorPt.z),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.cliffPreview, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 998;
    drawGroup.add(line);

    const dx = cursorPt.x - start.x;
    const dz = cursorPt.z - start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.01) {
      const angle = Math.atan2(dz, dx);
      const hw = OBJECT_DEFAULTS.cliffThickness / 2;
      const nx = -Math.sin(angle) * hw;
      const nz = Math.cos(angle) * hw;
      const y = Math.min(sy, cy);
      const ghostPts = [
        new THREE.Vector3(start.x + nx, y, start.z + nz),
        new THREE.Vector3(cursorPt.x + nx, y, cursorPt.z + nz),
        new THREE.Vector3(cursorPt.x - nx, y, cursorPt.z - nz),
        new THREE.Vector3(start.x - nx, y, start.z - nz),
        new THREE.Vector3(start.x + nx, y, start.z + nz),
      ];
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(ghostPts);
      const outlineMat = new THREE.LineDashedMaterial({
        color: SCENE_COLORS.cliffPreview, dashSize: 0.2, gapSize: 0.1,
        depthTest: false, transparent: true, opacity: 0.5,
      });
      const outline = new THREE.Line(outlineGeo, outlineMat);
      outline.computeLineDistances();
      outline.renderOrder = 998;
      drawGroup.add(outline);

      const midY = Math.min(start.y ?? 0, cursorPt.y ?? 0);
      const downArrow = new THREE.ArrowHelper(
        new THREE.Vector3(0, -1, 0),
        new THREE.Vector3((start.x + cursorPt.x) / 2, midY, (start.z + cursorPt.z) / 2),
        1, SCENE_COLORS.cliffPreview, 0.15, 0.1,
      );
      downArrow.renderOrder = 999;
      drawGroup.add(downArrow);
    }

    const curDotMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.cliffPreview, depthTest: false, transparent: true, opacity: 0.6,
    });
    const curDot = new THREE.Mesh(dotGeo, curDotMat);
    curDot.position.set(cursorPt.x, (cursorPt.y ?? 0) + 0.02, cursorPt.z);
    curDot.renderOrder = 999;
    drawGroup.add(curDot);
  }
}
