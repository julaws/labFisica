import * as THREE from 'three';
import type {
  CinematicShot,
  Experiment,
  ExperimentCopy,
  LabContext,
  PanelSchema,
} from '../../core/experiment';
import { LENS_50MM_F2, withFNumber } from '../../optics/prescriptions/symmetric-double-doublet';
import { analyze } from '../../optics/paraxial';
import { focusExtension } from '../../optics/thin-lens';
import { opticalLength } from '../../optics/prescription';
import { DEFAULT_SUBJECT_DISTANCES_MM, F_STOP_PRESETS } from '../../optics/constants';
import { focusRingScale } from '../../scene/textures/procedural';
import { LENS_EXAGGERATION, distanceToDioramaOffset } from '../../scene/scale';
import {
  RING_SWEEP,
  distanceToRingAngle,
  ringAngleToDistance,
  ringMarks,
} from './focus-ring';
import { DEFAULT_IRIS, bladeSweepRadius } from './iris';
import {
  type LensElementMesh,
  createBarrel,
  createIris,
  createLensElement,
  elementIndices,
  lensMm,
} from './lens-model';
import { type LensFocusStore, createLensFocusStore, stepFNumber } from './state';
import { type Diorama, createDiorama } from './diorama';
import { type RayBundle, createRayBundle } from '../../scene/rays';
import { type FocusPlane, type IntersectionPatch, attachIntersectionPatch, createFocusPlane } from './focus-plane';
import { type ImagePlane, createImagePlane } from './image-plane';
import { buildRayFans } from './ray-fans';
import { dofLimits } from '../../optics/thin-lens';
import {
  SENSOR_LAYER,
  type SensorRender,
  createSensorRender,
  markVisibleToSensor,
} from './sensor-render';
import { SCENE_UNITS_PER_MM } from '../../scene/scale';
import { type ConsoleScreens, createConsoleScreens } from './console-screens';

/**
 * Experimento 1: Lente e plano de foco (SPEC §6).
 *
 * Nesta fase (F3) existe a objetiva: elementos gerados da prescrição, anéis,
 * diafragma sincronizado com f/N e o modo montado ↔ explodido. O diorama, o
 * plano de foco, os raios e a imagem no sensor chegam nas fases seguintes.
 */

/** Posição da lente no trilho, em marcas da régua. */
const LENS_RAIL_MM = 620;

/** Duração da transição montada ↔ explodida, em segundos (SPEC §6.3). */
const EXPLODE_SECONDS = 0.8;

/**
 * Afastamento entre elementos vizinhos no modo explodido, em mm de física.
 * Precisa ser maior que o diâmetro do barril, senão os elementos não saem de
 * dentro dele e a animação não explica nada.
 */
const EXPLODE_SPREAD_MM = 72;

/**
 * Quanto a bandeja do diorama fica **abaixo** do eixo óptico, em unidades de
 * cena. Pequeno de propósito: o vale precisa estar na altura da objetiva para
 * que a imagem dos objetos caia dentro do sensor.
 */
const DIORAMA_DROP = 0.055;

