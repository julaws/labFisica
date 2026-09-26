import * as THREE from 'three';
import CameraControls from 'camera-controls';

// camera-controls só precisa de um subconjunto do three.js.
CameraControls.install({
  THREE: {
    Vector2: THREE.Vector2,
    Vector3: THREE.Vector3,
    Vector4: THREE.Vector4,
    Quaternion: THREE.Quaternion,
    Matrix4: THREE.Matrix4,
    Spherical: THREE.Spherical,
    Box3: THREE.Box3,
    Sphere: THREE.Sphere,
    Raycaster: THREE.Raycaster,
  },
});

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  controls: CameraControls;
  update(dt: number): boolean;
  dispose(): void;
}

export interface CameraOptions {
  canvas: HTMLCanvasElement;
  fov?: number;
  near?: number;
  far?: number;
  position?: THREE.Vector3Like;
  target?: THREE.Vector3Like;
}

/**
 * Câmera principal + camera-controls (órbita, pan com botão direito, dolly na roda).
 * As câmeras cinematográficas da tecla C entram na F7 por cima deste mesmo rig.
 */
export function createCameraRig({
  canvas,
  fov = 35,
  near = 0.01,
  far = 200,
  position = { x: 1.6, y: 1.1, z: 2.4 },
  target = { x: 0, y: 0.35, z: 0 },
}: CameraOptions): CameraRig {
  const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  camera.position.set(position.x, position.y, position.z);

  const controls = new CameraControls(camera, canvas);
  void controls.setTarget(target.x, target.y, target.z, false);
  controls.dollyToCursor = true;
  controls.minDistance = 0.3;
  controls.maxDistance = 14;
  controls.maxPolarAngle = Math.PI * 0.495; // não deixa a câmera passar por baixo do piso
  controls.smoothTime = 0.16;
  controls.draggingSmoothTime = 0.08;

  return {
    camera,
    controls,
    update(dt: number): boolean {
      return controls.update(dt);
    },
    dispose(): void {
      controls.dispose();
    },
  };
}
