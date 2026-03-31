import * as THREE from 'three';
import { SCENE_COLORS, OBJECT_DEFAULTS } from '../constants';
import type { Vec3 } from '../types';
import { clearGroup } from './threeUtils';

export function renderRampPreview(
  drawGroup: THREE.Group,
  rampVerts: Vec3[],
  cursorPt: Vec3 | null,
): void {
  clearGroup(drawGroup);
  const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);

  for (const v of rampVerts) {
    const mat = new THREE.MeshBasicMaterial({ color: SCENE_COLORS.rampPreview, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, mat);
    dot.position.set(v.x, (v.y ?? 0) + 0.02, v.z);
    dot.renderOrder = 999;
    drawGroup.add(dot);
  }

  if (rampVerts.length === 1 && cursorPt) {
    const start = rampVerts[0];
    const dx = cursorPt.x - start.x;
    const dz = cursorPt.z - start.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const sy = (start.y ?? 0) + 0.01;
    const cy = (cursorPt.y ?? 0) + 0.01;

    const pts = [
      new THREE.Vector3(start.x, sy, start.z),
      new THREE.Vector3(cursorPt.x, cy, cursorPt.z),
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.rampPreview, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 998;
    drawGroup.add(line);

    if (len > 0.01) {
      const hw = OBJECT_DEFAULTS.rampWidth / 2;
      const dirX = dx / len;
      const dirZ = dz / len;
      const nrmX = -dirZ * hw;
      const nrmZ = dirX * hw;
      const y = Math.min(sy, cy);

      const ghostPts = [
        new THREE.Vector3(start.x + nrmX, y, start.z + nrmZ),
        new THREE.Vector3(cursorPt.x + nrmX, y, cursorPt.z + nrmZ),
        new THREE.Vector3(cursorPt.x - nrmX, y, cursorPt.z - nrmZ),
        new THREE.Vector3(start.x - nrmX, y, start.z - nrmZ),
        new THREE.Vector3(start.x + nrmX, y, start.z + nrmZ),
      ];
      const outlineGeo = new THREE.BufferGeometry().setFromPoints(ghostPts);
      const outlineMat = new THREE.LineDashedMaterial({
        color: SCENE_COLORS.rampPreview, dashSize: 0.2, gapSize: 0.1,
        depthTest: false, transparent: true, opacity: 0.5,
      });
      const outline = new THREE.Line(outlineGeo, outlineMat);
      outline.computeLineDistances();
      outline.renderOrder = 998;
      drawGroup.add(outline);

      const arrowDir = new THREE.Vector3(dirX, 0, dirZ);
      const arrowOrigin = new THREE.Vector3(
        (start.x + cursorPt.x) / 2, Math.min(sy, cy) + 0.01,
        (start.z + cursorPt.z) / 2,
      );
      const arrow = new THREE.ArrowHelper(arrowDir, arrowOrigin, len * 0.3, SCENE_COLORS.rampPreview, 0.15, 0.1);
      arrow.renderOrder = 999;
      drawGroup.add(arrow);
    }

    const curDotMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.rampPreview, depthTest: false, transparent: true, opacity: 0.6,
    });
    const curDot = new THREE.Mesh(dotGeo, curDotMat);
    curDot.position.set(cursorPt.x, (cursorPt.y ?? 0) + 0.02, cursorPt.z);
    curDot.renderOrder = 999;
    drawGroup.add(curDot);
  }
}