export function createLensFocusExperiment(): Experiment {
  const store: LensFocusStore = createLensFocusStore();

  let context: LabContext | null = null;
  const disposers: (() => void)[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const root = new THREE.Group();
  root.name = 'lens-focus';

  let elements: LensElementMesh[] = [];
  let diorama: Diorama | null = null;
  let focusPlane: FocusPlane | null = null;
  let imagePlane: ImagePlane | null = null;
  let rays: RayBundle | null = null;
  let intersection: IntersectionPatch | null = null;
  let sensor: SensorRender | null = null;
  let consoleScreens: ConsoleScreens | null = null;
  let iris: ReturnType<typeof createIris> | null = null;
  let barrel: ReturnType<typeof createBarrel> | null = null;
  let opticsGroup: THREE.Group | null = null;

  /** 0 = montada, 1 = explodida. Animado com easing próprio. */
  let explodeProgress = 0;
  let explodeTarget = 0;

  const analysis = analyze(LENS_50MM_F2);
  const lengthMm = opticalLength(LENS_50MM_F2.surfaces);

  /** Posição do stop na prescrição, em mm de física. */
  const stopZMm = LENS_50MM_F2.surfaces
    .slice(0, 3)
    .reduce((sum, surface) => sum + surface.thickness, 0);

  /** Altura do eixo óptico acima do topo do carrinho, em unidades de cena. */
  let axisHeight = 0;

  /**
   * Posição fixa da placa de vidro, em unidades de cena.
   *
   * No foco infinito o grupo óptico está em casa e o plano principal traseiro
   * fica em `lengthMm + rearPrincipal`; a placa então precisa estar a `f` dali.
   * Como a placa não se mexe, focar mais perto empurra a óptica para a frente
   * e a distância H'→placa vira exatamente `v` — que é como uma câmera real
   * funciona, com o sensor parado e a objetiva estendendo.
   */
  const imagePlaneX = lensMm(
    opticalLength(LENS_50MM_F2.surfaces) + analyze(LENS_50MM_F2).rearPrincipal + 50,
  );

  /** Diâmetro externo do barril, em mm de física. */
  function barrelDiameterMm(): number {
    return 2 * Math.max(LENS_50MM_F2.surfaces[0]!.semiDiameter + 3.2, bladeSweepRadius(DEFAULT_IRIS) + 2);
  }

  /** Ajuste fino do foco: 2% do curso do anel por toque (teclas [ e ]). */
  function nudgeFocus(direction: 1 | -1): void {
    const current = store.get().focusDistance;
    const fraction = -distanceToRingAngle(current) / RING_SWEEP;
    store.set({ focusDistance: ringAngleToDistance(-(fraction + direction * 0.02) * RING_SWEEP) });
  }

  /** Semidiâmetro do stop que o motor calcula para o f/N atual. */
  function stopSemiDiameter(fNumber: number): number {
    const adjusted = withFNumber(LENS_50MM_F2, fNumber);
    return adjusted.surfaces.find((surface) => surface.isStop)!.semiDiameter;
  }

  /** Aplica o estado à cena: íris, deslocamento de foco e rotação do anel. */
  function applyState(): void {
    const state = store.get();

    iris?.setClearRadius(stopSemiDiameter(state.fNumber));

    // Foco por deslocamento unitário: o grupo óptico inteiro anda para a
    // frente pela extensão e = v − f, que vem do motor (SPEC §5.3).
    const extension = focusExtension(state.focalLength, state.focusDistance);
    if (opticsGroup) opticsGroup.position.x = -lensMm(extension);

    if (barrel) barrel.focusRing.rotation.x = distanceToRingAngle(state.focusDistance);

    explodeTarget = state.lensMode === 'exploded' ? 1 : 0;

    // --- Zona nítida: tudo vem do motor -------------------------------------
    const dof = dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance);
    focusPlane?.setZone(state.focusDistance, dof.near, dof.far);
    intersection?.setZone(state.focusDistance, dof.near, dof.far);

    // --- Leques de raios e anéis de círculo de confusão ---------------------
    if (diorama && rays && imagePlane && opticsGroup) {
      const opticsOffset = opticsGroup.position.x;
      const analysis = analyze(LENS_50MM_F2);

      // Os pontos do diorama estão no espaço do próprio diorama; os raios
      // vivem no espaço do experimento, então sobem pelo deslocamento da
      // bandeja antes de entrar na conta.
      const subjects = diorama.subjects.map((subject) => ({
        ...subject,
        samplePoint: subject.samplePoint.clone().setY(subject.samplePoint.y - DIORAMA_DROP),
      }));

      const { paths, images } = buildRayFans(
        subjects,
        {
          focalLength: state.focalLength,
          fNumber: state.fNumber,
          focusDistance: state.focusDistance,
        },
        {
          entrancePupilX: opticsOffset + lensMm(analysis.entrancePupil.z),
          exitPupilX: opticsOffset + lensMm(analysis.exitPupil.z),
          rearPrincipalX:
            opticsOffset + lensMm(opticalLength(LENS_50MM_F2.surfaces) + analysis.rearPrincipal),
          imagePlaneX,
        },
      );

      rays.setPaths(paths);

      consoleScreens?.setState({
        focalLength: state.focalLength,
        fNumber: state.fNumber,
        focusDistance: state.focusDistance,
        sensor: state.sensor,
      });
      imagePlane.setRings(
        images.map((image) => ({
          id: image.id,
          diameterMm: image.blurMm,
          color: image.color,
          heightMm: image.heightMm,
        })),
      );
    }

    context?.invalidate();
  }

  return {
    id: 'lens-focus',
    title: { 'pt-BR': 'Lente e plano de foco', en: 'Lens and plane of focus' },

    setup(ctx: LabContext): Promise<void> {
      context = ctx;

      // --- Objetiva --------------------------------------------------------
      opticsGroup = new THREE.Group();
      opticsGroup.name = 'optics';

      for (const [front, back] of elementIndices(LENS_50MM_F2)) {
        const element = createLensElement(LENS_50MM_F2, front, back);
        elements.push(element);
        geometries.push(...element.geometries);
        materials.push(...element.materials);
        opticsGroup.add(element.group);
      }

      iris = createIris();
      // O stop da prescrição fica na superfície 4; a íris mora nele.
      iris.group.position.x = lensMm(stopZMm);
      geometries.push(...iris.geometries);
      materials.push(...iris.materials);
      opticsGroup.add(iris.group);

      root.add(opticsGroup);

      // --- Barril e anéis ---------------------------------------------------
      const scaleTexture = focusRingScale(ringMarks(), RING_SWEEP / (Math.PI * 2));
      barrel = createBarrel(ctx.materials, {
        clearSemiDiameter: LENS_50MM_F2.surfaces[0]!.semiDiameter,
        opticalLengthMm: lengthMm,
        focusScaleTexture: scaleTexture,
      });
      geometries.push(...barrel.geometries);
      materials.push(...barrel.materials);
      root.add(barrel.group);

      // --- Montagem no trilho ----------------------------------------------
      const carriage = ctx.bench.mountAt(LENS_RAIL_MM);
      // O eixo óptico fica na altura do poste do carrinho.
      axisHeight = lensMm(barrelDiameterMm() / 2) + 0.05;
      root.position.y = axisHeight;
      root.position.x = -lensMm(lengthMm / 2);
      carriage.group.add(root);

      // --- Diorama ----------------------------------------------------------
      // Fica no mesmo grupo da objetiva, com origem no primeiro vértice: é o
      // que faz o mapa de profundidade medir a partir da lente.
      diorama = createDiorama({
        materials: ctx.materials,
        instanceBudget: ctx.quality.settings.instanceBudget,
        standHeight: axisHeight - DIORAMA_DROP,
      });
      diorama.group.position.y = -DIORAMA_DROP;
      root.add(diorama.group);
      for (const object of diorama.glowing) ctx.addGlow(object);

      // --- Plano de foco, placa de vidro e raios ----------------------------
      focusPlane = createFocusPlane();
      focusPlane.group.position.y = -DIORAMA_DROP + 0.03;
      root.add(focusPlane.group);
      ctx.addGlow(focusPlane.group);

      imagePlane = createImagePlane({
        materials: ctx.materials,
        x: imagePlaneX,
        sensor: store.get().sensor,
      });
      root.add(imagePlane.group);
      ctx.addGlow(imagePlane.group);

      rays = createRayBundle({ lineWidth: 1.6, particlesPerPath: 2 });
      root.add(rays.group);
      ctx.addGlow(rays.group);

      const applyResolution = (): void =>
        rays?.setResolution(window.innerWidth, window.innerHeight);
      applyResolution();
      window.addEventListener('resize', applyResolution);
      disposers.push(() => window.removeEventListener('resize', applyResolution));

      // A faixa acesa entra nos materiais do diorama, não num objeto separado.
      intersection = attachIntersectionPatch(diorama.terrainMaterials, diorama.group);

      // prefers-reduced-motion desliga partículas e varredura (SPEC §9).
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const applyMotion = (): void => {
        rays?.setParticlesEnabled(!reducedMotion.matches);
        focusPlane?.setAnimated(!reducedMotion.matches);
      };
      applyMotion();
      reducedMotion.addEventListener('change', applyMotion);
      disposers.push(() => reducedMotion.removeEventListener('change', applyMotion));

      // --- Imagem no sensor -------------------------------------------------
      // A câmera virtual mora no centro óptico e só enxerga o diorama, por
      // camada: ela não deve ver os raios, o plano de foco nem a própria placa.
      markVisibleToSensor(diorama.group);

      // Luzes também são filtradas por camada: sem isto a câmera virtual
      // renderiza o diorama no escuro, só com as janelas acesas.
      ctx.room.group.traverse((object) => {
        if ((object as THREE.Light).isLight) object.layers.enable(SENSOR_LAYER);
      });

      const quality = ctx.quality.settings;
      sensor = createSensorRender({
        layer: SENSOR_LAYER,
        size: quality.sensorTargetSize,
        samples: quality.level === 'low' ? 16 : 32,
        blades: 9,
        cameraX: lensMm(analyze(LENS_50MM_F2).entrancePupil.z),
        sceneUnitsPerMm: SCENE_UNITS_PER_MM,
      });
      // A câmera virtual entra no grupo do experimento, não na cena: assim a
      // distância que ela mede é medida a partir da objetiva.
      root.add(sensor.camera);
      imagePlane.setProjectedImage(sensor.texture);

      // Telas do console embutidas na bancada: imagem direita e miniaturas.
      consoleScreens = createConsoleScreens({
        main: sensor,
        layer: SENSOR_LAYER,
        cameraX: lensMm(analyze(LENS_50MM_F2).entrancePupil.z),
        sceneUnitsPerMm: SCENE_UNITS_PER_MM,
        thumbnailSize: Math.max(160, Math.round(quality.sensorTargetSize / 4)),
        samples: 16,
        onPickFocus: (millimeters) => store.set({ focusDistance: millimeters }),
      });
      // Deitadas no tampo, na frente da placa, inclinadas para quem está diante
      // da bancada ler.
      // Quase deitadas: com inclinação maior, a borda da frente afunda no
      // tampo e corta a tira de miniaturas ao meio.
      consoleScreens.group.position.set(imagePlaneX + 0.02, -axisHeight + 0.028, 0.34);
      consoleScreens.group.rotation.set(-Math.PI / 2 + 0.12, 0, 0);
      root.add(consoleScreens.group);
      disposers.push(ctx.registerDraggable(consoleScreens.clickHandle));

      disposers.push(
        ctx.quality.onChange((settings) => {
          sensor?.setSize(settings.sensorTargetSize);
        }),
      );

      // --- Arraste do anel de foco -----------------------------------------
      let dragDistance = store.get().focusDistance;

      disposers.push(
        ctx.registerDraggable({
          targets: [barrel.focusRing],
          cursor: 'ew-resize',
          onDragStart: () => {
            dragDistance = store.get().focusDistance;
          },
          onDrag: (event) => {
            // 420 px de arraste percorrem o curso inteiro do anel.
            const fraction = -distanceToRingAngle(dragDistance) / RING_SWEEP;
            const next = fraction + event.deltaX / 420;
            dragDistance = ringAngleToDistance(-next * RING_SWEEP);
            store.set({ focusDistance: dragDistance });
          },
        }),
      );

      // --- Atalhos (SPEC §6.3) ----------------------------------------------
      const setFocus = (millimeters: number): void => store.set({ focusDistance: millimeters });

      disposers.push(
        ctx.onKey('1', () => setFocus(370)),
        ctx.onKey('2', () => setFocus(600)),
        ctx.onKey('3', () => setFocus(2000)),
        ctx.onKey('[', () => nudgeFocus(-1)),
        ctx.onKey(']', () => nudgeFocus(1)),
        ctx.onKey('f', () => {
          const { fNumber } = store.get();
          const next = stepFNumber(fNumber, 1);
          store.set({ fNumber: next === fNumber ? F_STOP_PRESETS[0] : next });
        }),
        ctx.onKey('x', () => {
          const exploded = store.get().lensMode === 'exploded';
          store.set({ lensMode: exploded ? 'assembled' : 'exploded' });
        }),
      );

      disposers.push(store.subscribe(() => applyState()));
      applyState();

      // Nada a carregar de forma assíncrona nesta fase; a assinatura fica
      // assíncrona porque o diorama da F4 vai precisar.
      return Promise.resolve();
    },

    update(dt: number, elapsed: number): void {
      rays?.update(dt);
      focusPlane?.update(elapsed);

      // A imagem no sensor só é recalculada quando algo muda: é um render da
      // cena inteira a mais por vez, o item mais caro desta fase.
      if (context) consoleScreens?.render(context.renderer, context.scene);

      if (explodeProgress === explodeTarget) return;

      const step = dt / EXPLODE_SECONDS;
      explodeProgress =
        explodeTarget > explodeProgress
          ? Math.min(explodeTarget, explodeProgress + step)
          : Math.max(explodeTarget, explodeProgress - step);

      // easeInOutCubic: sai e chega sem solavanco (SPEC §6.3).
      const t = explodeProgress;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

      const center = lengthMm / 2;
      const lerp = (from: number, to: number): number => from + eased * (to - from);

      elements.forEach((element, index) => {
        const order = index - (elements.length - 1) / 2;
        const target = center + order * EXPLODE_SPREAD_MM;
        element.group.position.x = lensMm(lerp(element.centerMm, target));

        // A haste cresce do trilho até o eixo óptico conforme explode.
        element.post.scale.y = eased * axisHeight;
        element.post.visible = eased > 0.01;
      });

      if (iris) {
        iris.group.position.x = lensMm(lerp(stopZMm, center));
      }

      if (barrel) {
        // O barril e o forro somem: é o que deixa os elementos à vista.
        const shellScale = 1 - eased;
        barrel.shell.visible = shellScale > 0.02;
        barrel.liner.visible = barrel.shell.visible;
        barrel.shell.scale.set(1, Math.max(shellScale, 0.001), Math.max(shellScale, 0.001));
        barrel.liner.scale.copy(barrel.shell.scale);

        // Os anéis vão para as pontas, cada um no seu suporte.
        const span = ((elements.length - 1) / 2) * EXPLODE_SPREAD_MM;
        barrel.focusRing.position.x = lensMm(lerp(barrel.restMm.focusRing, center - span - 58));
        barrel.apertureRing.position.x = lensMm(
          lerp(barrel.restMm.apertureRing, center + span + 58),
        );
        barrel.flange.position.x = lensMm(lerp(barrel.restMm.flange, center + span + 112));
      }

      context?.invalidate();
    },

    set(id: string, value: string | number | boolean): void {
      switch (id) {
        case 'focusPreset':
        case 'focusDistance':
          store.set({ focusDistance: Number(value) });
          break;
        case 'fNumber':
          store.set({ fNumber: Number(value) });
          break;
        case 'lensMode':
          store.set({ lensMode: value === 'exploded' ? 'exploded' : 'assembled' });
          break;
        case 'opticsMode':
          store.set({ opticsMode: value === 'real' ? 'real' : 'thin' });
          break;
        case 'showNumbers':
          store.set({ showNumbers: Boolean(value) });
          break;
        default:
          throw new Error(`Controle desconhecido: ${id}`);
      }
    },

    ui(): PanelSchema {
      return {
        groups: [
          {
            id: 'focus',
            label: { 'pt-BR': 'Foco', en: 'Focus' },
            controls: [
              {
                kind: 'segmented',
                id: 'focusPreset',
                label: { 'pt-BR': 'Plano', en: 'Plane' },
                options: [
                  { value: 370, label: 'Primeiro plano' },
                  { value: 600, label: 'Meio' },
                  { value: 2000, label: 'Fundo' },
                ],
              },
              {
                kind: 'slider',
                id: 'focusDistance',
                label: { 'pt-BR': 'Distância', en: 'Distance' },
                min: 300,
                max: 10_000,
                step: 1,
                logarithmic: true,
                unit: 'mm',
              },
            ],
          },
          {
            id: 'aperture',
            label: { 'pt-BR': 'Abertura', en: 'Aperture' },
            controls: [
              {
                kind: 'segmented',
                id: 'fNumber',
                label: { 'pt-BR': 'Número f', en: 'f-number' },
                options: F_STOP_PRESETS.map((stop) => ({
                  value: stop,
                  label: `f/${String(stop).replace('.', ',')}`,
                })),
              },
            ],
          },
          {
            id: 'lens',
            label: { 'pt-BR': 'Lente', en: 'Lens' },
            controls: [
              {
                kind: 'segmented',
                id: 'lensMode',
                label: { 'pt-BR': 'Modo', en: 'Mode' },
                options: [
                  { value: 'assembled', label: 'Montada' },
                  { value: 'exploded', label: 'Explodida' },
                ],
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return {
        title: { 'pt-BR': 'O plano de foco', en: 'The plane of focus' },
        subtitle: {
          'pt-BR':
            'Todo mundo percebe quando uma foto sai tremida. Quase ninguém viu o plano exato onde ela fica nítida. Gire o anel de foco e veja o plano se mover.',
          en: 'Everyone notices a blurry photo. Almost nobody has seen the exact plane where it comes into focus. Turn the focus ring and watch the plane move.',
        },
        sections: [
          {
            id: 'scales',
            heading: { 'pt-BR': 'Sobre as escalas', en: 'About the scales' },
            body: {
              'pt-BR':
                `A física roda toda em milímetros reais. A objetiva, porém, é desenhada ` +
                `${LENS_EXAGGERATION}× maior que o tamanho real: uma 50 mm de verdade tem ` +
                `3 cm de diâmetro e, na bancada, o vidro sumiria. As curvaturas, as espessuras ` +
                `e o deslocamento de foco mantêm as proporções corretas entre si — só o ` +
                `conjunto inteiro foi ampliado.`,
              en:
                `All physics runs in real millimetres. The lens, however, is drawn ` +
                `${LENS_EXAGGERATION}× larger than life: a real 50 mm is 3 cm across and its ` +
                `glass would vanish on the bench. Curvatures, thicknesses and focus travel keep ` +
                `their correct proportions — only the whole assembly is scaled up.`,
            },
          },
          {
            id: 'lens-model',
            heading: { 'pt-BR': 'Que lente é esta', en: 'Which lens is this' },
            body: {
              'pt-BR':
                `Um par simétrico de dubletos acromáticos de ${analysis.efl.toFixed(1)} mm, ` +
                `projetado aqui a partir de vidros de catálogo. Não é cópia de uma objetiva ` +
                `comercial: com 4 elementos, a aberração esférica em f/2 é maior que a de uma ` +
                `lente de 6 elementos, o que o modo "Aberrações" deixa bem visível.`,
              en:
                `A symmetric pair of achromatic doublets of ${analysis.efl.toFixed(1)} mm, ` +
                `designed here from catalogue glasses. It is not a copy of a commercial lens: ` +
                `with 4 elements, spherical aberration at f/2 is larger than in a 6-element ` +
                `design, which the "Aberrations" mode makes plain.`,
            },
          },
        ],
      };
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      // As matrizes de mundo só são atualizadas no primeiro quadro; sem isto
      // a origem sai zerada e os enquadramentos miram o chão.
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(origin);

      // As distâncias saem do tamanho real da objetiva desenhada. O diâmetro
      // do barril domina o comprimento, então é ele que dá a régua.
      const reach = Math.max(lensMm(lengthMm), lensMm(barrelDiameterMm()));

      // Fundo do vale: o pico está na posição mapeada de 2 m.
      const valleyDepth = distanceToDioramaOffset(DEFAULT_SUBJECT_DISTANCES_MM.background);

      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Vale e objetiva', en: 'Valley and lens' },
          position: {
            x: origin.x + reach * 1.2,
            y: origin.y + reach * 1.3,
            z: origin.z + reach * 2.9,
          },
          target: { x: origin.x - valleyDepth * 0.55, y: origin.y - axisHeight * 0.45, z: origin.z },
          fov: 38,
        },
        {
          id: 'optical-path',
          label: { 'pt-BR': 'Caminho da luz', en: 'Light path' },
          // Perfil puro: é o enquadramento em que o cone de raios, o plano de
          // foco e a placa de vidro aparecem juntos e legíveis.
          position: {
            x: origin.x - valleyDepth * 0.42,
            y: origin.y + reach * 0.35,
            z: origin.z + valleyDepth * 1.35,
          },
          target: { x: origin.x - valleyDepth * 0.42, y: origin.y - 0.02, z: origin.z },
          fov: 34,
        },
        {
          id: 'sensor',
          label: { 'pt-BR': 'Imagem no sensor', en: 'Sensor image' },
          // De frente para o vidro fosco: é onde a imagem invertida aparece.
          position: {
            x: origin.x + reach * 3.4,
            y: origin.y + reach * 0.12,
            z: origin.z + reach * 0.35,
          },
          target: { x: origin.x + reach * 1.42, y: origin.y, z: origin.z },
          fov: 18,
        },
        {
          id: 'console',
          label: { 'pt-BR': 'Console', en: 'Console' },
          // De cima e da frente: é como alguém diante da bancada lê as telas.
          position: {
            x: origin.x + reach * 1.55,
            y: origin.y - axisHeight + 0.55,
            z: origin.z + 0.95,
          },
          target: { x: origin.x + reach * 1.55, y: origin.y - axisHeight, z: origin.z + 0.3 },
          fov: 32,
        },
        {
          id: 'plate',
          label: { 'pt-BR': 'Plano da imagem', en: 'Image plane' },
          position: {
            x: origin.x + reach * 2.4,
            y: origin.y + reach * 0.5,
            z: origin.z + reach * 1.5,
          },
          target: { x: origin.x + reach * 1.5, y: origin.y, z: origin.z },
          fov: 26,
        },
        {
          id: 'valley',
          label: { 'pt-BR': 'Diorama de perto', en: 'Diorama close-up' },
          position: {
            x: origin.x - valleyDepth * 0.45,
            y: origin.y - axisHeight + 0.42,
            z: origin.z + 0.95,
          },
          target: {
            x: origin.x - valleyDepth * 0.55,
            y: origin.y - axisHeight + 0.04,
            z: origin.z,
          },
          fov: 32,
        },
        {
          id: 'lens-three-quarter',
          label: { 'pt-BR': 'Objetiva, três quartos', en: 'Lens, three-quarter' },
          // Do lado do objeto: é de lá que se vê o elemento frontal.
          position: {
            x: origin.x - reach * 2.1,
            y: origin.y + reach * 1.15,
            z: origin.z + reach * 2.6,
          },
          target: origin,
          fov: 30,
        },
        {
          id: 'lens-profile',
          label: { 'pt-BR': 'Objetiva, perfil', en: 'Lens, profile' },
          position: { x: origin.x, y: origin.y + reach * 0.55, z: origin.z + reach * 3.2 },
          target: origin,
          fov: 26,
        },
        {
          id: 'iris',
          label: { 'pt-BR': 'Diafragma', en: 'Iris' },
          // Três quartos de perto, de cima: no modo explodido enquadra as
          // lâminas, que ficam no centro enquanto os anéis vão para as pontas.
          position: {
            x: origin.x - reach * 0.45,
            y: origin.y + reach * 1.0,
            z: origin.z + reach * 1.85,
          },
          target: origin,
          fov: 28,
        },
      ];
    },

    dispose(): void {
      consoleScreens?.dispose();
      consoleScreens = null;
      sensor?.dispose();
      sensor = null;
      intersection?.dispose();
      rays?.dispose();
      imagePlane?.dispose();
      focusPlane?.dispose();
      diorama?.dispose();
      intersection = null;
      rays = null;
      imagePlane = null;
      focusPlane = null;
      diorama = null;

      for (const dispose of disposers) dispose();
      disposers.length = 0;

      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      geometries.length = 0;
      materials.length = 0;

      root.removeFromParent();
      root.clear();
      elements = [];
      iris = null;
      barrel = null;
      opticsGroup = null;
      context = null;
    },
  };
}
