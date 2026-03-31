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

export function exportFBX(scene: THREE.Scene, filename: string): void {
  const baseName = filename.replace(/\.\w+$/, '');
  const texName = `${baseName}_checker.png`;
  const fbx = buildFBXAscii(scene, texName);
  downloadBlob(new Blob([fbx], { type: 'application/octet-stream' }), `${baseName}.fbx`);
  downloadBlob(generateCheckerPNG(), texName);
}

export async function exportFBXToDir(scene: THREE.Scene, baseName: string, dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const texName = `${baseName}_checker.png`;
  const fbx = buildFBXAscii(scene, texName);
  await writeToDir(dirHandle, `${baseName}.fbx`, new Blob([fbx], { type: 'application/octet-stream' }));
  await writeToDir(dirHandle, texName, generateCheckerPNG());
}

export async function exportOBJToDir(scene: THREE.Scene, baseName: string, dirHandle: FileSystemDirectoryHandle): Promise<void> {
  const exporter = new OBJExporter();
  const exportScene = buildExportScene(scene);
  const result = exporter.parse(exportScene);
  await writeToDir(dirHandle, `${baseName}.obj`, new Blob([result], { type: 'text/plain' }));
}

async function writeToDir(dirHandle: FileSystemDirectoryHandle, name: string, blob: Blob): Promise<void> {
  const fh = await dirHandle.getFileHandle(name, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();
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

/* ── checker PNG generator ── */

function generateCheckerPNG(): Blob {
  const size = 128;
  const half = size / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, half, half);
  ctx.fillRect(half, half, half, half);
  const dataUrl = canvas.toDataURL('image/png');
  const bin = atob(dataUrl.split(',')[1]);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}

/* ── FBX 7.4 ASCII exporter ── */

let nextFbxId = 100000;
function fbxId(): number { return nextFbxId++; }

function arr(a: ArrayLike<number>): string {
  const parts: string[] = [];
  for (let i = 0; i < a.length; i++) parts.push(String(a[i]));
  return parts.join(',');
}

interface MeshEntry {
  name: string;
  geoId: number;
  modelId: number;
  matId: number;
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  index: Uint16Array | Uint32Array | null;
  color: string;
  tx: number; ty: number; tz: number;
  rx: number; ry: number; rz: number;
  sx: number; sy: number; sz: number;
}

function hexToRgb(hex: string): [number, number, number] {
  const c = parseInt(hex.replace('#', ''), 16);
  return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255];
}

function collectMeshes(scene: THREE.Scene): MeshEntry[] {
  scene.updateMatrixWorld(true);

  const entries: MeshEntry[] = [];
  let idx = 0;
  const _v = new THREE.Vector3();
  const _n = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const M_TO_CM = 100;

  scene.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    if (!mesh.userData.levelObjectId) return;
    if (!mesh.visible) return;

    const geo = mesh.geometry;
    if (!geo) return;

    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute | null;
    if (!posAttr || posAttr.count === 0) return;

    const nrmAttr = geo.getAttribute('normal') as THREE.BufferAttribute | null;
    const uvAttr = geo.getAttribute('uv') as THREE.BufferAttribute | null;
    const indexAttr = geo.getIndex();

    const mat = mesh.material as THREE.MeshStandardMaterial;
    const colorHex = mat?.color ? '#' + mat.color.getHexString() : '#cccccc';
    const objName = mesh.name || `mesh_${idx}`;

    const worldMatrix = mesh.matrixWorld;
    normalMatrix.getNormalMatrix(worldMatrix);

    const bakedPos = new Float32Array(posAttr.count * 3);
    for (let i = 0; i < posAttr.count; i++) {
      _v.fromBufferAttribute(posAttr, i);
      _v.applyMatrix4(worldMatrix);
      bakedPos[i * 3]     = _v.x * M_TO_CM;
      bakedPos[i * 3 + 1] = _v.y * M_TO_CM;
      bakedPos[i * 3 + 2] = _v.z * M_TO_CM;
    }

    let bakedNormals: Float32Array | null = null;
    if (nrmAttr) {
      bakedNormals = new Float32Array(nrmAttr.count * 3);
      for (let i = 0; i < nrmAttr.count; i++) {
        _n.fromBufferAttribute(nrmAttr, i);
        _n.applyMatrix3(normalMatrix).normalize();
        bakedNormals[i * 3]     = _n.x;
        bakedNormals[i * 3 + 1] = _n.y;
        bakedNormals[i * 3 + 2] = _n.z;
      }
    }

    entries.push({
      name: String(objName),
      geoId: fbxId(),
      modelId: fbxId(),
      matId: fbxId(),
      positions: bakedPos,
      normals: bakedNormals,
      uvs: uvAttr ? new Float32Array(uvAttr.array) : null,
      index: indexAttr ? (indexAttr.array instanceof Uint32Array
        ? new Uint32Array(indexAttr.array)
        : new Uint16Array(indexAttr.array)) : null,
      color: colorHex,
      tx: 0, ty: 0, tz: 0,
      rx: 0, ry: 0, rz: 0,
      sx: 1, sy: 1, sz: 1,
    });
    idx++;
  });

  console.log(`[FBX Export] Collected ${entries.length} meshes`);
  return entries;
}

