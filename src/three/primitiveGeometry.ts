import * as THREE from 'three';
import type { PrimitiveType, Vec3 } from '../types';
import { EDITOR, GEOMETRY, OBJECT_DEFAULTS } from '../constants';

/**
 * All geometries have their pivot at the BOTTOM CENTER.
 * Y=0 is the bottom face so objects sit naturally on the ground.
 */
export function createGeometry(type: PrimitiveType): THREE.BufferGeometry {
  switch (type) {
    case 'box': {
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'plane': {
      const s = EDITOR.planeSize;
      const t = GEOMETRY.polyThin;
      const g = new THREE.BoxGeometry(s, t, s);
      g.translate(0, t / 2, 0);
      return g;
    }
    case 'cylinder': {
      const g = new THREE.CylinderGeometry(0.5, 0.5, 1, EDITOR.cylinderSegments);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'sphere': {
      const g = new THREE.SphereGeometry(0.5, EDITOR.sphereWidthSegments, EDITOR.sphereHeightSegments);
      g.translate(0, 0.5, 0);
      return g;
    }
    case 'stairs': {
      const steps = EDITOR.stairSteps;
      const stepH = 1 / steps;
      const stepD = 1 / steps;
      const geos: THREE.BoxGeometry[] = [];
      for (let i = 0; i < steps; i++) {
        const g = new THREE.BoxGeometry(1, stepH, stepD);
        g.translate(0, stepH * i + stepH / 2, stepD * i + stepD / 2 - 0.5);
        geos.push(g);
      }
      const merged = mergeGeometries(geos);
      geos.forEach((g) => g.dispose());
      return merged ?? new THREE.BoxGeometry(1, 1, 1);
    }
    case 'ramp':
      return new THREE.BoxGeometry(1, 0.1, 1);
    case 'polygon':
      return new THREE.BoxGeometry(1, GEOMETRY.polyThin, 1);
    case 'road':
      return new THREE.PlaneGeometry(OBJECT_DEFAULTS.roadWidth, 1);
    case 'wall':
      return new THREE.BoxGeometry(1, OBJECT_DEFAULTS.wallHeight, OBJECT_DEFAULTS.wallThickness);
    case 'cliff':
      return new THREE.BoxGeometry(1, OBJECT_DEFAULTS.cliffHeight, OBJECT_DEFAULTS.cliffThickness);
    case 'trim':
      return new THREE.BoxGeometry(1, OBJECT_DEFAULTS.trimHeight, OBJECT_DEFAULTS.trimThickness);
  }
}

export function createRampGeometry(start: Vec3, end: Vec3, width: number, height: number): THREE.BufferGeometry {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.001) return new THREE.BoxGeometry(0.1, 0.1, 0.1);

  const h = Math.max(0.01, height);
  const hw = width / 2;

  const dirX = dx / len;
  const dirZ = dz / len;
  const nrmX = -dirZ;
  const nrmZ = dirX;

  const sx = start.x, sz = start.z;
  const ex = end.x, ez = end.z;
  const baseY = start.y ?? 0;
  const topY = baseY + h;

  const s0x = sx - nrmX * hw, s0z = sz - nrmZ * hw;
  const s1x = sx + nrmX * hw, s1z = sz + nrmZ * hw;
  const e0x = ex - nrmX * hw, e0z = ez - nrmZ * hw;
  const e1x = ex + nrmX * hw, e1z = ez + nrmZ * hw;

  const positions = new Float32Array([
    // slope face
    s0x, baseY, s0z,   s1x, baseY, s1z,   e1x, topY, e1z,
    s0x, baseY, s0z,   e1x, topY, e1z,   e0x, topY, e0z,
    // bottom face
    s0x, baseY, s0z,   e0x, baseY, e0z,   e1x, baseY, e1z,
    s0x, baseY, s0z,   e1x, baseY, e1z,   s1x, baseY, s1z,
    // back face (high wall at end)
    e0x, baseY, e0z,   e0x, topY, e0z,   e1x, topY, e1z,
    e0x, baseY, e0z,   e1x, topY, e1z,   e1x, baseY, e1z,
    // left side triangle
    s0x, baseY, s0z,   e0x, topY, e0z,   e0x, baseY, e0z,
    // right side triangle
    s1x, baseY, s1z,   e1x, baseY, e1z,   e1x, topY, e1z,
  ]);

  const uvScale = 0.5;
  const uvs = new Float32Array([
    // slope (use world XZ)
    s0x*uvScale, s0z*uvScale,  s1x*uvScale, s1z*uvScale,  e1x*uvScale, e1z*uvScale,
    s0x*uvScale, s0z*uvScale,  e1x*uvScale, e1z*uvScale,  e0x*uvScale, e0z*uvScale,
    // bottom
    s0x*uvScale, s0z*uvScale,  e0x*uvScale, e0z*uvScale,  e1x*uvScale, e1z*uvScale,
    s0x*uvScale, s0z*uvScale,  e1x*uvScale, e1z*uvScale,  s1x*uvScale, s1z*uvScale,
    // back wall
    e0x*uvScale, baseY*uvScale,  e0x*uvScale, topY*uvScale,  e1x*uvScale, topY*uvScale,
    e0x*uvScale, baseY*uvScale,  e1x*uvScale, topY*uvScale,  e1x*uvScale, baseY*uvScale,
    // left side tri
    s0x*uvScale, baseY*uvScale,  e0x*uvScale, topY*uvScale,  e0x*uvScale, baseY*uvScale,
    // right side tri
    s1x*uvScale, baseY*uvScale,  e1x*uvScale, baseY*uvScale,  e1x*uvScale, topY*uvScale,
  ]);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.computeVertexNormals();
  return geo;
}

export function createPolygonGeometry(vertices: Vec3[], extrudeHeight = 0): THREE.BufferGeometry {
  const cleaned = deduplicateAdjacent(vertices);
  if (cleaned.length < 3) return new THREE.BoxGeometry(1, GEOMETRY.polyThin, 1);

  const ordered = ensureCCW(cleaned);

  const shape = new THREE.Shape();
  shape.moveTo(ordered[0].x, ordered[0].z);
  for (let i = 1; i < ordered.length; i++) {
    shape.lineTo(ordered[i].x, ordered[i].z);
  }

  const baseY = ordered[0].y ?? 0;

  if (extrudeHeight > 0) {
    return createExtrudedPolygon(shape, extrudeHeight, baseY);
  }
  return createFlatPolygon(shape, baseY);
}

function createFlatPolygon(shape: THREE.Shape, baseY = 0): THREE.BufferGeometry {
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getY(i);
    pos.setXYZ(i, x, baseY + GEOMETRY.polyThin, z);
  }
  pos.needsUpdate = true;

  const idx = geo.getIndex();
  if (idx) {
    const idxArr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < idxArr.length; i += 3) {
      const tmp = idxArr[i + 1];
      idxArr[i + 1] = idxArr[i + 2];
      idxArr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }

  const nrmArr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    nrmArr[i * 3] = 0;
    nrmArr[i * 3 + 1] = 1;
    nrmArr[i * 3 + 2] = 0;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3));

  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  }
  uv.needsUpdate = true;
  return geo;
}

