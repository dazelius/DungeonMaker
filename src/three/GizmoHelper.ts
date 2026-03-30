import type { TransformControls } from 'three/addons/controls/TransformControls.js';

const KEEP_NAMES = new Set(['X', 'Y', 'Z', '']);

export function stripGizmoExtras(controls: TransformControls): void {
  const helper = controls.getHelper();
  helper.traverse((child) => {
    if (child === helper) return;
    if (child.type === 'Group' || child.type === 'Object3D') return;
    if (!KEEP_NAMES.has(child.name)) {
      child.visible = false;
      child.scale.setScalar(0);
    }
  });
}