function buildFBXAscii(scene: THREE.Scene, texFilename: string): string {
  nextFbxId = 100000;
  const meshes = collectMeshes(scene);
  const texId = fbxId();
  const videoId = fbxId();

  const lines: string[] = [];
  const p = (s: string) => lines.push(s);

  p('; FBX 7.4.0 project file');
  p('FBXHeaderExtension:  {');
  p('\tFBXHeaderVersion: 1003');
  p('\tFBXVersion: 7400');
  p('\tCreator: "SUILE2 Graybox Editor"');
  p('}');
  p('');

  p('GlobalSettings:  {');
  p('\tVersion: 1000');
  p('\tProperties70:  {');
  p('\t\tP: "UpAxis", "int", "Integer", "",1');
  p('\t\tP: "UpAxisSign", "int", "Integer", "",1');
  p('\t\tP: "FrontAxis", "int", "Integer", "",2');
  p('\t\tP: "FrontAxisSign", "int", "Integer", "",1');
  p('\t\tP: "CoordAxis", "int", "Integer", "",0');
  p('\t\tP: "CoordAxisSign", "int", "Integer", "",1');
  p('\t\tP: "UnitScaleFactor", "double", "Number", "",1');
  p('\t}');
  p('}');
  p('');

  const objCount = meshes.length * 3 + 2;
  p('Definitions:  {');
  p(`\tCount: ${objCount + 1}`);
  p('\tObjectType: "Geometry" {');
  p(`\t\tCount: ${meshes.length}`);
  p('\t}');
  p('\tObjectType: "Model" {');
  p(`\t\tCount: ${meshes.length}`);
  p('\t}');
  p('\tObjectType: "Material" {');
  p(`\t\tCount: ${meshes.length}`);
  p('\t}');
  p('\tObjectType: "Texture" {');
  p('\t\tCount: 1');
  p('\t}');
  p('\tObjectType: "Video" {');
  p('\t\tCount: 1');
  p('\t}');
  p('}');
  p('');

  p('Objects:  {');
  for (const m of meshes) {
    writeGeometry(lines, m);
    writeModel(lines, m);
    writeMaterial(lines, m);
  }
  p(`\tTexture: ${texId}, "Texture::checker", "" {`);
  p('\t\tType: "TextureVideoClip"');
  p(`\t\tFileName: "${texFilename}"`);
  p(`\t\tRelativeFilename: "${texFilename}"`);
  p('\t\tProperties70:  {');
  p('\t\t\tP: "UVSet", "KString", "", "", "UVMap"');
  p('\t\t}');
  p('\t}');
  p(`\tVideo: ${videoId}, "Video::checker", "Clip" {`);
  p('\t\tType: "Clip"');
  p(`\t\tFileName: "${texFilename}"`);
  p(`\t\tRelativeFilename: "${texFilename}"`);
  p('\t}');
  p('}');
  p('');

  p('Connections:  {');
  for (const m of meshes) {
    p(`\tC: "OO",${m.modelId},0`);
    p(`\tC: "OO",${m.geoId},${m.modelId}`);
    p(`\tC: "OO",${m.matId},${m.modelId}`);
    p(`\tC: "OP",${texId},${m.matId},"DiffuseColor"`);
  }
  p(`\tC: "OO",${videoId},${texId}`);
  p('}');

  return lines.join('\n');
}

