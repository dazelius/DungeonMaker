import * as THREE from 'three';
import { SCENE_COLORS } from '../constants';
import type { LevelObject } from '../types';
import { clearGroup } from './threeUtils';

export function updateMeasurements(
  measureGroup: THREE.Group,
  objects: LevelObject[],
  selectedIds: string[],
  show: boolean,
): void {
  clearGroup(measureGroup);

  if (!show || selectedIds.length === 0) return;

  const selObjs = objects.filter((o) => selectedIds.includes(o.id));
  if (selObjs.length === 0) return;

  const lineMat = new THREE.LineBasicMaterial({
    color: SCENE_COLORS.measure, depthTest: false, transparent: true, opacity: 0.7,
  });

  for (const obj of selObjs) {
    const p = obj.position;
    const groundPts = [new THREE.Vector3(p.x, p.y, p.z), new THREE.Vector3(p.x, 0, p.z)];
    measureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(groundPts), lineMat.clone()));

    const xPts = [new THREE.Vector3(0, 0, p.z), new THREE.Vector3(p.x, 0, p.z)];
    measureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(xPts), lineMat.clone()));

    const zPts = [new THREE.Vector3(p.x, 0, 0), new THREE.Vector3(p.x, 0, p.z)];
    measureGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(zPts), lineMat.clone()));
  }

  if (selObjs.length >= 2) {
    for (let i = 0; i < selObjs.length; i++) {
      for (let j = i + 1; j < selObjs.length; j++) {
        const a = selObjs[i].position;
        const b = selObjs[j].position;
        const pts = [new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(b.x, b.y, b.z)];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const dashed = new THREE.LineDashedMaterial({
          color: SCENE_COLORS.measure, dashSize: 0.15, gapSize: 0.1,
          depthTest: false, transparent: true, opacity: 0.5,
        });
        const line = new THREE.Line(geo, dashed);
        line.computeLineDistances();
        measureGroup.add(line);
      }
    }
  }
}
