import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { MaterialLibrary } from '../../scene/materials';
import { nameplateTexture } from '../../scene/textures/procedural';

/**
 * O foguete, a plataforma e o jato (ADR 0020).
 *
 * - O foguete é montado com 1, 2 ou 3 estágios, cada um da altura
 *   proporcional ao propelente dele. Na separação, o estágio gasto se solta e
 *   cai girando em torno do próprio centro, ficando para trás; só depois que
 *   ele se afasta o resto da pilha desce, suave, para o lugar de sempre.
 * - Fica no mesmo lugar da bancada durante o voo (a câmera "acompanha"); quem
 *   se mexe é o mundo: a plataforma some, o céu do painel atrás escurece e a
 *   Terra vira uma curva lá embaixo.
 * - O jato são partículas que saem do bocal com velocidade proporcional a v_e
 *   (em relação ao foguete): o comprimento do jato mostra a velocidade de
 *   exaustão.
 */

export interface Vehicle3D {
  readonly group: THREE.Group;
  /** O foguete (sobe da plataforma e paira). */
  readonly rocket: THREE.Group;
  readonly glowing: THREE.Object3D[];
  /** Remonta com `stages` estágios, de alturas proporcionais às frações. */
  build(fractions: readonly number[]): void;
  /** Quantos estágios já foram soltos. */
  setDropped(count: number): void;
  /** Altitude (m), empuxo ligado e v_e (m/s) para o jato. */
  setFlight(altitude: number, thrusting: boolean, exhaust: number): void;
  update(dt: number): void;
  dispose(): void;
}

const RADIUS = 0.05;
const TOTAL_HEIGHT = 0.62;
const PAD_TOP = 0.09;
const PARTICLES = 700;