function writeGeometry(lines: string[], m: MeshEntry) {
  const p = (s: string) => lines.push(s);

  const vertCount = m.positions.length / 3;
  let triIndices: number[];

  if (m.index) {
    triIndices = Array.from(m.index);
  } else {
    triIndices = [];
    for (let i = 0; i < vertCount; i++) triIndices.push(i);
  }

  const polyIndices: number[] = [];
  for (let i = 0; i < triIndices.length; i += 3) {
    polyIndices.push(triIndices[i], triIndices[i + 1], -(triIndices[i + 2] + 1));
  }

  p(`\tGeometry: ${m.geoId}, "Geometry::${m.name}", "Mesh" {`);
  p(`\t\tVertices: *${m.positions.length} {`);
  p(`\t\t\ta: ${arr(m.positions)}`);
  p('\t\t}');
  p(`\t\tPolygonVertexIndex: *${polyIndices.length} {`);
  p(`\t\t\ta: ${arr(polyIndices)}`);
  p('\t\t}');

  if (m.normals) {
    let nrmData: Float32Array;
    nrmData = new Float32Array(triIndices.length * 3);
    for (let i = 0; i < triIndices.length; i++) {
      const vi = triIndices[i];
      nrmData[i * 3] = m.normals[vi * 3];
      nrmData[i * 3 + 1] = m.normals[vi * 3 + 1];
      nrmData[i * 3 + 2] = m.normals[vi * 3 + 2];
    }
    p('\t\tLayerElementNormal: 0 {');
    p('\t\t\tVersion: 101');
    p('\t\t\tName: ""');
    p('\t\t\tMappingInformationType: "ByPolygonVertex"');
    p('\t\t\tReferenceInformationType: "Direct"');
    p(`\t\t\tNormals: *${nrmData.length} {`);
    p(`\t\t\t\ta: ${arr(nrmData)}`);
    p('\t\t\t}');
    p('\t\t}');
  }

  if (m.uvs) {
    let uvData: Float32Array;
    uvData = new Float32Array(triIndices.length * 2);
    for (let i = 0; i < triIndices.length; i++) {
      const vi = triIndices[i];
      uvData[i * 2] = m.uvs[vi * 2];
      uvData[i * 2 + 1] = m.uvs[vi * 2 + 1];
    }
    p('\t\tLayerElementUV: 0 {');
    p('\t\t\tVersion: 101');
    p('\t\t\tName: "UVMap"');
    p('\t\t\tMappingInformationType: "ByPolygonVertex"');
    p('\t\t\tReferenceInformationType: "Direct"');
    p(`\t\t\tUV: *${uvData.length} {`);
    p(`\t\t\t\ta: ${arr(uvData)}`);
    p('\t\t\t}');
    p('\t\t}');
  }

  p('\t\tLayer: 0 {');
  p('\t\t\tVersion: 100');
  if (m.normals) {
    p('\t\t\tLayerElement:  {');
    p('\t\t\t\tType: "LayerElementNormal"');
    p('\t\t\t\tTypedIndex: 0');
    p('\t\t\t}');
  }
  if (m.uvs) {
    p('\t\t\tLayerElement:  {');
    p('\t\t\t\tType: "LayerElementUV"');
    p('\t\t\t\tTypedIndex: 0');
    p('\t\t\t}');
  }
  p('\t\t}');
  p('\t}');
}

function writeModel(lines: string[], m: MeshEntry) {
  const p = (s: string) => lines.push(s);
  p(`\tModel: ${m.modelId}, "Model::${m.name}", "Mesh" {`);
  p('\t\tVersion: 232');
  p('\t\tProperties70:  {');
  p(`\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",${m.tx},${m.ty},${m.tz}`);
  p(`\t\t\tP: "Lcl Rotation", "Lcl Rotation", "", "A",${m.rx},${m.ry},${m.rz}`);
  p(`\t\t\tP: "Lcl Scaling", "Lcl Scaling", "", "A",${m.sx},${m.sy},${m.sz}`);
  p('\t\t}');
  p('\t}');
}

function writeMaterial(lines: string[], m: MeshEntry) {
  const p = (s: string) => lines.push(s);
  const [r, g, b] = hexToRgb(m.color);
  p(`\tMaterial: ${m.matId}, "Material::${m.name}_mat", "" {`);
  p('\t\tVersion: 102');
  p('\t\tProperties70:  {');
  p(`\t\t\tP: "DiffuseColor", "Color", "", "A",${r},${g},${b}`);
  p(`\t\t\tP: "Emissive", "Vector3D", "Vector", "",0,0,0`);
  p(`\t\t\tP: "Ambient", "Vector3D", "Vector", "",0.2,0.2,0.2`);
  p(`\t\t\tP: "Diffuse", "Vector3D", "Vector", "",${r},${g},${b}`);
  p(`\t\t\tP: "Opacity", "double", "Number", "",1`);
  p('\t\t}');
  p('\t}');
}
