import * as THREE from 'three';
import { SCENE_COLORS } from '../constants';
import type { Vec3 } from '../types';
import { clearGroup } from './threeUtils';

export function renderDrawingPreview(
  drawGroup: THREE.Group,
  verts: Vec3[],
  cursorPt: Vec3 | null,
): void {
  clearGroup(drawGroup);
  const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);

  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const isFirst = i === 0;
    const dotMat = new THREE.MeshBasicMaterial({
      color: isFirst ? SCENE_COLORS.drawClose : SCENE_COLORS.drawDot,
      depthTest: false,
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.set(v.x, 0.02, v.z);
    if (isFirst) dot.scale.setScalar(1.5);
    dot.renderOrder = 999;
    drawGroup.add(dot);
  }

  if (verts.length >= 2) {
    const pts = verts.map((v) => new THREE.Vector3(v.x, 0.01, v.z));
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const lineMat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.drawLine, depthTest: false });
    const line = new THREE.Line(lineGeo, lineMat);
    line.renderOrder = 998;
    drawGroup.add(line);
  }

  if (cursorPt && verts.length > 0) {
    const last = verts[verts.length - 1];
    const previewPts = [new THREE.Vector3(last.x, 0.01, last.z), new THREE.Vector3(cursorPt.x, 0.01, cursorPt.z)];
    const pGeo = new THREE.BufferGeometry().setFromPoints(previewPts);
    const dashed = new THREE.LineDashedMaterial({
      color: SCENE_COLORS.drawLine, dashSize: 0.15, gapSize: 0.1,
      depthTest: false, transparent: true, opacity: 0.6,
    });
    const pLine = new THREE.Line(pGeo, dashed);
    pLine.computeLineDistances();
    pLine.renderOrder = 998;
    drawGroup.add(pLine);

    if (verts.length >= 3) {
      const closePts = [new THREE.Vector3(cursorPt.x, 0.01, cursorPt.z), new THREE.Vector3(verts[0].x, 0.01, verts[0].z)];
      const cGeo = new THREE.BufferGeometry().setFromPoints(closePts);
      const cMat = new THREE.LineDashedMaterial({
        color: SCENE_COLORS.drawClose, dashSize: 0.1, gapSize: 0.1,
        depthTest: false, transparent: true, opacity: 0.4,
      });
      const cLine = new THREE.Line(cGeo, cMat);
      cLine.computeLineDistances();
      cLine.renderOrder = 998;
      drawGroup.add(cLine);
    }

    const curDotMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.drawLine, depthTest: false, transparent: true, opacity: 0.6,
    });
    const curDot = new THREE.Mesh(dotGeo, curDotMat);
    curDot.position.set(cursorPt.x, 0.02, cursorPt.z);
    curDot.renderOrder = 999;
    drawGroup.add(curDot);
  }
}
