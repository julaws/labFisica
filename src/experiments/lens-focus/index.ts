import * as THREE from 'three';
import type {
  CinematicShot,
  Experiment,
  ExperimentCopy,
  LabContext,
  PanelSchema,
} from '../../core/experiment';
import { LENS_50MM_F2 } from '../../optics/prescriptions/baker-double-gauss';
import { widestFNumber, withFNumber } from '../../optics/aperture';
import { analyze } from '../../optics/paraxial';
import { focusExtension } from '../../optics/thin-lens';
import { opticalLength, stopIndex, vertexPositions } from '../../optics/prescription';
import {
  COC_MM,
  DEFAULT_SUBJECT_DISTANCES_MM,
  FOCUS_RANGE_MM,
  F_STOPS,
  F_STOP_PRESETS,
} from '../../optics/constants';

/** Os três objetos de referência, na forma que a frase dinâmica espera. */
const SUBJECT_DISTANCES = [
  { id: 'foreground', distanceMm: DEFAULT_SUBJECT_DISTANCES_MM.foreground },
  { id: 'midground', distanceMm: DEFAULT_SUBJECT_DISTANCES_MM.midground },
  { id: 'background', distanceMm: DEFAULT_SUBJECT_DISTANCES_MM.background },
] as const;
import { focusRingScale } from '../../scene/textures/procedural';
import { DIORAMA_DEPTH, LENS_EXAGGERATION } from '../../scene/scale';
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
  createElementPosts,
  createIris,
  createLensElement,
  elementIndices,
  lensMm,
} from './lens-model';
import { type LensFocusStore, createLensFocusStore, stepFNumber } from './state';
import { type Diorama, MOUNTAIN, TRAY_WIDTH, createDiorama } from './diorama';
import { millimetersToRailX } from '../../scene/bench';
import { type RayBundle, createRayBundle } from '../../scene/rays';
import { type FocusPlane, type IntersectionPatch, attachIntersectionPatch, createFocusPlane } from './focus-plane';
import { type ImagePlane, createImagePlane } from './image-plane';
import { buildRayFans } from './ray-fans';
import {
  blurDiameter,
  dofLimits,
  hyperfocal,
  imageDistance,
  magnification,
  pupilDiameter,
} from '../../optics/thin-lens';
import { type Facts, buildCopy } from './copy';
import { describeHighlights, describeState } from './describe';
import {
  type Locale,
  formatCentimeters,
  formatDistance,
  formatFNumber,
  formatMillimeters,
  formatNumber,
} from '../../ui/i18n';
import type { HudModel, NumberRow } from '../../core/experiment';
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

/**
 * Posição da lente no trilho, em marcas da régua. Escolhida para centrar na
 * bancada o conjunto inteiro, do céu do diorama à placa da imagem.
 */
const LENS_RAIL_MM = 790;

/**
 * Onde ficam as telas do console, relativas à origem do experimento (o
 * elemento frontal), em unidades de cena: embutidas na face frontal da
 * bancada, abaixo do tampo, como o console da referência. Posição visual
 * pura: as telas mostram renders da câmera virtual, que não depende de onde
 * elas estão. `belowRail` é quanto o centro das telas fica abaixo do topo do
 * trilho: amarrado ao trilho, e não ao eixo, ele não muda com a escala da lente.
 */
const CONSOLE_PLACEMENT = { z: 0.532, belowRail: 0.35, scale: 1 } as const;

/**
 * Distância da câmera virtual do sensor à borda próxima do vale, em unidades
 * de cena. Escolhida para o quadro do sensor (±13,5° na vertical, uma 50 mm
 * full frame) pegar do pé da cabana ao pico da montanha, que cresceram 3× na
 * ADR 0006.
 *
 * A posição não mexe no desfoque. O shader mede a distância física pelo mapa
 * logarítmico a partir da origem da objetiva, descontando onde a câmera está;
 * a câmera só decide o enquadramento. Na lente 12×, a pupila de entrada fica
 * 0,32 atrás do primeiro vidro e o vale se afastou para abrir espaço ao anel
 * de foco: deixada ali, a câmera veria o vale pequeno, no meio de um quadro
 * preto. O vale já é uma maquete comprimida; não existe ponto de vista
 * "fisicamente certo" para olhar para ele.
 */
