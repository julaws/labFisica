import * as THREE from 'three';
import type { RayPath } from '../../scene/rays';
import { imageDistance, plateBlurDiameter, pupilDiameter } from '../../optics/thin-lens';
import { lensMm } from './lens-model';
import { IMAGE_PLANE_MAGNIFICATION } from '../../scene/scale';
import type { DioramaSubject } from './diorama';

/**
 * Leques de raios dos objetos do diorama (SPEC §6.5).
 *
 * Cada objeto emite um cone de 16 a 32 raios que amostram um anel do
 * **diâmetro da pupila de entrada** (D = f/N), atravessam a lente como um
 * cilindro — do primeiro vértice ao plano principal traseiro — e convergem num
 * ponto cuja posição vem de `convergence()`: sobre a placa de vidro para o
 * objeto em foco, à frente para os mais distantes, atrás para os mais
 * próximos. Dentro da lente o desenho é esquemático: as pupilas e os planos
 * principais de um Gauss duplo são cruzados, e mirá-los faria o feixe andar
 * para trás.
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
 *
 * ## A placa ampliada (ADR 0006)
 *
 * O plano da imagem é desenhado `M = IMAGE_PLANE_MAGNIFICATION` vezes maior
 * que a lente. Cada raio sai da pupila de saída no lugar de sempre e passa a
 * mirar o ponto da placa com altura `M` vezes a original. Como o ponto da
 * placa é uma combinação afim do ponto de saída e do ponto de convergência,
 * os raios redirecionados continuam concorrentes num ponto só, do mesmo lado
 * da placa, e o cone na placa mede exatamente `M · b`. Só a distância desse
 * ponto à placa muda (fica ~M vezes maior): o exagero declarado de `v_d − v_s`.
 */

export interface RayFanGeometry {
  /**
   * Onde o feixe entra na objetiva, em x de cena (já com o deslocamento do
   * foco). O experimento usa o primeiro vértice.
   */
  readonly entrancePupilX: number;
  /**
   * Onde o feixe sai da objetiva, em x de cena. Para o cone na placa medir
   * exatamente `b(d)`, este plano precisa ser o **plano principal traseiro**:
   * é dele que a lente fina mede `v`. (Até 02/10/2026 era a pupila de saída;
   * no Gauss duplo da patente ela fica 9 mm à frente do plano principal, e o
   * cone saía ~13% mais estreito que o anel. Ver ADR 0006.)
   */
  readonly exitPupilX: number;
  /** Plano principal traseiro, de onde sai o raio principal. */
  readonly rearPrincipalX: number;
  /**
   * Centro de projeção do lado do objeto: a posição da câmera virtual do
   * sensor. A altura da imagem é `h · v / u`, com `u` medido daqui, que é
   * exatamente como a câmera virtual projeta a cena na placa. Assim o ponto
   * onde o cone de um objeto se fecha cai em cima do próprio objeto na imagem
   * projetada.
   */
  readonly projectionCenterX: number;
  /** Posição fixa da placa de vidro, em x de cena. */
  readonly imagePlaneX: number;
}

export interface RayFanState {
  /** Distância focal, mm, com sinal: negativa numa lente divergente. */
  readonly focalLength: number;
  readonly fNumber: number;
  /**
   * Giro do anel de raios em volta do eixo, em radianos. Puramente visual:
   * qualquer giro amostra o mesmo cone, com a mesma largura na placa.
   */
  readonly spin?: number;
}

export interface SubjectImage {
  readonly id: string;
  /** Diâmetro do disco no sensor, em mm de física. */
  readonly blurMm: number;
  /** Altura da imagem no sensor, em mm (negativa = invertida). */
  readonly heightMm: number;
  /** Deslocamento lateral da imagem no sensor, em mm (também invertido). */
  readonly lateralMm: number;
  readonly color: number;
  /** Onde o cone se fecha; `virtual` numa lente divergente. */
  readonly side: 'front' | 'on' | 'behind' | 'virtual';
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
  const { focalLength: f, fNumber: N } = state;

  const pupilRadius = lensMm(pupilDiameter(f, N) / 2);
  // Distância do plano principal traseiro ao sensor, em mm de física: é ela
  // que decide onde cada cone está quando chega à placa (ADR 0007).
  const plateMmFromPrincipal = (geometry.imagePlaneX - geometry.rearPrincipalX) / lensMm(1);
  const converging = f > 0;

  const paths: RayPath[] = [];
  const images: SubjectImage[] = [];

