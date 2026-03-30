import * as THREE from 'three';
import { SCENE_COLORS, OBJECT_DEFAULTS, EDITOR } from '../constants';
import type { Vec3 } from '../types';
import { clearGroup } from './threeUtils';

export function renderRoadPreview(
  drawGroup: THREE.Group,
  roadVerts: Vec3[],
  cursorPt: Vec3 | null,
): void {
  clearGroup(drawGroup);
  const dotGeo = new THREE.SphereGeometry(0.1, 8, 8);

  const allPts = [...roadVerts];
  if (cursorPt && roadVerts.length > 0) allPts.push(cursorPt);

  for (let i = 0; i < roadVerts.length; i++) {
    const v = roadVerts[i];
    const mat = new THREE.MeshBasicMaterial({ color: SCENE_COLORS.roadPreview, depthTest: false });
    const dot = new THREE.Mesh(dotGeo, mat);
    dot.position.set(v.x, 0.02, v.z);
    dot.scale.setScalar(i === 0 ? 1.5 : 1);
    dot.renderOrder = 999;
    drawGroup.add(dot);
  }

  if (allPts.length >= 2) {
    const pts3 = allPts.map((v) => new THREE.Vector3(v.x, 0, v.z));
    const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.5);
    const segCount = Math.max(2, (allPts.length - 1) * EDITOR.roadSegmentsPerPoint);
    const samples = curve.getPoints(segCount);

    const centerPts = samples.map((p) => new THREE.Vector3(p.x, 0.01, p.z));
    const centerGeo = new THREE.BufferGeometry().setFromPoints(centerPts);
    const centerMat = new THREE.LineBasicMaterial({ color: SCENE_COLORS.roadPreview, depthTest: false });
    const centerLine = new THREE.Line(centerGeo, centerMat);
    centerLine.renderOrder = 998;
    drawGroup.add(centerLine);

    const halfW = OBJECT_DEFAULTS.roadWidth / 2;
    const leftPts: THREE.Vector3[] = [];
    const rightPts: THREE.Vector3[] = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i];
      let tangent: THREE.Vector3;
      if (i < samples.length - 1) tangent = new THREE.Vector3().subVectors(samples[i + 1], p).normalize();
      else tangent = new THREE.Vector3().subVectors(p, samples[i - 1]).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      leftPts.push(new THREE.Vector3().copy(p).addScaledVector(normal, halfW).setY(0.01));
      rightPts.push(new THREE.Vector3().copy(p).addScaledVector(normal, -halfW).setY(0.01));
    }

    const leftGeo = new THREE.BufferGeometry().setFromPoints(leftPts);
    const dashed = new THREE.LineDashedMaterial({
      color: SCENE_COLORS.roadPreview, dashSize: 0.2, gapSize: 0.1,
      depthTest: false, transparent: true, opacity: 0.4,
    });
    const leftLine = new THREE.Line(leftGeo, dashed);
    leftLine.computeLineDistances();
    leftLine.renderOrder = 998;
    drawGroup.add(leftLine);

    const rightGeo = new THREE.BufferGeometry().setFromPoints(rightPts);
    const dashed2 = dashed.clone();
    const rightLine = new THREE.Line(rightGeo, dashed2);
    rightLine.computeLineDistances();
    rightLine.renderOrder = 998;
    drawGroup.add(rightLine);
  }

  if (cursorPt && roadVerts.length > 0) {
    const curDotMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.roadPreview, depthTest: false, transparent: true, opacity: 0.6,
    });
    const curDot = new THREE.Mesh(dotGeo, curDotMat);
    curDot.position.set(cursorPt.x, 0.02, cursorPt.z);
    curDot.renderOrder = 999;
    drawGroup.add(curDot);
  }
}