export function createVehicle(materials: MaterialLibrary): Vehicle3D {
  const group = new THREE.Group();
  group.name = 'rocket-vehicle';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];

  const white = new THREE.MeshPhysicalMaterial({ color: 0xeef1f5, roughness: 0.35, metalness: 0.1, clearcoat: 0.6 });
  const black = new THREE.MeshPhysicalMaterial({ color: 0x15171c, roughness: 0.45, metalness: 0.2, clearcoat: 0.4 });
  owned.push(white, black);

  // --- Plataforma e torre ------------------------------------------------------------
  const pad = new THREE.Group();
  group.add(pad);
  // Plataforma: base de cantos arredondados, o pedestal de lançamento com
  // o anel e quatro garras de fixação em volta do bocal.
  const padParts = [
    new RoundedBoxGeometry(0.42, 0.05, 0.36, 3, 0.01).translate(0, 0.025, 0),
    new RoundedBoxGeometry(0.2, 0.04, 0.2, 2, 0.008).translate(0, 0.07, 0),
    new THREE.TorusGeometry(0.068, 0.006, 8, 48).rotateX(Math.PI / 2).translate(0, PAD_TOP + 0.001, 0),
    ...[0, 1, 2, 3].map((k) =>
      new RoundedBoxGeometry(0.014, 0.03, 0.03, 2, 0.004)
        .translate(0, PAD_TOP + 0.012, 0.072)
        .rotateY((k * Math.PI) / 2 + Math.PI / 4),
    ),
  ].map((geometry) => geometry.toNonIndexed());
  const padGeometry = mergeGeometries(padParts);
  for (const part of padParts) part.dispose();
  if (!padGeometry) throw new Error('Falha ao montar a plataforma');
  geometries.push(padGeometry);
  const padMesh = new THREE.Mesh(padGeometry, materials.darkSteel);
  padMesh.castShadow = true;
  padMesh.receiveShadow = true;
  pad.add(padMesh);
  const towerParts: THREE.BufferGeometry[] = [];
  const towerX = -0.13;
  for (const [dx, dz] of [
    [-0.025, -0.025],
    [0.025, -0.025],
    [-0.025, 0.025],
    [0.025, 0.025],
  ] as const) {
    towerParts.push(new THREE.BoxGeometry(0.008, 0.7, 0.008).translate(towerX + dx, 0.05 + 0.35, dz));
  }
  for (let i = 0; i < 9; i += 1) {
    const y = 0.09 + i * 0.075;
    towerParts.push(new THREE.BoxGeometry(0.058, 0.006, 0.006).translate(towerX, y, -0.025));
    towerParts.push(new THREE.BoxGeometry(0.058, 0.006, 0.006).translate(towerX, y, 0.025));
    towerParts.push(new THREE.BoxGeometry(0.006, 0.006, 0.058).translate(towerX - 0.025, y, 0));
  }
  // Braços de acesso até o foguete.
  towerParts.push(new THREE.BoxGeometry(0.08, 0.008, 0.02).translate(towerX + 0.06, 0.55, 0));
  towerParts.push(new THREE.BoxGeometry(0.08, 0.008, 0.02).translate(towerX + 0.06, 0.32, 0));
  const tower = mergeGeometries(towerParts);
  for (const part of towerParts) part.dispose();
  if (!tower) throw new Error('Falha ao montar a torre');
  geometries.push(tower);
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0xa8432a, roughness: 0.55, metalness: 0.5 });
  owned.push(towerMaterial);
  const towerMesh = new THREE.Mesh(tower, towerMaterial);
  towerMesh.castShadow = true;
  pad.add(towerMesh);
  const plateGeometry = new THREE.PlaneGeometry(0.2, 0.2 * (352 / 1024));
  geometries.push(plateGeometry);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: nameplateTexture('@juliophisico', 'FOGUETE · TSIOLKOVSKY'),
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const plate = new THREE.Mesh(plateGeometry, plateMaterial);
  plate.position.set(0, 0.025, 0.181);
  pad.add(plate);

  // --- Foguete ---------------------------------------------------------------------------
  const rocket = new THREE.Group();
  rocket.name = 'rocket';
  rocket.position.y = PAD_TOP;
  group.add(rocket);
  let stageGroups: THREE.Group[] = [];
  const stageGeometries: THREE.BufferGeometry[] = [];

  const bellGeometry = new THREE.CylinderGeometry(0.018, 0.038, 0.05, 24, 1, true);
  geometries.push(bellGeometry);
  const bellMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.9, roughness: 0.35, side: THREE.DoubleSide });
  owned.push(bellMaterial);

  interface Debris {
    /** Pivô no centro do estágio solto (o estágio vai pendurado nele). */
    readonly object: THREE.Group;
    velocity: number;
    spin: number;
    drift: number;
    life: number;
  }
  const debris: Debris[] = [];
  /** Altura de cada estágio e a posição dele na pilha montada. */
  let heights: number[] = [];
  let baseY: number[] = [];
  /** Quanto a pilha já desceu (a base do estágio aceso vai para y = 0). */
  let stackShift = 0;
  /** Separação em andamento: a pilha começa `settleFrom` acima do lugar e desce. */
  let settleFrom = 0;
  let settleClock = Number.POSITIVE_INFINITY;
  /** O estágio solto se afasta antes de a pilha começar a descer. */
  const SETTLE_DELAY = 0.55;
  const SETTLE_TIME = 1.1;
  const DEBRIS_LIFE = 1.8;

  function clearStages(): void {
    for (const stage of stageGroups) stage.removeFromParent();
    for (const item of debris) item.object.removeFromParent();
    debris.length = 0;
    stackShift = 0;
    settleFrom = 0;
    settleClock = Number.POSITIVE_INFINITY;
    for (const geometry of stageGeometries) geometry.dispose();
    stageGeometries.length = 0;
    stageGroups = [];
  }

  // --- Jato -----------------------------------------------------------------------------------
  const positions = new Float32Array(PARTICLES * 3);
  const colors = new Float32Array(PARTICLES * 3);
  const velocities = new Float32Array(PARTICLES * 3);
  const ages = new Float32Array(PARTICLES).fill(1e9);
  const exhaustGeometry = new THREE.BufferGeometry();
  exhaustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  exhaustGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometries.push(exhaustGeometry);
  const exhaustMaterial = new THREE.PointsMaterial({
    size: 0.026,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  owned.push(exhaustMaterial);
  const exhaust = new THREE.Points(exhaustGeometry, exhaustMaterial);
  exhaust.frustumCulled = false;
  group.add(exhaust);
  glowing.push(exhaust);

  // Chama: um cone aceso sob o bocal, que tremula e cresce com v_e.
  const flameGeometry = new THREE.ConeGeometry(0.03, 1, 24, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
  geometries.push(flameGeometry);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(1.6, 0.9, 0.45),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  owned.push(flameMaterial);
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.visible = false;
  group.add(flame);
  glowing.push(flame);
  const coreMaterial = flameMaterial.clone();
  coreMaterial.color.setRGB(2.2, 2.0, 1.8);
  owned.push(coreMaterial);
  const core = new THREE.Mesh(flameGeometry, coreMaterial);
  core.scale.set(0.45, 1, 0.45);
  flame.add(core);
  let flameClock = 0;

  let thrusting = false;
  let exhaustSpeed = 1;
  let spawn = 0;
  let next = 0;
  let dropped = 0;
  let nozzleY = PAD_TOP;

  /** Põe os estágios ainda presos no lugar, `offset` acima da posição final. */
  const placeStack = (offset: number): void => {
    for (let i = dropped; i < stageGroups.length; i += 1) stageGroups[i]!.position.y = baseY[i]! - stackShift + offset;
  };
  const stackOffset = (): number => {
    if (!Number.isFinite(settleClock)) return 0;
    const k = Math.min(Math.max((settleClock - SETTLE_DELAY) / SETTLE_TIME, 0), 1);
    return settleFrom * (1 - k * k * (3 - 2 * k));
  };
  const random = (() => {
    let state = 99;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0xffffffff;
    };
  })();

  return {
    group,
    rocket,
    glowing,

    build(fractions: readonly number[]): void {
      clearStages();
      dropped = 0;
      // O primeiro estágio é o de baixo; alturas proporcionais à fração, com mínimo.
      heights = fractions.map((f) => Math.max(0.08, f * (TOTAL_HEIGHT - 0.12)));
      baseY = [];
      let y = 0;
      fractions.forEach((_, index) => {
        const height = heights[index]!;
        const stage = new THREE.Group();
        stage.position.y = y;
        baseY.push(y);
        const body = new THREE.CylinderGeometry(RADIUS, RADIUS, height, 32).translate(0, 0.05 + height / 2, 0);
        // Faixa preta no topo de cada estágio (o anel entre estágios).
        const band = new THREE.CylinderGeometry(RADIUS * 1.01, RADIUS * 1.01, 0.018, 32).translate(0, 0.05 + height - 0.009, 0);
        stageGeometries.push(body, band);
        const bodyMesh = new THREE.Mesh(body, white);
        bodyMesh.castShadow = true;
        stage.add(bodyMesh);
        stage.add(new THREE.Mesh(band, black));
        const bell = new THREE.Mesh(bellGeometry, bellMaterial);
        bell.position.y = 0.025;
        stage.add(bell);
        if (index === 0) {
          // Empenas enflechadas: bordo de ataque inclinado, ponta recortada.
          const finShape = new THREE.Shape();
          finShape.moveTo(RADIUS - 0.002, 0.03);
          finShape.lineTo(RADIUS + 0.058, -0.002);
          finShape.lineTo(RADIUS + 0.058, 0.045);
          finShape.lineTo(RADIUS - 0.002, 0.16);
          finShape.closePath();
          const fins = mergeGeometries(
            [0, 1, 2, 3].map((k) =>
              new THREE.ExtrudeGeometry(finShape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0012, bevelSize: 0.0012, bevelSegments: 1 })
                .rotateY(-Math.PI / 2)
                .translate(0.002, 0, 0)
                .rotateY((k * Math.PI) / 2 + Math.PI / 4),
            ),
          );
          if (fins) {
            stageGeometries.push(fins);
            stage.add(new THREE.Mesh(fins, black));
          }
        }
        rocket.add(stage);
        stageGroups.push(stage);
        y += height + 0.006;
      });
      // Coifa com a carga, presa ao último estágio.
      // Coifa em ogiva com ponta arredondada (perfil de torno).
      const ogive: THREE.Vector2[] = [];
      const noseLength = 0.13;
      for (let i = 0; i <= 16; i += 1) {
        const t = i / 16;
        const r = RADIUS * 0.98 * Math.pow(Math.max(1 - t ** 1.7, 0), 0.62);
        ogive.push(new THREE.Vector2(Math.max(r, i === 16 ? 0 : 0.002), 0.1 + noseLength * t));
      }
      const nose = mergeGeometries([
        new THREE.CylinderGeometry(RADIUS * 0.98, RADIUS, 0.05, 32).translate(0, 0.075, 0).toNonIndexed(),
        new THREE.LatheGeometry(ogive, 32).toNonIndexed(),
      ]);
      if (nose) {
        stageGeometries.push(nose);
        const noseMesh = new THREE.Mesh(nose, white);
        noseMesh.castShadow = true;
        // A coifa vai no último estágio até o fim (é a carga).
        noseMesh.position.y = heights.at(-1)!;
        stageGroups.at(-1)?.add(noseMesh);
      }
      // Padrão de rolagem no último estágio, como nos foguetes de teste: dois
      // anéis de quartos pretos alternados, para ver o foguete girar.
      const topHeight = heights.at(-1)!;
      const band = Math.min(0.05, topHeight * 0.22);
      const quarters = mergeGeometries(
        [0, 1, 2, 3].map((k) =>
          new THREE.CylinderGeometry(RADIUS * 1.004, RADIUS * 1.004, band, 12, 1, true, (k * Math.PI) / 2, Math.PI / 2)
            .translate(0, 0.05 + topHeight - 0.03 - band * (k % 2 === 0 ? 0.5 : 1.5), 0)
            .toNonIndexed(),
        ),
      );
      if (quarters) {
        stageGeometries.push(quarters);
        stageGroups.at(-1)?.add(new THREE.Mesh(quarters, black));
      }
    },

    setDropped(count: number): void {
      while (dropped < count && dropped < stageGroups.length - 1) {
        const stage = stageGroups[dropped]!;
        // Solta o estágio exatamente onde ele está: um pivô no centro dele, no
        // grupo de fora, com o estágio pendurado (gira em torno do centro).
        const half = 0.05 + heights[dropped]! / 2;
        const center = stage.localToWorld(new THREE.Vector3(0, half, 0));
        group.worldToLocal(center);
        const pivot = new THREE.Group();
        pivot.position.copy(center);
        group.add(pivot);
        stage.removeFromParent();
        stage.position.set(0, -half, 0);
        pivot.add(stage);
        // Já sai caindo em relação ao foguete, que continua acelerando.
        debris.push({ object: pivot, velocity: 0.12, spin: (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5), drift: (random() - 0.5) * 0.08, life: 0 });
        // O resto da pilha fica onde está (o novo estágio de baixo vai para
        // y = 0 só no fim) e desce depois que o estágio solto se afasta.
        dropped += 1;
        settleFrom = stageGroups[dropped]!.position.y;
        stackShift = baseY[dropped]!;
        settleClock = 0;
        placeStack(settleFrom);
      }
    },

    setFlight(altitude: number, nextThrusting: boolean, exhaust: number): void {
      // Sobe da plataforma nos primeiros 300 m e paira; a plataforma some.
      const lift = Math.min(altitude / 300, 1) * 0.28;
      rocket.position.y = PAD_TOP + lift;
      pad.visible = altitude < 3000;
      pad.position.y = -Math.min(altitude / 3000, 1) * 0.6;
      thrusting = nextThrusting;
      exhaustSpeed = exhaust / 3000;
    },

    update(dt: number): void {
      // Separações: o estágio gasto cai girando e some.
      for (let i = debris.length - 1; i >= 0; i -= 1) {
        const item = debris[i]!;
        item.life += dt;
        item.velocity += 0.3 * dt;
        item.object.position.y -= item.velocity * dt;
        item.object.position.x += item.drift * dt;
        item.object.rotation.z += item.spin * dt;
        // Fica para trás: encolhe como quem se afasta da câmera que acompanha o foguete.
        item.object.scale.setScalar(1 / (1 + 0.9 * item.life));
        if (item.life > DEBRIS_LIFE || item.object.position.y < 0.14) {
          item.object.removeFromParent();
          debris.splice(i, 1);
        }
      }
      // A pilha que sobrou desce, suave, para o lugar dela.
      if (Number.isFinite(settleClock)) {
        settleClock += dt;
        placeStack(stackOffset());
        if (settleClock >= SETTLE_DELAY + SETTLE_TIME) settleClock = Number.POSITIVE_INFINITY;
      }
      nozzleY = rocket.position.y + (stageGroups[dropped]?.position.y ?? 0);
      // Chama no bocal.
      flameClock += dt;
      flame.visible = thrusting;
      if (thrusting) {
        const length = 0.12 + 0.08 * exhaustSpeed;
        const flicker = 1 + 0.08 * Math.sin(flameClock * 47) + 0.05 * Math.sin(flameClock * 83);
        flame.position.set(0, nozzleY, 0);
        flame.scale.set(1, length * flicker, 1);
        core.scale.set(0.45, 0.55, 0.45);
      }
      // Jato.
      if (thrusting) {
        spawn += dt * 900;
        while (spawn >= 1) {
          spawn -= 1;
          const i = next;
          next = (next + 1) % PARTICLES;
          const angle = random() * Math.PI * 2;
          const r = random() * 0.012;
          positions[i * 3] = Math.cos(angle) * r;
          positions[i * 3 + 1] = nozzleY;
          positions[i * 3 + 2] = Math.sin(angle) * r;
          const speed = 0.9 * exhaustSpeed * (0.85 + random() * 0.3);
          velocities[i * 3] = Math.cos(angle) * 0.08 * random();
          velocities[i * 3 + 1] = -speed;
          velocities[i * 3 + 2] = Math.sin(angle) * 0.08 * random();
          ages[i] = 0;
        }
      }
      for (let i = 0; i < PARTICLES; i += 1) {
        const age = (ages[i]! += dt);
        if (age > 0.6) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        positions[i * 3] = positions[i * 3]! + velocities[i * 3]! * dt;
        positions[i * 3 + 1] = positions[i * 3 + 1]! + velocities[i * 3 + 1]! * dt;
        positions[i * 3 + 2] = positions[i * 3 + 2]! + velocities[i * 3 + 2]! * dt;
        // Branco-azulado na saída, laranja e depois vermelho apagando.
        const t = age / 0.6;
        colors[i * 3] = 1.6 * (1 - t * 0.5);
        colors[i * 3 + 1] = 1.4 * (1 - t) ** 1.5;
        colors[i * 3 + 2] = 1.2 * (1 - t) ** 3;
      }
      exhaustGeometry.attributes.position!.needsUpdate = true;
      exhaustGeometry.attributes.color!.needsUpdate = true;
    },

    dispose(): void {
      clearStages();
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