  for (const subject of subjects) {
    const object = subject.samplePoint;
    const vd = imageDistance(f, subject.distanceMm);

    // Onde o cone se fecha: v_d atrás do plano principal traseiro, na escala
    // da lente. Numa lente divergente v_d é negativo e o ponto fica à frente
    // da lente: é a imagem virtual, de onde os raios parecem vir.
    const convergeX = geometry.rearPrincipalX + lensMm(vd);
    const offsetMm = vd - plateMmFromPrincipal;
    const side: SubjectImage['side'] = !converging
      ? 'virtual'
      : Math.abs(offsetMm) <= 1e-6
        ? 'on'
        : offsetMm > 0
          ? 'behind'
          : 'front';

    // Altura da imagem pela magnificação da lente fina, −v/u: v é a distância
    // do plano principal traseiro ao ponto de convergência, na escala da
    // lente; u é a distância do objeto ao centro de projeção, na cena.
    const u = geometry.projectionCenterX - object.x;
    const v = convergeX - geometry.rearPrincipalX;
    const magnification = u === 0 ? 0 : -v / u;
    const converge = new THREE.Vector3(
      convergeX,
      object.y * magnification,
      object.z * magnification,
    );

    // Placa ampliada: α diz onde a placa cai entre a saída (0) e o ponto de
    // convergência (1); o novo ponto comum fica no parâmetro t = 1/(1 − M(1 − α)).
    // A divergente não tem ponto comum atrás da lente; ali os raios só
    // atravessam a placa, sem a ampliação (ADR 0007).
    const plateScale = converging ? IMAGE_PLANE_MAGNIFICATION : 1;
    const span = convergeX - geometry.exitPupilX;
    const alpha = span === 0 ? 1 : (geometry.imagePlaneX - geometry.exitPupilX) / span;
    const denominator = 1 - plateScale * (1 - alpha);
    const meetT = Math.abs(denominator) < 1e-6 ? 1e6 : 1 / denominator;

    for (let i = 0; i < RAYS_PER_SUBJECT; i += 1) {
      const angle = (i / RAYS_PER_SUBJECT) * Math.PI * 2 + (state.spin ?? 0);
      const offsetY = Math.cos(angle) * pupilRadius;
      const offsetZ = Math.sin(angle) * pupilRadius;

      const entry = new THREE.Vector3(geometry.entrancePupilX, offsetY, offsetZ);
      const exit = new THREE.Vector3(geometry.exitPupilX, offsetY, offsetZ);

      // Onde o raio original cruza a placa.
      const atPlate = new THREE.Vector3().lerpVectors(exit, converge, alpha);

      if (!converging) {
        // Divergente: o raio sai abrindo, na direção oposta à imagem virtual,
        // atravessa a placa e segue. Um traço apagado liga a saída à imagem
        // virtual, à frente da lente: é de lá que o raio "parece" vir.
        const beyond = new THREE.Vector3()
          .subVectors(atPlate, exit)
          .multiplyScalar(1 + OVERSHOOT)
          .add(exit);
        paths.push({ points: [object, entry, exit, atPlate, beyond], color: subject.color, opacity: 0.55 });
        paths.push({ points: [converge, exit], color: subject.color, opacity: 0.22 });
        continue;
      }

      // Convergente: o mesmo ponto na placa ampliada e o novo ponto comum.
      const onPlate = new THREE.Vector3(
        geometry.imagePlaneX,
        atPlate.y * plateScale,
        atPlate.z * plateScale,
      );
      const meet = new THREE.Vector3().subVectors(onPlate, exit).multiplyScalar(meetT).add(exit);

      // Depois de convergir, o raio continua e volta a divergir.
      const beyond = new THREE.Vector3()
        .subVectors(meet, exit)
        .multiplyScalar(OVERSHOOT)
        .add(meet);

      paths.push({
        points: [object, entry, exit, meet, beyond],
        color: subject.color,
        opacity: side === 'on' ? 0.9 : 0.62,
      });
    }

    // Altura da imagem no sensor: vem da própria construção do raio principal,
    // convertida de volta para milímetros de física.
    const heightMm = converge.y / lensMm(1);
    const lateralMm = converge.z / lensMm(1);

    images.push({
      id: subject.id,
      blurMm: plateBlurDiameter(f, N, plateMmFromPrincipal, subject.distanceMm),
      heightMm,
      lateralMm,
      color: subject.color,
      side,
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
