import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type {
  CinematicShot,
  Experiment,
  ExperimentCopy,
  LabContext,
  PanelSchema,
} from '../../core/experiment';
import { LENS_50MM_F2 } from '../../optics/prescriptions/baker-double-gauss';
import {
  LENSES,
  LENS_IDS,
  type LensFacts,
  type LensId,
  aberrationSpotDiameter,
  lensFacts,
} from '../../optics/lenses';
import { widestFNumber, withFNumber } from '../../optics/aperture';
import { analyze } from '../../optics/paraxial';
import { opticalLength, stopIndex, vertexPositions } from '../../optics/prescription';
import {
  COC_MM,
  DEFAULT_FOCAL_LENGTH_MM,
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
import { nameplateTexture } from '../../scene/textures/procedural';
import { DIORAMA_DEPTH, LENS_EXAGGERATION } from '../../scene/scale';
import {
  RING_SWEEP,
  distanceToRingAngle,
  ringAngleToDistance,
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
import {
  type LensFocusStore,
  RAY_SUBJECTS,
  type RaySubject,
  createLensFocusStore,
  stepFNumber,
} from './state';
import { type Diorama, MOUNTAIN, SKY_HEIGHT, TRAY_WIDTH, createDiorama } from './diorama';
import { PALETTE } from '../../scene/materials';
import { createEquationPlate } from '../../scene/equation-plate';
import { LENS_EQUATION_PLATE } from './equation';
import { DioramaBlurPass } from './scene-blur';
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
  plateBlurDiameter,
  plateDistance,
  pupilDiameter,
  ringExtension,
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

/** Segundos por volta do giro lento dos leques de raios. */
const RAY_SPIN_PERIOD = 72;

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
  /** Brilho âmbar de dentro da objetiva, no diafragma (luz prática emprestada). */
  let ember: THREE.PointLight | null = null;
  const emberPosition = new THREE.Vector3();

  /** Leva o brilho do diafragma para onde a íris está agora. */
  function placeEmber(): void {
    if (!ember || !iris) return;
    iris.group.updateWorldMatrix(true, false);
    iris.group.getWorldPosition(emberPosition);
    ember.parent?.worldToLocal(emberPosition);
    ember.position.copy(emberPosition);
  }

  /**
   * Giro lento dos leques de raios em volta do eixo, como na referência:
   * puramente visual, uma volta a cada `RAY_SPIN_PERIOD` segundos.
   */
  let raySpin = 0;
  let raySpinEnabled = true;
  /** Entradas do último leque calculado, para o giro só refazer os raios. */
  let fanInputs: Parameters<typeof buildRayFans> | null = null;

  /** 0 = montada, 1 = explodida. Animado com easing próprio. */
  // Começa na pose do estado inicial (explodida), sem animar na abertura.
  let explodeProgress = store.get().lensMode === 'exploded' ? 1 : 0;
  let explodeTarget = explodeProgress;
  /** Força uma pose dos vidros mesmo sem animação (troca de objetiva). */
  let explodeDirty = true;

  // O barril, o carrinho e a placa são medidos pelo Gauss duplo, a objetiva de
  // casa. Trocar a objetiva troca só os vidros (ADR 0007).
  const lengthMm = opticalLength(LENS_50MM_F2.surfaces);

  /** Posição do stop do Gauss duplo, em mm de física. */
  const stopZMm = vertexPositions(LENS_50MM_F2.surfaces)[stopIndex(LENS_50MM_F2.surfaces)]!;

  /**
   * Maior semidiâmetro livre entre os vidros de **todas** as objetivas, mm:
   * é ele que dá o barril, que fica o mesmo na troca.
   */
  const clearSemiDiameterMm = Math.max(
    ...LENS_IDS.flatMap((id) =>
      LENSES[id].surfaces.filter((surface) => !surface.isStop).map((surface) => surface.semiDiameter),
    ),
  );

  /**
   * Distância de casa do sensor ao plano principal traseiro, mm: a de uma
   * objetiva de 50 mm focada no infinito. O sensor é o corpo da câmera; ele
   * não muda quando a objetiva muda.
   */
  const HOME_PLATE_MM = DEFAULT_FOCAL_LENGTH_MM;

  /** Objetiva montada agora. */
  let lens: LensFacts = lensFacts(store.get().lens);
  /** Desfoque do vale na cena (scene-blur.ts) e a distância do sensor que ele usa, mm. */
  let sceneBlur: DioramaBlurPass | null = null;
  let plateMm = HOME_PLATE_MM;
  let lensStopZMm = vertexPositions(lens.prescription.surfaces)[stopIndex(lens.prescription.surfaces)]!;

  /**
   * Onde fica o primeiro vértice da objetiva montada, em x de cena dentro do
   * grupo do experimento, com ela em casa (foco no infinito). Cada objetiva é
   * posta com o plano principal traseiro a `HOME_PLATE_MM` da placa, que é
   * onde uma câmera real a teria. Para o Gauss duplo dá zero.
   */
  function lensBaseX(facts: LensFacts): number {
    return imagePlaneX - lensMm(HOME_PLATE_MM + facts.length + facts.rearPrincipal);
  }

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
    opticalLength(LENS_50MM_F2.surfaces) + analyze(LENS_50MM_F2).rearPrincipal + DEFAULT_FOCAL_LENGTH_MM,
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
      lens: state.lens,
      converging: lens.converging,
      aberrationSpot: aberrationSpotDiameter(state.lens, state.fNumber),
      plateBlurPine: plateBlurDiameter(
        f,
        state.fNumber,
        plateDistance(f, s, HOME_PLATE_MM),
        foreground,
      ),
      focalLength: f,
      fNumber: state.fNumber,
      widestFNumber: widestFNumber(lens.prescription),
      focusDistance: s,
      dofTotal: dof.total,
      dofNear: dof.near,
      dofFar: dof.far,
      coc: state.coc,
      extension: ringExtension(f, s, HOME_PLATE_MM),
      pupilDiameter: pupilDiameter(f, state.fNumber),
      blurPine: blurDiameter(f, state.fNumber, s, foreground),
      blurCabin: blurDiameter(f, state.fNumber, s, midground),
      blurPeak: blurDiameter(f, state.fNumber, s, background),
      eflPrescription: lens.efl,
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
    const adjusted = withFNumber(lens.prescription, fNumber);
    return adjusted.surfaces.find((surface) => surface.isStop)!.semiDiameter;
  }

  /** Vidros e hastes da objetiva montada agora; trocados na troca de objetiva. */
  const lensGeometries: THREE.BufferGeometry[] = [];
  const lensMaterials: THREE.Material[] = [];

  /**
   * Monta os vidros de uma objetiva no grupo óptico (ADR 0007). Os vidros da
   * anterior são descartados; o barril, a íris e a placa ficam.
   */
  function buildLensElements(id: LensId): void {
    if (!opticsGroup) return;
    for (const element of elements) element.group.removeFromParent();
    posts?.mesh.removeFromParent();
    for (const geometry of lensGeometries) geometry.dispose();
    for (const material of lensMaterials) material.dispose();
    lensGeometries.length = 0;
    lensMaterials.length = 0;
    elements = [];

    lens = lensFacts(id);
    const prescription = lens.prescription;
    lensStopZMm = vertexPositions(prescription.surfaces)[stopIndex(prescription.surfaces)]!;

    for (const [front, back] of elementIndices(prescription)) {
      const element = createLensElement(prescription, front, back);
      elements.push(element);
      lensGeometries.push(...element.geometries);
      lensMaterials.push(...element.materials);
      opticsGroup.add(element.group);
    }

    // Hastes do modo explodido: uma malha instanciada para todos os vidros.
    posts = createElementPosts(elements.length);
    lensGeometries.push(...posts.geometries);
    lensMaterials.push(...posts.materials);
    opticsGroup.add(posts.mesh);

    // A íris mora no stop da prescrição.
    if (iris) iris.group.position.x = lensMm(lensStopZMm);

    // Recalcula a pose explodida dos vidros novos no próximo quadro.
    explodeDirty = true;
  }

  /**
   * Base larga sob a objetiva, no carrinho, com a placa dourada de
   * identificação na frente — como a da referência.
   */
  function addNameplate(carriageGroup: THREE.Object3D, ctx: LabContext): void {
    // Funda o bastante para a frente passar da régua gravada do trilho, que
    // avança até z ≈ 0,12: a placa fica à frente dela, sem atravessá-la.
    const saddleGeometry = new THREE.BoxGeometry(0.36, 0.05, 0.25);
    saddleGeometry.translate(0, 0.025, 0);
    geometries.push(saddleGeometry);
    const saddle = new THREE.Mesh(saddleGeometry, ctx.materials.anodizedAluminum);
    saddle.receiveShadow = true;
    carriageGroup.add(saddle);

    const texture = nameplateTexture('@juliophisico', 'LABORATÓRIO DE ÓPTICA · 50/2');
    const plateGeometry = new THREE.PlaneGeometry(0.29, 0.29 * (352 / 1024));
    geometries.push(plateGeometry);
    const plateMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      metalness: 0.75,
      roughness: 0.38,
      envMapIntensity: 0.6,
    });
    materials.push(plateMaterial);
    const plate = new THREE.Mesh(plateGeometry, plateMaterial);
    plate.name = 'nameplate';
    // Na frente da base, descendo à frente do trilho. Reta: inclinada, a borda
    // de cima entraria na base.
    plate.position.set(0, 0.005, 0.127);
    carriageGroup.add(plate);

    // Manípulo de trava do carrinho: botão serrilhado de latão na frente do
    // trilho, como na referência.
    const knobGeometry = new THREE.CylinderGeometry(0.042, 0.046, 0.05, 48);
    knobGeometry.rotateX(Math.PI / 2);
    // Tampa polida e haste: mesmo material, uma malha só.
    const capParts = [
      new THREE.CylinderGeometry(0.03, 0.042, 0.012, 48).rotateX(Math.PI / 2).translate(0, 0, 0.031),
      new THREE.CylinderGeometry(0.01, 0.01, 0.05, 16).rotateX(Math.PI / 2).translate(0, 0, -0.04),
    ];
    const capGeometry = mergeGeometries(capParts);
    for (const part of capParts) part.dispose();
    if (!capGeometry) throw new Error('Falha ao montar o manípulo');
    geometries.push(knobGeometry, capGeometry);
    const knurl = new THREE.MeshPhysicalMaterial({
      color: 0xc8842c,
      metalness: 1,
      roughness: 0.32,
      normalMap: ctx.materials.knurledRubber.normalMap,
      normalScale: new THREE.Vector2(0.9, 0.9),
      clearcoat: 0.3,
      clearcoatRoughness: 0.3,
    });
    const polished = new THREE.MeshStandardMaterial({ color: 0xe0a64a, metalness: 1, roughness: 0.15 });
    materials.push(knurl, polished);
    const knob = new THREE.Group();
    knob.name = 'carriage-knob';
    const grip = new THREE.Mesh(knobGeometry, knurl);
    grip.castShadow = true;
    knob.add(grip, new THREE.Mesh(capGeometry, polished));
    knob.position.set(-0.24, 0.035, 0.17);
    carriageGroup.add(knob);
  }

  /** Aplica o estado à cena: íris, deslocamento de foco e rotação do anel. */
  function applyState(): void {
    const state = store.get();

    // Troca de objetiva: os vidros novos entram antes de qualquer conta.
    if (lens.prescription !== LENSES[state.lens]) buildLensElements(state.lens);

    iris?.setClearRadius(stopSemiDiameter(state.fNumber));

    // Foco por deslocamento unitário: o grupo óptico inteiro anda para a
    // frente pela extensão e = v − f, que vem do motor (SPEC §5.3). Numa
    // lente divergente o anel é a mesma rosca: ela anda o mesmo curso, mas
    // nenhuma posição forma imagem real (ADR 0007).
    const extension = ringExtension(state.focalLength, state.focusDistance, HOME_PLATE_MM);
    if (opticsGroup) opticsGroup.position.x = lensBaseX(lens) - lensMm(extension);

    if (barrel) {
      barrel.focusRing.rotation.x = distanceToRingAngle(state.focusDistance);
      barrel.sync();
    }
    placeEmber();

    explodeTarget = state.lensMode === 'exploded' ? 1 : 0;

    updateLabels();

    // --- Zona nítida: tudo vem do motor -------------------------------------
    // Sem imagem real não há plano de foco: a lâmina e a faixa somem.
    if (lens.converging) {
      const dof = dofLimits(state.focalLength, state.fNumber, state.coc, state.focusDistance);
      focusPlane?.setZone(state.focusDistance, dof.near, dof.far);
      intersection?.setZone(state.focusDistance, dof.near, dof.far);
    }
    focusPlane?.setVisible(lens.converging);
    if (focusPlane) focusPlane.blade.visible = lens.converging;
    intersection?.setEnabled(lens.converging);

    // --- Leques de raios e anéis de círculo de confusão ---------------------
    if (diorama && rays && imagePlane && opticsGroup) {
      const opticsOffset = opticsGroup.position.x;
      const rearPrincipalX = opticsOffset + lensMm(lens.length + lens.rearPrincipal);
      // A mesma distância do sensor que os raios usam vale para o desfoque do vale.
      plateMm = (imagePlaneX - rearPrincipalX) / lensMm(1);

      // Os pontos do diorama estão no espaço do próprio diorama; os raios
      // vivem no espaço do experimento, então sobem pelo deslocamento da
      // bandeja antes de entrar na conta.
      // Só os objetos marcados no painel emitem raios (e ganham anel).
      const subjects = diorama.subjects
        .filter((subject) => state.rays[subject.id])
        .map((subject) => ({
          ...subject,
          samplePoint: subject.samplePoint.clone().setY(subject.samplePoint.y - DIORAMA_DROP),
        }));

      fanInputs = [
        subjects,
        { focalLength: state.focalLength, fNumber: state.fNumber, spin: raySpin },
        {
          // O feixe entra no primeiro vértice e sai pelo plano principal
          // traseiro: é desse plano que a lente fina mede v, e só assim o
          // cone na placa mede exatamente o b(d) do motor (ver ray-fans.ts).
          entrancePupilX: opticsOffset,
          exitPupilX: rearPrincipalX,
          projectionCenterX: SENSOR_CAMERA_X,
          rearPrincipalX,
          imagePlaneX,
        },
      ];
      const { paths, images } = buildRayFans(...fanInputs);

      rays.setPaths(paths);

      consoleScreens?.setState({
        focalLength: state.focalLength,
        fNumber: state.fNumber,
        focusDistance: state.focusDistance,
        sensor: state.sensor,
        homePlateMm: HOME_PLATE_MM,
        aberrationMm: aberrationSpotDiameter(state.lens, state.fNumber),
      });
      // Anéis só onde há imagem real: o disco da divergente passa do sensor.
      imagePlane.setRings(
        images.filter((image) => image.side !== 'virtual').map((image) => ({
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

      // A boca da carcaça é a abertura em f/2: aberto, o diafragma some; fechando,
      // as lâminas avançam para dentro dela.
      iris = createIris(DEFAULT_IRIS, {
        materials: ctx.materials,
        innerRadiusMm: stopSemiDiameter(2) * 1.04,
        outerRadiusMm: clearSemiDiameterMm + 3,
      });
      geometries.push(...iris.geometries);
      materials.push(...iris.materials);
      opticsGroup.add(iris.group);
      for (const object of iris.glowing) ctx.addGlow(object);

      buildLensElements(store.get().lens);
      root.add(opticsGroup);

      // --- Barril e anéis ---------------------------------------------------
      barrel = createBarrel(ctx.materials, {
        clearSemiDiameter: clearSemiDiameterMm,
        opticalLengthMm: lengthMm,
      });
      geometries.push(...barrel.geometries);
      materials.push(...barrel.materials);
      root.add(barrel.group);

      // --- Montagem no trilho ----------------------------------------------
      const carriage = ctx.bench.mountAt(LENS_RAIL_MM);
      // O carrinho é do experimento: sai do trilho quando ele é desmontado
      // (troca de bancada, ADR 0008), senão sobraria um carrinho vazio.
      disposers.push(() => carriage.group.removeFromParent());
      addNameplate(carriage.group, ctx);
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

      // --- Equação das lentes no tampo ----------------------------------------
      // Placa em pé na ponta direita do tampo, depois do vidro da imagem: é o
      // único trecho livre (o vidro ampliado ocupa o tampo de frente a fundo,
      // e a bandeja do vale, a frente à esquerda). Virada para a câmera.
      const plateSize = { width: 0.48, height: 0.56 };
      const equation = createEquationPlate({ spec: LENS_EQUATION_PLATE, ...plateSize });
      const stand = new THREE.Group();
      stand.name = 'lens-equation';
      equation.mesh.position.y = 0.05 + plateSize.height / 2;
      stand.add(equation.mesh);
      const footGeometry = new THREE.BoxGeometry(plateSize.width * 0.7, 0.05, 0.12).translate(0, 0.025, 0);
      geometries.push(footGeometry);
      const foot = new THREE.Mesh(footGeometry, ctx.materials.anodizedAluminum);
      foot.castShadow = true;
      stand.add(foot);
      // No canto da frente: na vista padrão a placa cai inteira à direita do
      // vidro, sem cobrir a imagem.
      stand.position.set(ctx.bench.width / 2 - plateSize.width / 2 - 0.05, ctx.bench.topY, ctx.bench.frontZ - 0.15);
      stand.rotation.y = -0.15;
      ctx.bench.group.add(stand);
      disposers.push(() => {
        stand.removeFromParent();
        equation.dispose();
      });

      // --- Desfoque do vale pela objetiva ----------------------------------------
      // O que está longe do plano de foco borra na própria cena (scene-blur.ts).
      if (ctx.addScreenPass) {
        const pass = new DioramaBlurPass({
          xMin: -(DIORAMA_DEPTH.gapScene + DIORAMA_DEPTH.spanScene + 0.06),
          xMax: -(DIORAMA_DEPTH.gapScene - 0.06),
          yMin: -0.08,
          yMax: SKY_HEIGHT,
          halfWidth: TRAY_WIDTH / 2 + 0.32,
        });
        sceneBlur = pass;
        disposers.push(ctx.addScreenPass(pass), () => {
          sceneBlur = null;
        });
      }

      // Luz dourada: na referência, os metais da objetiva refletem uma luz
      // quente forte. A luz principal esquenta e o recorte de trás fica âmbar;
      // ao sair da bancada, a sala volta ao tom padrão.
      ctx.room.setAccent({
        key: { color: 0xffcf96, intensity: 3.8 },
        rim: { color: 0xff9640, intensity: 3.2 },
      });
      disposers.push(() => ctx.room.setAccent(null));

      // Fileira de LEDs âmbar na frente do trilho, como na referência: uma
      // malha instanciada só, com bloom.
      {
        const dots = 46;
        const dotGeometry = new THREE.SphereGeometry(0.0055, 10, 6);
        geometries.push(dotGeometry);
        const ledMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb35a).multiplyScalar(2.2), toneMapped: false });
        materials.push(ledMaterial);
        const leds = new THREE.InstancedMesh(dotGeometry, ledMaterial, dots);
        leds.name = 'rail-leds';
        const span = ctx.bench.width - 0.3;
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < dots; i += 1) {
          matrix.makeTranslation(-span / 2 + (span * i) / (dots - 1), ctx.bench.topY + 0.004, ctx.bench.frontZ - 0.075);
          leds.setMatrixAt(i, matrix);
        }
        leds.instanceMatrix.needsUpdate = true;
        leds.frustumCulled = false;
        ctx.bench.group.add(leds);
        ctx.addGlow(leds);
        disposers.push(() => leds.removeFromParent());
      }

      // Brilho âmbar no diafragma, como o da referência: uma luz quente de
      // alcance curto dentro da objetiva, que tinge as bordas dos vidros
      // vizinhos. Também emprestada da sala (o número de luzes não muda).
      ember = ctx.room.borrowPointLight();
      if (ember) {
        ember.color.setHex(0xff8a2a);
        ember.intensity = 0.9;
        ember.distance = 0.55;
        ember.decay = 2;
        const borrowed = ember;
        disposers.push(() => {
          ctx.room.returnPointLight(borrowed);
          ember = null;
        });
      }

      // Lâmpada da cabana: luz quente de alcance curto, emprestada da sala.
      const lamp = ctx.room.borrowPointLight();
      if (lamp) {
        lamp.color.setHex(PALETTE.warm);
        lamp.intensity = 0.12;
        lamp.distance = 0.6;
        lamp.decay = 2;
        root.updateWorldMatrix(true, true);
        diorama.lampAnchor.getWorldPosition(lamp.position);
        lamp.parent?.worldToLocal(lamp.position);
        disposers.push(() => ctx.room.returnPointLight(lamp));
      }

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
        raySpinEnabled = !reducedMotion.matches;
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
        locale,
        onPickFocus: (millimeters) => store.set({ focusDistance: millimeters }),
        onPickAperture: (fNumber) => store.set({ fNumber }),
      });
      for (const object of consoleScreens.glowing) ctx.addGlow(object);
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
        ctx.onKey('l', () => {
          const current = LENS_IDS.indexOf(store.get().lens);
          const next = LENS_IDS[(current + 1) % LENS_IDS.length]!;
          store.set({ lens: next, focalLength: lensFacts(next).efl });
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
      // Giro lento dos raios: só refaz o desenho, sem mexer no resto.
      if (raySpinEnabled && fanInputs && rays) {
        raySpin = (raySpin + (dt * Math.PI * 2) / RAY_SPIN_PERIOD) % (Math.PI * 2);
        const [subjects, fanState, geometry] = fanInputs;
        rays.setPaths(buildRayFans(subjects, { ...fanState, spin: raySpin }, geometry).paths);
      }
      rays?.update(dt);
      focusPlane?.update(elapsed);
      if (sceneBlur && diorama && context) {
        const state = store.get();
        sceneBlur.update({
          camera: context.camera,
          dioramaMatrixWorld: diorama.group.matrixWorld,
          focalLength: state.focalLength,
          fNumber: state.fNumber,
          plateDistance: plateMm,
        });
      }

      // A imagem no sensor só é recalculada quando algo muda: é um render da
      // cena inteira a mais por vez, o item mais caro desta fase.
      if (context) consoleScreens?.render(context.renderer, context.scene);

      if (explodeProgress === explodeTarget && !explodeDirty) return;
      explodeDirty = false;

      const step = dt / EXPLODE_SECONDS;
      explodeProgress =
        explodeTarget > explodeProgress
          ? Math.min(explodeTarget, explodeProgress + step)
          : Math.max(explodeTarget, explodeProgress - step);

      // easeInOutCubic: sai e chega sem solavanco (SPEC §6.3).
      const t = explodeProgress;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

      // Centro do conjunto montado, em mm a partir do primeiro vértice da
      // objetiva atual.
      const center = lens.length / 2;
      const lerp = (from: number, to: number): number => from + eased * (to - from);

      elements.forEach((element, index) => {
        const order = index - (elements.length - 1) / 2;
        const target = center + order * EXPLODE_SPREAD_MM;
        element.group.position.x = lensMm(lerp(element.centerMm, target));

        // A haste cresce do trilho até a borda de baixo do vidro conforme
        // explode: segura a lente pela base, não atravessa o vidro.
        const top = -element.radius;
        posts?.place(index, element.group.position.x, eased * (axisHeight - element.radius), top);
      });
      if (posts) posts.mesh.visible = eased > 0.01;

      if (iris) {
        iris.group.position.x = lensMm(lerp(lensStopZMm, center));
      }

      if (barrel) {
        // O barril e o forro somem: é o que deixa os elementos à vista.
        const shellScale = 1 - eased;
        barrel.shell.visible = shellScale > 0.02;
        barrel.liner.visible = barrel.shell.visible;
        barrel.shell.scale.set(1, Math.max(shellScale, 0.001), Math.max(shellScale, 0.001));
        barrel.liner.scale.copy(barrel.shell.scale);

        // Os anéis vão para as pontas, cada um no seu suporte.
        // Meia abertura mínima: com um vidro só (lente simples), os anéis
        // ainda se afastam o bastante para não esconder o elemento.
        const span = Math.max(((elements.length - 1) / 2) * EXPLODE_SPREAD_MM, 20);
        // O anel de foco vai para a frente e o flange vai para trás.
        const gap = EXPLODE_RING_GAP_MM;
        // O barril vive no grupo do experimento, medido do vértice do Gauss
        // duplo; a objetiva atual pode estar deslocada dali (ADR 0007).
        const base = lensBaseX(lens) / lensMm(1);
        barrel.focusRing.position.x = lensMm(
          lerp(barrel.restMm.focusRing, base + center - span - gap.focus),
        );
        barrel.flange.position.x = lensMm(lerp(barrel.restMm.flange, base + center + span + gap.flange));
        barrel.sync();
      }
      placeEmber();

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
        case 'rays.foreground':
        case 'rays.midground':
        case 'rays.background': {
          const subject = id.slice('rays.'.length) as RaySubject;
          store.set({ rays: { ...store.get().rays, [subject]: Boolean(value) } });
          break;
        }
        case 'lens': {
          const id = (LENS_IDS as readonly string[]).includes(String(value))
            ? (value as LensId)
            : 'double-gauss';
          store.set({ lens: id, focalLength: lensFacts(id).efl });
          break;
        }
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
        case 'lens':
          return state.lens;
        case 'rays.foreground':
        case 'rays.midground':
        case 'rays.background':
          return state.rays[id.slice('rays.'.length) as RaySubject];
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
      // Sem imagem real não há foco nem zona nítida para mostrar.
      const zone = !lens.converging
        ? '—'
        : Number.isFinite(dof.total)
          ? formatCentimeters(dof.total, locale)
          : '∞';
      const described = {
        focalLength: state.focalLength,
        fNumber: state.fNumber,
        focusDistance: state.focusDistance,
        coc: state.coc,
        aberrationSpot: aberrationSpotDiameter(state.lens, state.fNumber),
        homePlate: HOME_PLATE_MM,
      };

      return {
        title: copy.title[locale],
        subtitle: copy.subtitle[locale],
        chips: [
          {
            id: 'focus',
            label: locale === 'en' ? 'Focus' : 'Foco',
            value: lens.converging ? formatDistance(state.focusDistance, locale) : '—',
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

      const dash = '—';
      const real = lens.converging;
      const lensNames: Record<LensId, string> = en
        ? { 'double-gauss': 'Double Gauss, 6 elements', biconvex: 'Simple biconvex', biconcave: 'Simple biconcave' }
        : { 'double-gauss': 'Gauss duplo, 6 elementos', biconvex: 'Biconvexa simples', biconcave: 'Bicôncava simples' };

      return [
        {
          id: 'objective',
          label: en ? 'Objective' : 'Objetiva',
          value: lensNames[state.lens],
        },
        {
          id: 'efl',
          label: en ? 'Focal length f' : 'Distância focal f',
          value: formatMillimeters(lens.efl, locale),
          hint: en ? 'Negative: diverging lens' : 'Negativa: lente divergente',
        },
        {
          id: 'aberration',
          label: en ? 'Spherical aberration (disc)' : 'Aberração esférica (disco)',
          value: real ? formatMillimeters(aberrationSpotDiameter(state.lens, state.fNumber), locale) : dash,
          hint: en ? 'Smallest blur of a point at best focus' : 'Menor borrão de um ponto no melhor foco',
        },
        {
          id: 'v',
          label: en ? 'Image distance v' : 'Distância da imagem v',
          value: formatMillimeters(imageDistance(f, s), locale),
          hint: real ? 'v = f·u / (u − f)' : en ? 'Negative: virtual image' : 'Negativa: imagem virtual',
        },
        {
          id: 'extension',
          label: en ? 'Focus extension' : 'Extensão do foco',
          value: formatMillimeters(ringExtension(f, s, HOME_PLATE_MM), locale),
          hint: 'e = v − f',
        },
        {
          id: 'hyperfocal',
          label: en ? 'Hyperfocal' : 'Hiperfocal',
          value: real ? formatDistance(hyperfocal(f, state.fNumber, state.coc), locale) : dash,
          hint: 'H = f² / (N·c) + f',
        },
        {
          id: 'near',
          label: en ? 'Near limit' : 'Limite próximo',
          value: real ? formatDistance(dof.near, locale) : dash,
        },
        {
          id: 'far',
          label: en ? 'Far limit' : 'Limite distante',
          value: real ? formatDistance(dof.far, locale) : dash,
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
          value: `f/${formatNumber(widestFNumber(lens.prescription), 2, locale)}`,
        },
      ];
    },

    ui(): PanelSchema {
      const en = locale === 'en';
      return {
        // No desktop o painel abre minimizado: a bancada da lente é larga e
        // o cartão cobria a imagem no vidro.
        startCollapsed: true,
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
            id: 'objective',
            label: { 'pt-BR': 'Objetiva', en: 'Objective' },
            hint: { 'pt-BR': 'L', en: 'L' },
            controls: [
              {
                kind: 'segmented',
                id: 'lens',
                label: { 'pt-BR': 'Objetiva', en: 'Objective' },
                options: [
                  { value: 'double-gauss', label: en ? 'Double Gauss' : 'Gauss duplo' },
                  { value: 'biconvex', label: en ? 'Converging' : 'Convergente' },
                  { value: 'biconcave', label: en ? 'Diverging' : 'Divergente' },
                ],
              },
              {
                kind: 'segmented',
                id: 'lensMode',
                label: { 'pt-BR': 'Lente · X', en: 'Lens · X' },
                options: [
                  { value: 'assembled', label: en ? 'Assembled' : 'Montada' },
                  { value: 'exploded', label: en ? 'Exploded' : 'Explodida' },
                ],
                // No celular cede o lugar ao seletor de objetiva (tecla X).
                secondary: true,
              },
            ],
          },          {
            id: 'rays',
            label: { 'pt-BR': 'Raios', en: 'Rays' },
            controls: [
              {
                kind: 'checkboxes',
                id: 'rays',
                label: { 'pt-BR': 'Raios', en: 'Rays' },
                options: RAY_SUBJECTS.map((subject) => ({
                  value: subject,
                  label: {
                    foreground: en ? 'Pine' : 'Pinheiro',
                    midground: en ? 'Cabin' : 'Cabana',
                    background: en ? 'Peak' : 'Pico',
                  }[subject],
                  // A cor do leque de cada objeto (SPEC §6.5).
                  tone: ({ foreground: 'focus', midground: 'warm', background: 'cool' } as const)[subject],
                })),
                // No celular fica em "Mais ajustes", para a gaveta não crescer.
                secondary: true,
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
          // vale, objetiva, placa e console cabem entre o HUD e a alça da
          // gaveta, que começa recolhida.
          portrait: {
            position: { x: origin.x + 1.784, y: origin.y + 0.896, z: origin.z + 3.4 },
            target: { x: origin.x - 0.066, y: origin.y - 0.234, z: origin.z },
            fov: 60,
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
      for (const geometry of lensGeometries) geometry.dispose();
      for (const material of lensMaterials) material.dispose();
      geometries.length = 0;
      materials.length = 0;
      lensGeometries.length = 0;
      lensMaterials.length = 0;

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