function createExtrudedPolygon(shape: THREE.Shape, height: number, baseY = 0): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
  });

  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const shapeY = pos.getY(i);
    const extZ = pos.getZ(i);
    pos.setXYZ(i, x, baseY + extZ, shapeY);
  }
  pos.needsUpdate = true;

  const idx = geo.getIndex();
  if (idx) {
    const arr = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const tmp = arr[i + 1];
      arr[i + 1] = arr[i + 2];
      arr[i + 2] = tmp;
    }
    idx.needsUpdate = true;
  }

  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * 0.5, uv.getY(i) * 0.5);
  }
  uv.needsUpdate = true;

  geo.computeVertexNormals();
  return geo;
}

function ensureCCW(verts: Vec3[]): Vec3[] {
  let area = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    area += (verts[j].x - verts[i].x) * (verts[j].z + verts[i].z);
  }
  return area > 0 ? [...verts].reverse() : verts;
}

function deduplicateAdjacent(verts: Vec3[]): Vec3[] {
  if (verts.length === 0) return verts;
  const EPS = GEOMETRY.vertexDedupeEps;
  const result: Vec3[] = [verts[0]];
  for (let i = 1; i < verts.length; i++) {
    const prev = result[result.length - 1];
    const dx = verts[i].x - prev.x;
    const dz = verts[i].z - prev.z;
    if (Math.abs(dx) > EPS || Math.abs(dz) > EPS) {
      result.push(verts[i]);
    }
  }
  if (result.length > 1) {
    const first = result[0];
    const last = result[result.length - 1];
    if (Math.abs(first.x - last.x) < EPS && Math.abs(first.z - last.z) < EPS) {
      result.pop();
    }
  }
  return result;
}

export function createRoadGeometry(controlPoints: Vec3[], width: number): THREE.BufferGeometry {
  if (controlPoints.length < 2) return new THREE.PlaneGeometry(width, 1);

  const pts3 = controlPoints.map((v) => new THREE.Vector3(v.x, v.y ?? 0, v.z));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.5);
  const segCount = Math.max(2, (controlPoints.length - 1) * EDITOR.roadSegmentsPerPoint);
  const samples = curve.getPoints(segCount);

  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const halfW = width / 2;

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    let tangent: THREE.Vector3;
    if (i < samples.length - 1) {
      tangent = new THREE.Vector3().subVectors(samples[i + 1], p).normalize();
    } else {
      tangent = new THREE.Vector3().subVectors(p, samples[i - 1]).normalize();
    }
    const flatTangent = new THREE.Vector3(tangent.x, 0, tangent.z).normalize();
    const normal = new THREE.Vector3(-flatTangent.z, 0, flatTangent.x);
    const left = new THREE.Vector3().copy(p).addScaledVector(normal, halfW);
    const right = new THREE.Vector3().copy(p).addScaledVector(normal, -halfW);
    const surfY = p.y + GEOMETRY.polyThin;
    positions.push(left.x, surfY, left.z);
    positions.push(right.x, surfY, right.z);
    uvs.push(left.x * 0.5, left.z * 0.5);
    uvs.push(right.x * 0.5, right.z * 0.5);
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b);
    indices.push(b, c, d);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  const nrmArr = new Float32Array((positions.length / 3) * 3);
  for (let i = 0; i < positions.length / 3; i++) {
    nrmArr[i * 3] = 0;
    nrmArr[i * 3 + 1] = 1;
    nrmArr[i * 3 + 2] = 0;
  }
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrmArr, 3));
  return geo;
}

