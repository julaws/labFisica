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

export interface ShotLike {
  readonly position: THREE.Vector3Like;
  readonly target: THREE.Vector3Like;
  readonly fov?: number;
}

export interface CinematicCycle {
  /** Vai para o próximo enquadramento da lista. */
  next(): void;
  /** Volta à vista padrão. */
  reset(): void;
  /** Troca a lista de enquadramentos (outro experimento, por exemplo). */
  setShots(shots: readonly ShotLike[]): void;
  /** Troca a vista padrão, para onde R volta. */
  setHome(shot: ShotLike): void;
}

/**
 * Câmeras cinematográficas da tecla C (SPEC §6.3): percorre os enquadramentos
 * do experimento com transição suave. Com `prefers-reduced-motion`, a
 * transição vira corte seco (SPEC §9).
 */
export function createCinematicCycle(
  rig: CameraRig,
  home: ShotLike,
  reducedMotion: () => boolean,
): CinematicCycle {
  let shots: readonly ShotLike[] = [];
  let index = -1;
  let homeShot = home;

  const go = (shot: ShotLike): void => {
    const smooth = !reducedMotion();
    if (shot.fov !== undefined && rig.camera.fov !== shot.fov) {
      rig.camera.fov = shot.fov;
      rig.camera.updateProjectionMatrix();
    }
    const { position: p, target: t } = shot;
    void rig.controls.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, smooth);
  };

  return {
    next(): void {
      if (shots.length === 0) return;
      index = (index + 1) % shots.length;
      go(shots[index]!);
    },
    reset(): void {
      index = -1;
      go(homeShot);
    },
    setShots(next: readonly ShotLike[]): void {
      shots = next;
      index = -1;
    },
    setHome(shot: ShotLike): void {
      homeShot = shot;
    },
  };
}

export interface KeyboardFlight {
  /** Aplica o movimento das teclas pressionadas. Chamado a cada quadro. */
  update(dt: number): void;
  dispose(): void;
}

/**
 * W A S D movem a câmera no plano, Q E giram em torno do alvo (SPEC §2).
 * As teclas são lidas por estado (pressionada ou não), então segurar anda de
 * forma contínua, e a velocidade não depende da taxa de quadros.
 */
export function createKeyboardFlight(rig: CameraRig, speed = 0.9, turnSpeed = 1.2): KeyboardFlight {
  const pressed = new Set<string>();

  const isTyping = (target: EventTarget | null): boolean =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;

  const onDown = (event: KeyboardEvent): void => {
    if (isTyping(event.target) || event.ctrlKey || event.metaKey || event.altKey) return;
    pressed.add(event.key.toLowerCase());
  };
  const onUp = (event: KeyboardEvent): void => {
    pressed.delete(event.key.toLowerCase());
  };
  const onBlur = (): void => pressed.clear();

  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  window.addEventListener('blur', onBlur);

  return {
    update(dt: number): void {
      if (pressed.size === 0) return;
      const step = speed * dt;
      const turn = turnSpeed * dt;

      if (pressed.has('w')) void rig.controls.forward(step, true);
      if (pressed.has('s')) void rig.controls.forward(-step, true);
      if (pressed.has('a')) void rig.controls.truck(-step, 0, true);
      if (pressed.has('d')) void rig.controls.truck(step, 0, true);
      if (pressed.has('q')) void rig.controls.rotate(turn, 0, true);
      if (pressed.has('e')) void rig.controls.rotate(-turn, 0, true);
    },
    dispose(): void {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
      pressed.clear();
    },
  };
}
