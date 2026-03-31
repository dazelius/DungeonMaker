import * as THREE from 'three';
import type { LevelObject } from '../types';
import { computeFreeEdges, type FreeEdge } from '../utils/freeEdge';
import { clearGroup } from './threeUtils';

const ARROW_COLOR = 0x00cc88;
const EDGE_COLOR = 0x4499ff;
const ARROW_LEN = 1.8;
const ARROW_HEAD_LEN = 0.5;
const ARROW_HEAD_W = 0.3;
const EDGE_Y_OFFSET = 0.06;

export function updateFreeEdgeOverlay(
  group: THREE.Group,
  objects: LevelObject[],
  selectedIds: string[],
): void {
  clearGroup(group);

  if (selectedIds.length !== 1) return;

  const obj = objects.find((o) => o.id === selectedIds[0]);
  if (!obj) return;

  const supportedTypes = new Set(['polygon', 'plane', 'road', 'ramp', 'wall', 'cliff', 'trim']);
  if (!supportedTypes.has(obj.type)) return;

  const edges: FreeEdge[] = computeFreeEdges(obj, objects);

  for (const edge of edges) {
    const ey = edge.midpoint.y + EDGE_Y_OFFSET;

    const p0 = new THREE.Vector3(edge.edgeFrom.x, ey, edge.edgeFrom.z);
    const p1 = new THREE.Vector3(edge.edgeTo.x, ey, edge.edgeTo.z);
    const edgeGeo = new THREE.BufferGeometry().setFromPoints([p0, p1]);
    const edgeMat = new THREE.LineBasicMaterial({
      color: EDGE_COLOR, depthTest: false,
    });
    const edgeLine = new THREE.Line(edgeGeo, edgeMat);
    edgeLine.renderOrder = 901;
    group.add(edgeLine);

    const dotGeo = new THREE.SphereGeometry(0.12, 8, 6);
    const dotMat = new THREE.MeshBasicMaterial({ color: EDGE_COLOR, depthTest: false });
    const dot0 = new THREE.Mesh(dotGeo, dotMat);
    dot0.position.copy(p0);
    dot0.renderOrder = 902;
    const dot1 = new THREE.Mesh(dotGeo, dotMat.clone());
    dot1.position.copy(p1);
    dot1.renderOrder = 902;
    group.add(dot0, dot1);

    const dir = new THREE.Vector3(edge.normal.x, 0, edge.normal.z).normalize();
    const origin = new THREE.Vector3(edge.midpoint.x, ey, edge.midpoint.z);
    const arrow = new THREE.ArrowHelper(dir, origin, ARROW_LEN, ARROW_COLOR, ARROW_HEAD_LEN, ARROW_HEAD_W);
    arrow.renderOrder = 900;
    arrow.line.renderOrder = 900;
    arrow.cone.renderOrder = 900;
    (arrow.line.material as THREE.LineBasicMaterial).depthTest = false;
    (arrow.cone.material as THREE.MeshBasicMaterial).depthTest = false;
    group.add(arrow);
  }
}