const SENSOR_STANDOFF = 0.74;
const SENSOR_CAMERA_X = -(DIORAMA_DEPTH.gapScene - SENSOR_STANDOFF);

/** Duração da transição montada ↔ explodida, em segundos (SPEC §6.3). */
const EXPLODE_SECONDS = 0.8;

/**
 * Afastamento entre elementos vizinhos no modo explodido, em mm de física.
 * O barril some ao explodir, então o espaçamento só precisa deixar cada
 * elemento à vista; com seis vidros na escala 12×, 11 mm cabem entre o vale e
 * a placa da imagem.
 */
const EXPLODE_SPREAD_MM = 11;

/** Folga entre o último elemento explodido e os anéis, mm de física. */
const EXPLODE_RING_GAP_MM = { focus: 14, flange: 12 } as const;

/**
 * Quanto a bandeja do diorama fica **abaixo** do eixo óptico, em unidades de
 * cena. Pequeno de propósito: o vale precisa estar na altura da objetiva para
 * que a imagem dos objetos caia dentro do sensor.
 */
const DIORAMA_DROP = 0.28;

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
  let locale: Locale = 'pt-BR';
  let iris: ReturnType<typeof createIris> | null = null;
  let posts: ReturnType<typeof createElementPosts> | null = null;
  let barrel: ReturnType<typeof createBarrel> | null = null;
  let opticsGroup: THREE.Group | null = null;

  /** 0 = montada, 1 = explodida. Animado com easing próprio. */
  let explodeProgress = 0;
  let explodeTarget = 0;

  const analysis = analyze(LENS_50MM_F2);
  const lengthMm = opticalLength(LENS_50MM_F2.surfaces);

  /** Posição do stop na prescrição, em mm de física. */
  const stopZMm = vertexPositions(LENS_50MM_F2.surfaces)[stopIndex(LENS_50MM_F2.surfaces)]!;

  /** Maior semidiâmetro livre entre os vidros, mm: é ele que dá o barril. */
  const clearSemiDiameterMm = Math.max(
    ...LENS_50MM_F2.surfaces.filter((surface) => !surface.isStop).map((surface) => surface.semiDiameter),
  );

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

  /**
   * x do console no grupo do experimento: o centro da bancada. A faixa de
   * telas ocupa quase toda a frente dela.
   */
  function consoleX(): number {
    return -(millimetersToRailX(LENS_RAIL_MM) + root.position.x);
  }

  /** Diâmetro externo do barril, em mm de física. */
  function barrelDiameterMm(): number {
    return 2 * Math.max(clearSemiDiameterMm + 3.2, bladeSweepRadius(DEFAULT_IRIS) + 2);
  }

  /**
   * Textos das etiquetas 3D (SPEC §3.3). Os números saem do motor, como no
   * HUD, e a etiqueta da zona nítida mostra o mesmo valor que o chip.
   */
  function updateLabels(): void {
    if (!context) return;
    const state = store.get();
    const dof = dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance);
    const zone = Number.isFinite(dof.total) ? formatCentimeters(dof.total, locale) : '∞';
    const en = locale === 'en';

    context.labels.setText('image-plane', en ? 'Image plane' : 'Plano da imagem');
    context.labels.setText('focus-ring', en ? 'Focus ring · drag' : 'Anel de foco · arraste');
    context.labels.setText(
      'focus-plane',
      `${en ? 'Plane of focus' : 'Plano de foco'} · ${formatDistance(state.focusDistance, locale)}`,
    );
    context.labels.setText('zone', `${en ? 'Sharp zone' : 'Zona nítida'} · ${zone}`);
  }

  /** Números atuais para os textos do modal, todos vindos do motor. */
  function facts(): Facts {
    const state = store.get();
    const f = state.focalLength;
    const s = state.focusDistance;
    const dof = dofLimits(f, state.fNumber, state.coc, s);
    const { foreground, midground, background } = DEFAULT_SUBJECT_DISTANCES_MM;

    return {
      focalLength: f,
      fNumber: state.fNumber,
      widestFNumber: widestFNumber(LENS_50MM_F2),
      focusDistance: s,
      dofTotal: dof.total,
      dofNear: dof.near,
      dofFar: dof.far,
      coc: state.coc,
      extension: focusExtension(f, s),
      pupilDiameter: pupilDiameter(f, state.fNumber),
      blurPine: blurDiameter(f, state.fNumber, s, foreground),
      blurCabin: blurDiameter(f, state.fNumber, s, midground),
      blurPeak: blurDiameter(f, state.fNumber, s, background),
      eflPrescription: analysis.efl,
      lensExaggeration: LENS_EXAGGERATION,
    };
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

    updateLabels();

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
          // O feixe entra no primeiro vértice e sai pelo plano principal
          // traseiro: é desse plano que a lente fina mede v, e só assim o
          // cone na placa mede exatamente o b(d) do motor (ver ray-fans.ts).
          entrancePupilX: opticsOffset,
          exitPupilX:
            opticsOffset + lensMm(opticalLength(LENS_50MM_F2.surfaces) + analysis.rearPrincipal),
          projectionCenterX: SENSOR_CAMERA_X,
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
          lateralMm: image.lateralMm,
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

      // Hastes do modo explodido: uma malha instanciada para os seis vidros.
      posts = createElementPosts(elements.length);
      geometries.push(...posts.geometries);
      materials.push(...posts.materials);
      opticsGroup.add(posts.mesh);

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
        clearSemiDiameter: clearSemiDiameterMm,
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
      // A lâmina cobre a bandeja inteira e sobe até o pico da montanha.
      const slab = { width: TRAY_WIDTH + 0.04, height: MOUNTAIN.height + 0.08 };
      focusPlane = createFocusPlane(slab);
      focusPlane.group.position.y = -DIORAMA_DROP + slab.height / 2 - 0.03;
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
        cameraX: SENSOR_CAMERA_X,
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
        cameraX: SENSOR_CAMERA_X,
        sceneUnitsPerMm: SCENE_UNITS_PER_MM,
        // As miniaturas cresceram 3× (ADR 0006): meia resolução do sensor.
        thumbnailSize: Math.max(256, Math.round(quality.sensorTargetSize / 2)),
        samples: 16,
        onPickFocus: (millimeters) => store.set({ focusDistance: millimeters }),
      });
      // Em pé na face frontal da bancada, de frente para quem está diante
      // dela, embaixo do meio do conjunto.
      consoleScreens.group.position.set(
        consoleX(),
        -(axisHeight + CONSOLE_PLACEMENT.belowRail),
        CONSOLE_PLACEMENT.z,
      );
      consoleScreens.group.scale.setScalar(CONSOLE_PLACEMENT.scale);
      root.add(consoleScreens.group);
      disposers.push(ctx.registerDraggable(consoleScreens.clickHandle));

      disposers.push(
        ctx.quality.onChange((settings) => {
          sensor?.setSize(settings.sensorTargetSize);
        }),
      );

      // --- Etiquetas 3D -----------------------------------------------------
      ctx.labels.add({
        id: 'image-plane',
        anchor: imagePlane.group,
        offset: { x: 0, y: lensMm(24) * 0.62, z: 0 },
        text: '',
      });
      ctx.labels.add({
        id: 'focus-ring',
        anchor: barrel.focusRing,
        offset: { x: 0, y: lensMm(barrelDiameterMm() / 2) * 1.2, z: 0 },
        text: '',
        accent: '#C8923A',
      });
      ctx.labels.add({
        id: 'focus-plane',
        anchor: focusPlane.blade,
        offset: { x: 0, y: MOUNTAIN.height / 2 + 0.06, z: 0 },
        text: '',
      });
      ctx.labels.add({
        id: 'zone',
        anchor: focusPlane.blade,
        offset: { x: 0, y: -MOUNTAIN.height / 2 + 0.02, z: TRAY_WIDTH / 2 + 0.02 },
        text: '',
      });
      disposers.push(() => {
        for (const id of ['image-plane', 'focus-ring', 'focus-plane', 'zone']) ctx.labels.remove(id);
      });

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
        posts?.place(index, element.group.position.x, eased * axisHeight);
      });
      if (posts) posts.mesh.visible = eased > 0.01;

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
        // O anel de foco vai para a frente e o flange vai para trás.
        const gap = EXPLODE_RING_GAP_MM;
        barrel.focusRing.position.x = lensMm(lerp(barrel.restMm.focusRing, center - span - gap.focus));
        barrel.flange.position.x = lensMm(lerp(barrel.restMm.flange, center + span + gap.flange));
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
        case 'coc':
          store.set({ coc: Number(value) });
          break;
        default:
          throw new Error(`Controle desconhecido: ${id}`);
      }
    },

    get(id: string): string | number | boolean {
      const state = store.get();
      switch (id) {
        case 'focusPreset':
        case 'focusDistance':
          return state.focusDistance;
        case 'fNumber':
          return state.fNumber;
        case 'lensMode':
          return state.lensMode;
        case 'opticsMode':
          return state.opticsMode;
        case 'showNumbers':
          return state.showNumbers;
        case 'coc':
          return state.coc;
        // Limites da zona nítida, para a faixa desenhada no slider de
        // distância. Leitura só: vêm do motor, como o resto.
        case 'dofNear':
          return dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance).near;
        case 'dofFar':
          return dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance).far;
        default:
          throw new Error(`Controle desconhecido: ${id}`);
      }
    },

    subscribe(listener: () => void): () => void {
      return store.subscribe(() => listener());
    },

    hud(locale: Locale): HudModel {
      const state = store.get();
      const copy = buildCopy(facts());
      const dof = dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance);
      const zone = Number.isFinite(dof.total) ? formatCentimeters(dof.total, locale) : '∞';
      const described = {
        focalLength: state.focalLength,
        fNumber: state.fNumber,
        focusDistance: state.focusDistance,
        coc: state.coc,
      };

      return {
        title: copy.title[locale],
        subtitle: copy.subtitle[locale],
        chips: [
          {
            id: 'focus',
            label: locale === 'en' ? 'Focus' : 'Foco',
            value: formatDistance(state.focusDistance, locale),
          },
          {
            id: 'aperture',
            label: locale === 'en' ? 'Aperture' : 'Abertura',
            value: formatFNumber(state.fNumber, locale),
          },
          { id: 'zone', label: locale === 'en' ? 'Sharp zone' : 'Zona nítida', value: zone },
        ],
        sentence: describeState(described, SUBJECT_DISTANCES, locale),
        highlights: describeHighlights(described, locale),
      };
    },

    numbers(locale: Locale): NumberRow[] {
      const state = store.get();
      const f = state.focalLength;
      const s = state.focusDistance;
      const dof = dofLimits(f, state.fNumber, state.coc, s);
      const en = locale === 'en';

      return [
        {
          id: 'v',
          label: en ? 'Image distance v' : 'Distância da imagem v',
          value: formatMillimeters(imageDistance(f, s), locale),
          hint: 'v = f·u / (u − f)',
        },
        {
          id: 'extension',
          label: en ? 'Focus extension' : 'Extensão do foco',
          value: formatMillimeters(focusExtension(f, s), locale),
          hint: 'e = v − f',
        },
        {
          id: 'hyperfocal',
          label: en ? 'Hyperfocal' : 'Hiperfocal',
          value: formatDistance(hyperfocal(f, state.fNumber, state.coc), locale),
          hint: 'H = f² / (N·c) + f',
        },
        {
          id: 'near',
          label: en ? 'Near limit' : 'Limite próximo',
          value: formatDistance(dof.near, locale),
        },
        {
          id: 'far',
          label: en ? 'Far limit' : 'Limite distante',
          value: formatDistance(dof.far, locale),
        },
        {
          id: 'magnification',
          label: en ? 'Magnification' : 'Magnificação',
          value: `${formatNumber(magnification(f, s), 4, locale)}×`,
          hint: 'm = −v / u',
        },
        {
          id: 'pupil',
          label: en ? 'Pupil diameter D' : 'Diâmetro da pupila D',
          value: formatMillimeters(pupilDiameter(f, state.fNumber), locale),
          hint: 'D = f / N',
        },
        {
          id: 'coc',
          label: en ? 'Acceptable circle c' : 'Círculo admissível c',
          value: formatMillimeters(state.coc, locale),
        },
        {
          id: 'widest',
          label: en ? 'Widest aperture' : 'Abertura máxima',
          value: `f/${formatNumber(widestFNumber(LENS_50MM_F2), 2, locale)}`,
        },
      ];
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      return {
        groups: [
          {
            id: 'focus',
            label: { 'pt-BR': 'Foco', en: 'Focus' },
            hint: { 'pt-BR': 'arraste o anel · 1 2 3', en: 'drag the ring · 1 2 3' },
            controls: [
              {
                kind: 'segmented',
                id: 'focusPreset',
                label: { 'pt-BR': 'Plano', en: 'Plane' },
                options: [
                  { value: 370, label: en ? 'Front' : 'Frente' },
                  { value: 600, label: en ? 'Middle' : 'Meio' },
                  { value: 2000, label: en ? 'Back' : 'Fundo' },
                ],
              },
              {
                kind: 'slider',
                id: 'focusDistance',
                label: { 'pt-BR': 'Distância', en: 'Distance' },
                min: FOCUS_RANGE_MM.min,
                max: FOCUS_RANGE_MM.max,
                step: 1,
                logarithmic: true,
                unit: 'mm',
                band: { from: 'dofNear', to: 'dofFar' },
              },
            ],
          },
          {
            id: 'aperture',
            label: { 'pt-BR': 'Abertura', en: 'Aperture' },
            hint: { 'pt-BR': 'F', en: 'F' },
            controls: [
              {
                kind: 'segmented',
                id: 'fNumber',
                label: { 'pt-BR': 'Atalhos', en: 'Presets' },
                options: F_STOP_PRESETS.map((stop) => ({
                  value: stop,
                  label: formatFNumber(stop, locale),
                })),
              },
              {
                kind: 'stops',
                id: 'fNumber',
                label: { 'pt-BR': 'Stops completos', en: 'Full stops' },
                // Só os stops que esta objetiva alcança (ADR 0003).
                values: F_STOPS.filter((stop) => stop >= widestFNumber(LENS_50MM_F2) - 1e-6),
                secondary: true,
              },
            ],
          },
          {
            id: 'lens',
            label: { 'pt-BR': 'Lente', en: 'Lens' },
            hint: { 'pt-BR': 'X', en: 'X' },
            controls: [
              {
                kind: 'segmented',
                id: 'lensMode',
                label: { 'pt-BR': 'Modo', en: 'Mode' },
                options: [
                  { value: 'assembled', label: en ? 'Assembled' : 'Montada' },
                  { value: 'exploded', label: en ? 'Exploded' : 'Explodida' },
                ],
              },
              {
                kind: 'segmented',
                id: 'coc',
                label: { 'pt-BR': 'Círculo admissível', en: 'Acceptable circle' },
                options: [
                  { value: COC_MM.reference, label: formatMillimeters(COC_MM.reference, locale) },
                  { value: COC_MM.strict, label: formatMillimeters(COC_MM.strict, locale) },
                ],
                secondary: true,
              },
            ],
          },
        ],
      };
    },

    copy(): ExperimentCopy {
      return buildCopy(facts());
    },

    setLocale(next: Locale): void {
      locale = next;
      updateLabels();
    },

    cameras(): CinematicShot[] {
      const origin = new THREE.Vector3();
      // As matrizes de mundo só são atualizadas no primeiro quadro; sem isto
      // a origem sai zerada e os enquadramentos miram o chão.
      root.updateWorldMatrix(true, false);
      root.getWorldPosition(origin);

      // Âncoras ao longo do eixo, em x de mundo: os enquadramentos miram
      // peças, não múltiplos do tamanho da lente — assim sobrevivem a uma
      // troca de escala (ADR 0005).
      const lensCenterX = origin.x + lensMm(lengthMm / 2);
      const stopX = origin.x + lensMm(stopZMm);
      const plateX = origin.x + imagePlaneX;
      const valleyNearX = origin.x - DIORAMA_DEPTH.gapScene;
      const valleyMidX = origin.x - (DIORAMA_DEPTH.gapScene + DIORAMA_DEPTH.spanScene / 2);
      // Altura do tampo do diorama em relação ao eixo.
      const trayY = origin.y - DIORAMA_DROP;

      return [
        {
          id: 'overview',
          label: { 'pt-BR': 'Vale e objetiva', en: 'Valley and lens' },
          // Diante da bancada, pouco acima do eixo e levemente à direita da
          // objetiva, como o estúdio da referência: o vale corre para a
          // esquerda, a objetiva fica no centro, o console aparece embaixo na
          // face da bancada e a sala ao fundo cai na profundidade de campo da
          // câmera. O alvo fica abaixo do eixo para o conjunto sair de baixo
          // do painel de controles.
          position: {
            x: origin.x - 0.115,
            y: origin.y + 0.445,
            z: origin.z + 3.7,
          },
          target: { x: origin.x - 0.265, y: origin.y - 0.375, z: origin.z },
          fov: 40,
          // No retrato, de viés pela direita: o trilho recua na diagonal e
          // vale, objetiva e console cabem entre o HUD e a gaveta.
          portrait: {
            position: { x: origin.x + 1.385, y: origin.y + 1.045, z: origin.z + 4.2 },
            target: { x: origin.x - 0.215, y: origin.y - 0.455, z: origin.z },
            fov: 58,
          },
        },
        {
          id: 'optical-path',
          label: { 'pt-BR': 'Caminho da luz', en: 'Light path' },
          // Perfil puro, do meio do vale à placa: é o enquadramento em que o
          // cone de raios, o plano de foco e a placa aparecem juntos.
          position: {
            x: (valleyNearX + plateX) / 2 - 0.15,
            y: origin.y + 0.22,
            z: origin.z + 3.3,
          },
          target: { x: (valleyNearX + plateX) / 2 - 0.15, y: origin.y - 0.03, z: origin.z },
          fov: 34,
        },
        {
          id: 'sensor',
          label: { 'pt-BR': 'Imagem no sensor', en: 'Sensor image' },
          // De trás e de frente para o vidro fosco: é onde a imagem invertida
          // aparece, com os anéis de cada objeto.
          position: { x: plateX + 2.4, y: origin.y + 0.1, z: origin.z + 0.35 },
          target: { x: plateX, y: origin.y, z: origin.z },
          fov: 20,
        },
        {
          id: 'console',
          label: { 'pt-BR': 'Console', en: 'Console' },
          // De frente e um pouco de cima: é como alguém diante da bancada lê
          // as telas.
          position: {
            x: origin.x + consoleX(),
            y: origin.y - axisHeight - CONSOLE_PLACEMENT.belowRail + 0.45,
            z: origin.z + CONSOLE_PLACEMENT.z + 2.6,
          },
          target: {
            x: origin.x + consoleX(),
            y: origin.y - axisHeight - CONSOLE_PLACEMENT.belowRail,
            z: origin.z + CONSOLE_PLACEMENT.z,
          },
          fov: 46,
        },
        {
          id: 'plate',
          label: { 'pt-BR': 'Plano da imagem', en: 'Image plane' },
          // Três quartos por trás: os cones chegando e a imagem na placa.
          position: { x: plateX + 1.0, y: origin.y + 0.45, z: origin.z + 1.5 },
          target: { x: plateX - 0.15, y: origin.y, z: origin.z },
          fov: 34,
        },
        {
          id: 'valley',
          label: { 'pt-BR': 'Diorama de perto', en: 'Diorama close-up' },
          // Pela frente e de cima, no meio da bandeja: o bosque, a cabana e o
          // plano de foco cortando o vale.
          position: { x: valleyMidX + 0.35, y: trayY + 0.75, z: origin.z + 1.55 },
          target: { x: valleyMidX + 0.05, y: trayY + 0.14, z: origin.z },
          fov: 38,
        },
        {
          id: 'lens-three-quarter',
          label: { 'pt-BR': 'Objetiva, três quartos', en: 'Lens, three-quarter' },
          // Do lado do objeto: é de lá que se vê o elemento frontal.
          // Afastada o bastante para o anel de foco, que no modo explodido
          // vai para a frente, não tomar o primeiro plano.
          position: { x: lensCenterX - 1.15, y: origin.y + 0.6, z: origin.z + 1.75 },
          target: { x: lensCenterX + 0.05, y: origin.y - 0.02, z: origin.z },
          fov: 34,
        },
        {
          id: 'lens-profile',
          label: { 'pt-BR': 'Objetiva, perfil', en: 'Lens, profile' },
          // De frente para o corte do barril: os seis vidros, lado a lado.
          position: { x: lensCenterX - 0.05, y: origin.y + 0.3, z: origin.z + 1.55 },
          target: { x: lensCenterX - 0.05, y: origin.y, z: origin.z },
          fov: 32,
        },
        {
          id: 'iris',
          label: { 'pt-BR': 'Diafragma', en: 'Iris' },
          // Três quartos de perto, de cima: no modo explodido enquadra as
          // lâminas, que ficam no centro.
          position: { x: stopX - 0.35, y: origin.y + 0.42, z: origin.z + 0.8 },
          target: { x: stopX, y: origin.y, z: origin.z },
          fov: 30,
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
