import * as THREE from 'three';
import type { RayPath } from '../../scene/rays';
import { convergence, imageDistance, pupilDiameter } from '../../optics/thin-lens';
import { lensMm } from './lens-model';
import type { DioramaSubject } from './diorama';

/**
 * Leques de raios dos objetos do diorama (SPEC §6.5).
 *
 * Cada objeto emite um cone de 16 a 32 raios que amostram o **anel da pupila
 * de entrada**, atravessam a lente e convergem num ponto cuja posição vem de
 * `convergence()`: sobre a placa de vidro para o objeto em foco, à frente para
 * os mais distantes, atrás para os mais próximos.
 *
 * ## Por que não há fator de exagero aqui
 *
 * A SPEC §6.2 autoriza amplificar a separação `v_d − v_s` para ela ficar
 * visível. Não foi preciso, e é melhor assim: sem exagero vale a identidade
 *
 *     b(d) = D · |v_d − v_s| / v_d
 *
 * ou seja, **o diâmetro do cone onde ele cruza a placa é exatamente o círculo
 * de confusão** que o motor calcula. Com um fator de exagero o cone desenhado
 * deixaria de bater com o anel de CoC ao lado dele, e o critério 4 da SPEC §10
 * pede justamente que os dois concordem. A separação real já rende 6% de `v`,
 * o que na escala ampliada da lente dá para ver.
 *
 * O que continua sendo esquemático, e está declarado no modal: o lado do
 * objeto vive no espaço comprimido do diorama, e o lado da imagem na escala
 * ampliada da lente. O ângulo do raio principal é o da cena, não o da física.
 */

export interface RayFanGeometry {
  /** Plano da pupila de entrada, em x de cena (já com o deslocamento do foco). */
  readonly entrancePupilX: number;
  /** Plano da pupila de saída, em x de cena. */
  readonly exitPupilX: number;
  /** Plano principal traseiro, de onde sai o raio principal. */
  readonly rearPrincipalX: number;
  /** Posição fixa da placa de vidro, em x de cena. */
  readonly imagePlaneX: number;
}

export interface RayFanState {
  readonly focalLength: number;
  readonly fNumber: number;
  readonly focusDistance: number;
}

export interface SubjectImage {
  readonly id: string;
  /** Diâmetro do disco no sensor, em mm de física. */
  readonly blurMm: number;
  /** Altura da imagem no sensor, em mm (negativa = invertida). */
  readonly heightMm: number;
  readonly color: number;
  readonly side: 'front' | 'on' | 'behind';
}

export interface RayFanResult {
  readonly paths: RayPath[];
  readonly images: SubjectImage[];
}

/** Quantos raios amostram o anel da pupila. */
const RAYS_PER_SUBJECT = 18;

/** Quanto o raio segue além do ponto de convergência, em fração do trecho. */
const OVERSHOOT = 0.55;

export function buildRayFans(
  subjects: readonly DioramaSubject[],
  state: RayFanState,
  geometry: RayFanGeometry,
): RayFanResult {
  const { focalLength: f, fNumber: N, focusDistance: s } = state;

  const pupilRadius = lensMm(pupilDiameter(f, N) / 2);
  const imageDistanceMm = imageDistance(f, s);

  const paths: RayPath[] = [];
  const images: SubjectImage[] = [];

  for (const subject of subjects) {
    const object = subject.samplePoint;
    const meeting = convergence(f, s, subject.distanceMm);

    // Onde o cone se fecha: a placa mais a diferença de conjugado, na escala
    // ampliada da lente. Sem fator de exagero (ver o bloco acima).
    const convergeX = geometry.imagePlaneX + lensMm(meeting.offset);

    // Raio principal: passa pelo plano principal traseiro sem desviar e sai
    // do outro lado invertido. É a construção clássica da lente fina.
    const principal = new THREE.Vector3(geometry.rearPrincipalX, 0, 0);
    const toPrincipal = new THREE.Vector3().subVectors(principal, object);
    const chiefScale =
      toPrincipal.x === 0 ? 0 : (convergeX - principal.x) / toPrincipal.x;
    const converge = new THREE.Vector3(
      convergeX,
      principal.y + toPrincipal.y * chiefScale,
      principal.z + toPrincipal.z * chiefScale,
    );

    for (let i = 0; i < RAYS_PER_SUBJECT; i += 1) {
      const angle = (i / RAYS_PER_SUBJECT) * Math.PI * 2;
      const offsetY = Math.cos(angle) * pupilRadius;
      const offsetZ = Math.sin(angle) * pupilRadius;

      const entry = new THREE.Vector3(geometry.entrancePupilX, offsetY, offsetZ);
      const exit = new THREE.Vector3(geometry.exitPupilX, offsetY, offsetZ);

      // Depois de convergir, o raio continua e volta a divergir.
      const beyond = new THREE.Vector3()
        .subVectors(converge, exit)
        .multiplyScalar(OVERSHOOT)
        .add(converge);

      paths.push({
        points: [object, entry, exit, converge, beyond],
        color: subject.color,
        opacity: meeting.side === 'on' ? 0.9 : 0.62,
      });
    }

    // Altura da imagem no sensor: vem da própria construção do raio principal,
    // convertida de volta para milímetros de física.
    const heightMm = converge.y / lensMm(1);

    images.push({
      id: subject.id,
      blurMm: blurAtPlate(f, N, imageDistanceMm, meeting.v),
      heightMm,
      color: subject.color,
      side: meeting.side,
    });
  }

  return { paths, images };
}

/**
 * Diâmetro do cone onde ele cruza a placa, em mm de física:
 *
 *     b = D · |v_d − v_s| / v_d
 *
 * É a mesma grandeza que `blurDiameter()` devolve — aqui ela é escrita na
 * forma geométrica porque é exatamente assim que o desenho a produz.
 */
export function blurAtPlate(
  f: number,
  N: number,
  imageDistanceMm: number,
  objectImageDistanceMm: number,
): number {
  if (!Number.isFinite(objectImageDistanceMm) || objectImageDistanceMm === 0) {
    return pupilDiameter(f, N);
  }
  return (
    (pupilDiameter(f, N) * Math.abs(objectImageDistanceMm - imageDistanceMm)) /
    objectImageDistanceMm
  );
}
