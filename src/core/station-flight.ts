import * as THREE from 'three';
import type { CameraRig, ShotLike } from './camera';

/**
 * Voo da câmera de uma bancada para a outra (ADR 0008).
 *
 * O `setLookAt` suave do camera-controls é uma mola: parte a toda velocidade e
 * cobre os ~6 m entre as bancadas num tranco. Aqui a câmera segue uma curva
 * com aceleração e desaceleração suaves, num arco que recua e sobe no meio do
 * caminho — as duas mesas aparecem juntas antes da nova ocupar o quadro.
 *
 * Mexer na câmera durante o voo (arrastar, roda) interrompe o voo onde ele
 * está; quem pediu o voo é avisado do mesmo jeito.
 */

export interface StationFlight {
  /** Voa até `to`. `onProgress` recebe a fração suavizada, de 0 a 1. */
  fly(
    to: ShotLike,
    options?: { duration?: number | undefined; onProgress?: (eased: number) => void },
  ): Promise<void>;
  readonly active: boolean;
  /** Avança o voo; chamado a cada quadro. */
  update(): void;
  dispose(): void;
}

/** Duração padrão do voo, s. */
const DURATION = 2.6;
/** Quanto o arco recua (z) e sobe (y) no meio do voo, por metro percorrido. */
const ARC = { back: 0.24, up: 0.08 };

/** Começo e fim bem macios (seno), sem o tranco de uma curva cúbica. */
const ease = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * t);

export function createStationFlight(rig: CameraRig): StationFlight {
  const fromPosition = new THREE.Vector3();
  const fromTarget = new THREE.Vector3();
  const toPosition = new THREE.Vector3();
  const toTarget = new THREE.Vector3();
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  let fromFov = rig.camera.fov;
  let toFov = rig.camera.fov;
  let duration = DURATION;
  let startedAt = 0;
  let arcBack = 0;
  let arcUp = 0;
  let running = false;
  let progress: ((eased: number) => void) | undefined;
  let finish: (() => void) | null = null;

  const end = (): void => {
    running = false;
    const done = finish;
    finish = null;
    progress = undefined;
    done?.();
  };

  // Arrastar ou girar a roda no meio do voo devolve o controle na hora.
  const interrupt = (): void => {
    if (!running) return;
    progress?.(1);
    end();
  };
  rig.controls.addEventListener('controlstart', interrupt);

  return {
    get active(): boolean {
      return running;
    },

    fly(to, options = {}): Promise<void> {
      if (running) end();
      rig.controls.getPosition(fromPosition);
      rig.controls.getTarget(fromTarget);
      toPosition.set(to.position.x, to.position.y, to.position.z);
      toTarget.set(to.target.x, to.target.y, to.target.z);
      fromFov = rig.camera.fov;
      toFov = to.fov ?? rig.camera.fov;
      duration = options.duration ?? DURATION;
      progress = options.onProgress;
      const distance = fromTarget.distanceTo(toTarget);
      arcBack = distance * ARC.back;
      arcUp = distance * ARC.up;
      startedAt = performance.now();

      if (duration <= 0) {
        void rig.controls.setLookAt(
          toPosition.x,
          toPosition.y,
          toPosition.z,
          toTarget.x,
          toTarget.y,
          toTarget.z,
          false,
        );
        if (toFov !== rig.camera.fov) {
          rig.camera.fov = toFov;
          rig.camera.updateProjectionMatrix();
        }
        progress?.(1);
        progress = undefined;
        return Promise.resolve();
      }

      running = true;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },

    update(): void {
      if (!running) return;
      // Relógio de parede: o voo dura o mesmo numa máquina lenta, em vez de
      // esticar junto com os quadros.
      const t = Math.min((performance.now() - startedAt) / (duration * 1000), 1);
      const e = ease(t);
      const arc = Math.sin(Math.PI * e);

      position.lerpVectors(fromPosition, toPosition, e);
      position.z += arc * arcBack;
      position.y += arc * arcUp;
      target.lerpVectors(fromTarget, toTarget, e);
      target.y += arc * arcUp * 0.5;
      void rig.controls.setLookAt(position.x, position.y, position.z, target.x, target.y, target.z, false);

      const fov = fromFov + (toFov - fromFov) * e;
      if (Math.abs(rig.camera.fov - fov) > 1e-4) {
        rig.camera.fov = fov;
        rig.camera.updateProjectionMatrix();
      }

      progress?.(e);
      if (t >= 1) end();
    },

    dispose(): void {
      rig.controls.removeEventListener('controlstart', interrupt);
      end();
    },
  };
}
