import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SCENE_COLORS, EDITOR } from '../constants';
import { useEditor } from '../store';
import { snapVec3 } from '../utils/math';
import { registerViewportScene } from './sceneRegistry';

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  scene: THREE.Scene;
  perspCam: THREE.PerspectiveCamera;
  orthoCam: THREE.OrthographicCamera;
  orbitControls: OrbitControls;
  transformControls: TransformControls;
  groundPlane: THREE.Mesh;
  gridHelper: THREE.GridHelper;
  measureGroup: THREE.Group;
  drawGroup: THREE.Group;
  meshMap: Map<string, THREE.Mesh>;
  labelMap: Map<string, CSS2DObject>;

  getCamera(): THREE.PerspectiveCamera | THREE.OrthographicCamera;
  isTopView(): boolean;
  switchToTopView(): void;
  switchToPerspective(): void;
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

  let _isTopView = false;
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = perspCam;

  const orbitControls = new OrbitControls(camera, renderer.domElement);
  orbitControls.enableDamping = true;
  orbitControls.dampingFactor = 0.12;

  const transformControls = new TransformControls(camera, renderer.domElement);
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
    if (snapEnabled && transformControls.getMode() === 'translate') {
      const snapped = snapVec3(
        { x: obj.position.x, y: obj.position.y, z: obj.position.z },
        gridSize, true,
      );
      obj.position.set(snapped.x, snapped.y, snapped.z);
    }
    state.updateObject(obj.userData.levelObjectId, {
      position: { x: obj.position.x, y: obj.position.y, z: obj.position.z },
      rotation: { x: THREE.MathUtils.radToDeg(obj.rotation.x), y: THREE.MathUtils.radToDeg(obj.rotation.y), z: THREE.MathUtils.radToDeg(obj.rotation.z) },
      scale: { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z },
    });
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

  function switchToTopView() {
    if (_isTopView) return;
    _isTopView = true;
    camera = orthoCam;
    const target = orbitControls.target.clone();
    orthoCam.position.set(target.x, EDITOR.orthoHeight, target.z);
    orthoCam.lookAt(target.x, 0, target.z);
    orbitControls.object = orthoCam;
    orbitControls.target.copy(target);
    orbitControls.enableRotate = false;
    orbitControls.minZoom = 0.2;
    orbitControls.maxZoom = 10;
    orbitControls.update();
    transformControls.camera = orthoCam;
  }

  function switchToPerspective() {
    if (!_isTopView) return;
    _isTopView = false;
    camera = perspCam;
    const target = orbitControls.target.clone();
    perspCam.position.set(target.x + cp.x, cp.y, target.z + cp.z);
    perspCam.lookAt(target);
    orbitControls.object = perspCam;
    orbitControls.target.copy(target);
    orbitControls.enableRotate = true;
    orbitControls.update();
    transformControls.camera = perspCam;
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
    renderer, labelRenderer, scene, perspCam, orthoCam, orbitControls, transformControls,
    groundPlane, gridHelper, measureGroup, drawGroup, meshMap, labelMap,
    getCamera: () => camera,
    isTopView: () => _isTopView,
    switchToTopView, switchToPerspective, resize, dispose,
  };
}
