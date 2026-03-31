import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SCENE_COLORS, EDITOR } from '../constants';
import { useEditor } from '../store';
import { snapVec3 } from '../utils/math';
import { registerViewportScene } from './sceneRegistry';
import type { ViewMode } from '../types';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  scene: THREE.Scene;
  perspCam: THREE.PerspectiveCamera;
  orthoCam: THREE.OrthographicCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  gizmoPivot: THREE.Object3D;
  groundPlane: THREE.Mesh;
  gridHelper: THREE.GridHelper;
  measureGroup: THREE.Group;
  drawGroup: THREE.Group;
  freeEdgeGroup: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
  labelMap: Map<string, CSS2DObject>;

  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera;
  getViewMode(): ViewMode;
  setViewMode(mode: ViewMode): void;
  resize(): void;
  dispose(): void;
}

export function createSceneContext(container: HTMLDivElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(SCENE_COLORS.bg);
  renderer.shadowMap.enabled = true;
  container.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(container.clientWidth, container.clientHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  container.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  registerViewportScene(scene);

  const perspCam = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  const cp = EDITOR.defaultCameraPos;
  perspCam.position.set(cp.x, cp.y, cp.z);
  perspCam.lookAt(0, 0, 0);

  const os = EDITOR.orthoSize;
  const orthoCam = new THREE.OrthographicCamera(-os, os, os, -os, 0.1, 500);
  orthoCam.position.set(0, EDITOR.orthoHeight, 0);
  orthoCam.lookAt(0, 0, 0);
  orthoCam.up.set(0, 0, -1);

  let _viewMode: ViewMode = 'perspective';
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspCam;

  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;

  const gizmoPivot = new THREE.Object3D();
  gizmoPivot.name = '__gizmoPivot__';
  scene.add(gizmoPivot);

  const transformControls = new TransformControls(camera, renderer.domElement);
  renderer.domElement.addEventListener('pointerdown', () => {
    if ((transformControls as any).axis !== null) {
      orbitControls.enabled = false;
    }
  }, true);
  transformControls.addEventListener('dragging-changed', (e) => {
    orbitControls.enabled = !e.value;
    if (e.value) {
      const obj = transformControls.object;
      if (obj?.userData.levelObjectId) {
        useEditor.getState().beginBatch(obj.userData.levelObjectId);
      }
    } else {
      useEditor.getState().commitBatch();
    }
  });
  transformControls.addEventListener('objectChange', () => {
    const obj = transformControls.object;
    if (!obj?.userData.levelObjectId) return;
    const state = useEditor.getState();
    const { snapEnabled, gridSize } = state;
    const id = obj.userData.levelObjectId as string;
    const levelObj = state.objects.find((o) => o.id === id);
    if (!levelObj) return;

    const mode = transformControls.getMode();
    const isBakedPivot = !!obj.userData.isBakedPivot;

    let newPos: { x: number; y: number; z: number };
    let newRot: { x: number; y: number; z: number };
    let newScl: { x: number; y: number; z: number };

    if (isBakedPivot && mode === 'translate') {
      let pivotPos = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
      if (snapEnabled) {
        pivotPos = snapVec3(pivotPos, gridSize, true);
        obj.position.set(pivotPos.x, pivotPos.y, pivotPos.z);
      }
      const vc = obj.userData.vertexCenter as { x: number; y: number; z: number };
      newPos = { x: pivotPos.x - vc.x, y: pivotPos.y - vc.y, z: pivotPos.z - vc.z };
      newRot = levelObj.rotation;
      newScl = levelObj.scale;
    } else {
      newPos = { x: obj.position.x, y: obj.position.y, z: obj.position.z };
      newRot = { x: THREE.MathUtils.radToDeg(obj.rotation.x), y: THREE.MathUtils.radToDeg(obj.rotation.y), z: THREE.MathUtils.radToDeg(obj.rotation.z) };
      newScl = { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z };

      if (snapEnabled && mode === 'translate') {
        newPos = snapVec3(newPos, gridSize, true);
        obj.position.set(newPos.x, newPos.y, newPos.z);
      }
    }

    const oldPos = levelObj.position;
    const oldRot = levelObj.rotation;
    const oldScl = levelObj.scale;

    state.updateObject(id, { position: newPos, rotation: newRot, scale: newScl });

    if (levelObj.groupId) {
      const siblings = state.objects.filter((o) => o.groupId === levelObj.groupId && o.id !== id);
      if (siblings.length === 0) return;

      if (mode === 'translate') {
        const dx = newPos.x - oldPos.x;
        const dy = newPos.y - oldPos.y;
        const dz = newPos.z - oldPos.z;
        if (Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001 || Math.abs(dz) > 0.0001) {
          for (const sib of siblings) {
            state.updateObject(sib.id, {
              position: { x: sib.position.x + dx, y: sib.position.y + dy, z: sib.position.z + dz },
            });
          }
        }
      } else if (mode === 'rotate') {
        const oldQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(
          THREE.MathUtils.degToRad(oldRot.x), THREE.MathUtils.degToRad(oldRot.y), THREE.MathUtils.degToRad(oldRot.z),
        ));
        const newQ = new THREE.Quaternion().setFromEuler(obj.rotation);
        const deltaQ = newQ.clone().multiply(oldQ.clone().invert());

        const pivot = new THREE.Vector3(oldPos.x, oldPos.y, oldPos.z);
        const tmpPos = new THREE.Vector3();
        const tmpQ = new THREE.Quaternion();
        const tmpE = new THREE.Euler();

        for (const sib of siblings) {
          tmpPos.set(sib.position.x, sib.position.y, sib.position.z).sub(pivot);
          tmpPos.applyQuaternion(deltaQ);
          tmpPos.add(pivot);

          tmpQ.setFromEuler(new THREE.Euler(
            THREE.MathUtils.degToRad(sib.rotation.x), THREE.MathUtils.degToRad(sib.rotation.y), THREE.MathUtils.degToRad(sib.rotation.z),
          ));
          tmpQ.premultiply(deltaQ);
          tmpE.setFromQuaternion(tmpQ);

          state.updateObject(sib.id, {
            position: { x: tmpPos.x, y: tmpPos.y, z: tmpPos.z },
            rotation: { x: THREE.MathUtils.radToDeg(tmpE.x), y: THREE.MathUtils.radToDeg(tmpE.y), z: THREE.MathUtils.radToDeg(tmpE.z) },
          });
        }
      } else if (mode === 'scale') {
        const sx = newScl.x / (oldScl.x || 1);
        const sy = newScl.y / (oldScl.y || 1);
        const sz = newScl.z / (oldScl.z || 1);
        if (Math.abs(sx - 1) > 0.0001 || Math.abs(sy - 1) > 0.0001 || Math.abs(sz - 1) > 0.0001) {
          const pivot = new THREE.Vector3(oldPos.x, oldPos.y, oldPos.z);
          for (const sib of siblings) {
            const dx = sib.position.x - pivot.x;
            const dy = sib.position.y - pivot.y;
            const dz = sib.position.z - pivot.z;
            state.updateObject(sib.id, {
              position: { x: pivot.x + dx * sx, y: pivot.y + dy * sy, z: pivot.z + dz * sz },
              scale: { x: sib.scale.x * sx, y: sib.scale.y * sy, z: sib.scale.z * sz },
            });
          }
        }
      }
    }
  });
  scene.add(transformControls.getHelper());

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
  dirLight.position.set(5, 10, 7);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  scene.add(dirLight);
  scene.add(new THREE.HemisphereLight(0xb0d0ff, 0x404040, 0.4));

  const extent = EDITOR.gridExtent;
  const gridHelper = new THREE.GridHelper(extent * 2, extent * 2, SCENE_COLORS.gridCenter, SCENE_COLORS.grid);
  gridHelper.userData.lastGrid = 1;
  scene.add(gridHelper);

  const axisLen = extent;
  const xAxisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-axisLen, 0.005, 0), new THREE.Vector3(axisLen, 0.005, 0),
  ]);
  scene.add(new THREE.Line(xAxisGeo, new THREE.LineBasicMaterial({ color: SCENE_COLORS.axisX })));
  const zAxisGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.005, -axisLen), new THREE.Vector3(0, 0.005, axisLen),
  ]);
  scene.add(new THREE.Line(zAxisGeo, new THREE.LineBasicMaterial({ color: SCENE_COLORS.axisZ })));

  const groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(EDITOR.groundPlaneSize, EDITOR.groundPlaneSize),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  groundPlane.rotation.x = -Math.PI / 2;
  groundPlane.userData.isGround = true;
  scene.add(groundPlane);

  const meshMap = new Map<string, THREE.Mesh>();
  const labelMap = new Map<string, CSS2DObject>();

  const measureGroup = new THREE.Group();
  measureGroup.name = '__measures__';
  scene.add(measureGroup);

  const drawGroup = new THREE.Group();
  drawGroup.name = '__drawing__';
  scene.add(drawGroup);

  const freeEdgeGroup = new THREE.Group();
  freeEdgeGroup.name = '__freeEdges__';
  scene.add(freeEdgeGroup);

  const ISO_ANGLE = Math.atan(1 / Math.sqrt(2));
  const ISO_DIST = 40;

  function setViewMode(mode: ViewMode) {
    if (mode === _viewMode) return;
    const target = orbitControls.target.clone();

    if (mode === 'top') {
      _viewMode = 'top';
      camera = orthoCam;
      orthoCam.position.set(target.x, EDITOR.orthoHeight, target.z);
      orthoCam.lookAt(target.x, 0, target.z);
      orthoCam.up.set(0, 0, -1);
      orbitControls.object = orthoCam;
      orbitControls.target.copy(target);
      orbitControls.enableRotate = false;
      orbitControls.minZoom = 0.2;
      orbitControls.maxZoom = 10;
      orbitControls.update();
      transformControls.camera = orthoCam;
    } else if (mode === 'iso') {
      _viewMode = 'iso';
      camera = orthoCam;
      const d = ISO_DIST;
      const h = d * Math.sin(ISO_ANGLE);
      const hz = d * Math.cos(ISO_ANGLE);
      const offX = hz * Math.sin(Math.PI / 4);
      const offZ = hz * Math.cos(Math.PI / 4);
      orthoCam.position.set(target.x + offX, target.y + h, target.z + offZ);
      orthoCam.up.set(0, 1, 0);
      orthoCam.lookAt(target);
      orbitControls.object = orthoCam;
      orbitControls.target.copy(target);
      orbitControls.enableRotate = false;
      orbitControls.minZoom = 0.2;
      orbitControls.maxZoom = 10;
      orbitControls.update();
      transformControls.camera = orthoCam;
    } else {
      _viewMode = 'perspective';
      camera = perspCam;
      perspCam.position.set(target.x + cp.x, cp.y, target.z + cp.z);
      perspCam.lookAt(target);
      orbitControls.object = perspCam;
      orbitControls.target.copy(target);
      orbitControls.enableRotate = true;
      orbitControls.update();
      transformControls.camera = perspCam;
    }
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    labelRenderer.setSize(w, h);
    perspCam.aspect = w / h;
    perspCam.updateProjectionMatrix();
    const aspect = w / h;
    orthoCam.left = -os * aspect;
    orthoCam.right = os * aspect;
    orthoCam.top = os;
    orthoCam.bottom = -os;
    orthoCam.updateProjectionMatrix();
  }

  function dispose() {
    resizeObserver.disconnect();
    transformControls.dispose();
    orbitControls.dispose();
    renderer.dispose();
    if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    if (container.contains(labelRenderer.domElement)) container.removeChild(labelRenderer.domElement);
  }

  return {
    renderer, labelRenderer, scene, perspCam, orthoCam, orbitControls, transformControls, gizmoPivot,
    groundPlane, gridHelper, measureGroup, drawGroup, freeEdgeGroup, meshMap, labelMap,
    getCamera: () => camera,
    getViewMode: () => _viewMode,
    setViewMode, resize, dispose,
  };
}