export function createWallGeometry(start: Vec3, end: Vec3, height: number, thickness: number): THREE.BufferGeometry {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.001) return new THREE.BoxGeometry(0.1, height, thickness);

  const baseY = Math.min(start.y ?? 0, end.y ?? 0);

  const geo = new THREE.BoxGeometry(length, height, thickness);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * length * 0.5, uv.getY(i) * height * 0.5);
  }
  uv.needsUpdate = true;
  geo.translate(0, height / 2, 0);

  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;

  const rotMatrix = new THREE.Matrix4().makeRotationY(-angle);
  const transMatrix = new THREE.Matrix4().makeTranslation(cx, baseY, cz);
  geo.applyMatrix4(rotMatrix);
  geo.applyMatrix4(transMatrix);
  return geo;
}

export function createCliffGeometry(start: Vec3, end: Vec3, height: number, thickness: number): THREE.BufferGeometry {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.001) return new THREE.BoxGeometry(0.1, height, thickness);

  const baseY = Math.min(start.y ?? 0, end.y ?? 0);

  const geo = new THREE.BoxGeometry(length, height, thickness);
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * length * 0.5, uv.getY(i) * height * 0.5);
  }
  uv.needsUpdate = true;
  geo.translate(0, -height / 2, 0);

  const angle = Math.atan2(dz, dx);
  const cx = (start.x + end.x) / 2;
  const cz = (start.z + end.z) / 2;

  const rotMatrix = new THREE.Matrix4().makeRotationY(-angle);
  const transMatrix = new THREE.Matrix4().makeTranslation(cx, baseY, cz);
  geo.applyMatrix4(rotMatrix);
  geo.applyMatrix4(transMatrix);
  return geo;
}

export function createCurvedWallGeometry(
  controlPoints: Vec3[],
  height: number,
  thickness: number,
): THREE.BufferGeometry {
  if (controlPoints.length < 2) return new THREE.BoxGeometry(0.1, height, thickness);

  const pts3 = controlPoints.map((v) => new THREE.Vector3(v.x, v.y ?? 0, v.z));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.5);
  const segCount = Math.max(2, (controlPoints.length - 1) * EDITOR.roadSegmentsPerPoint);
  const samples = curve.getPoints(segCount);

  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];
  const halfT = thickness / 2;
  let totalLen = 0;

  for (let i = 0; i < samples.length; i++) {
    const p = samples[i];
    let tx: number, tz: number;
    if (i < samples.length - 1) {
      tx = samples[i + 1].x - p.x;
      tz = samples[i + 1].z - p.z;
    } else {
      tx = p.x - samples[i - 1].x;
      tz = p.z - samples[i - 1].z;
    }
    const len = Math.sqrt(tx * tx + tz * tz) || 1;
    const nx = -tz / len * halfT;
    const nz = tx / len * halfT;

    if (i > 0) totalLen += p.distanceTo(samples[i - 1]);
    const u = totalLen / 2;
    const vTop = height / 2;
    const baseY = p.y;

    positions.push(p.x + nx, baseY, p.z + nz);              // outer bottom
    positions.push(p.x + nx, baseY + height, p.z + nz);     // outer top
    positions.push(p.x - nx, baseY, p.z - nz);              // inner bottom
    positions.push(p.x - nx, baseY + height, p.z - nz);     // inner top

    uvs.push(u, 0, u, vTop, u, 0, u, vTop);
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const base = i * 4;
    const next = base + 4;
    // outer face
    indices.push(base, next, base + 1);
    indices.push(base + 1, next, next + 1);
    // inner face (reversed winding)
    indices.push(base + 2, base + 3, next + 2);
    indices.push(base + 3, next + 3, next + 2);
    // top face
    indices.push(base + 1, next + 1, base + 3);
    indices.push(base + 3, next + 1, next + 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geos.length === 0) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const geo of geos) {
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const idx = geo.getIndex();
    if (!pos || !nor) continue;
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
    }
    if (idx) {
      for (let i = 0; i < idx.count; i++) indices.push(idx.getX(i) + offset);
    } else {
      for (let i = 0; i < pos.count; i++) indices.push(i + offset);
    }
    offset += pos.count;
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}
