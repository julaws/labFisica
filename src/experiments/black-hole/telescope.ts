import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HardwareKit, disposeGroup, groupGeometries, indicatorLed, monitorStand, opticalPost, pose, screenBezel } from '../../scene/hardware';
import type { MaterialLibrary } from '../../scene/materials';
import { TRACER_CHUNK, type TracerUniforms } from './tracer';

/**
 * O telescópio (ADR 0017): um monitor na bancada mostra o que um observador
 * parado a uma distância r do buraco negro veria, olhando direto para ele, com
 * o disco inclinado de `inclination` em relação à linha de visada. É aqui que
 * a estrela de fundo se alinha e o anel de Einstein aparece.
 *
 * A imagem é traçada pelo mesmo GLSL da esfera, num render target, uma vez
 * por quadro (o disco gira). Na visão didática, círculos marcam a borda da
 * sombra, o anel de Einstein exato e o de campo fraco (tracejado); a legenda
 * fica numa faixa de canvas embaixo da tela.
 */

export interface TelescopeView {
  /** Distância do observador ao centro, M. */
  readonly distance: number;
  /** Ângulo do observador acima do plano do disco, rad. */
  readonly inclination: number;
  /** Campo de visão vertical, rad. */
  readonly fov: number;
  /** Raios angulares dos círculos didáticos, rad (negativo esconde). */
  readonly shadow: number;
  readonly ring: number;
  readonly ringWeak: number;
  readonly didactic: boolean;
}

export interface Telescope {
  readonly group: THREE.Group;
  /** A tela, para etiqueta e câmera. */
  readonly screen: THREE.Mesh;
  readonly glowing: THREE.Object3D[];
  setView(view: TelescopeView): void;
  setLegend(lines: readonly { color: string; text: string; dashed?: boolean }[], title: string): void;
  setResolution(width: number): void;
  setSteps(steps: number): void;
  render(renderer: THREE.WebGLRenderer): void;
  dispose(): void;
}

export interface TelescopeOptions {
  readonly materials: MaterialLibrary;
  readonly uniforms: TracerUniforms;
  readonly steps: number;
  readonly width: number;
}

/** Tela 16:9, m de cena. */
export const SCREEN_WIDTH = 0.96;
export const SCREEN_HEIGHT = SCREEN_WIDTH * (9 / 16);

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
${TRACER_CHUNK}
uniform vec3 uObserver;
uniform vec3 uForward;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec2 uHalf;
uniform vec3 uCircles;
uniform float uDidactic;
varying vec2 vUv;

float circleLine(float angle, float radius, float width, float dashed, float around) {
  if (radius <= 0.0) return 0.0;
  float line = 1.0 - smoothstep(0.0, width, abs(angle - radius));
  if (dashed > 0.5) line *= step(0.5, fract(around * 12.0 / PI));
  return line;
}

void main() {
  vec2 p = (vUv * 2.0 - 1.0) * uHalf;
  vec3 D = normalize(uForward + p.x * uRight + p.y * uUp);
  TraceResult hit = traceSchwarzschild(uObserver, D);
  vec3 color = shadeTrace(hit);
  if (uDidactic > 0.5) {
    float angle = acos(clamp(dot(D, uForward), -1.0, 1.0));
    float around = atan(dot(D, uUp), dot(D, uRight));
    float width = fwidth(angle) * 1.6;
    color = mix(color, vec3(0.5, 0.89, 1.0) * 1.6, circleLine(angle, uCircles.x, width, 0.0, around));
    color = mix(color, vec3(1.0, 0.83, 0.42) * 1.8, circleLine(angle, uCircles.y, width, 0.0, around));
    color = mix(color, vec3(1.0, 0.83, 0.42) * 1.2, 0.8 * circleLine(angle, uCircles.z, width, 1.0, around));
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

export function createTelescope({ materials, uniforms, steps, width }: TelescopeOptions): Telescope {
  const group = new THREE.Group();
  group.name = 'black-hole-telescope';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture | THREE.WebGLRenderTarget)[] = [];
  const glowing: THREE.Object3D[] = [];

  // --- Render target e o passe do traçado ----------------------------------
  const target = new THREE.WebGLRenderTarget(width, Math.round((width * 9) / 16), {
    type: THREE.HalfFloatType,
    depthBuffer: false,
  });
  owned.push(target);
  const viewUniforms = {
    ...uniforms,
    uObserver: { value: new THREE.Vector3(0, 0, 30) },
    uForward: { value: new THREE.Vector3(0, 0, -1) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uHalf: { value: new THREE.Vector2(1, 1) },
    uCircles: { value: new THREE.Vector3(-1, -1, -1) },
    uDidactic: { value: 0 },
  };
  const passMaterial = new THREE.ShaderMaterial({
    defines: { TRACE_STEPS: steps },
    uniforms: viewUniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  owned.push(passMaterial);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  geometries.push(quadGeometry);
  const quad = new THREE.Mesh(quadGeometry, passMaterial);
  quad.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(quad);
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // --- O monitor ------------------------------------------------------------------
  const screenMaterial = new THREE.MeshBasicMaterial({ map: target.texture, toneMapped: true });
  owned.push(screenMaterial);
  const screenGeometry = new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT);
  geometries.push(screenGeometry);
  const screen = new THREE.Mesh(screenGeometry, screenMaterial);
  screen.name = 'telescope-screen';
  const screenY = 0.5;
  screen.position.set(0, screenY, 0.022);
  group.add(screen);
  glowing.push(screen);

  // Faixa da legenda, embaixo da tela.
  const legendCanvas = document.createElement('canvas');
  legendCanvas.width = 2048;
  legendCanvas.height = 160;
  const legendContext = legendCanvas.getContext('2d');
  if (!legendContext) throw new Error('Canvas 2D indisponível para a legenda');
  const legendTexture = new THREE.CanvasTexture(legendCanvas);
  legendTexture.colorSpace = THREE.SRGBColorSpace;
  legendTexture.anisotropy = 8;
  owned.push(legendTexture);
  const legendMaterial = new THREE.MeshBasicMaterial({ map: legendTexture, toneMapped: false });
  owned.push(legendMaterial);
  const legendHeight = SCREEN_WIDTH * (160 / 2048);
  const legendGeometry = new THREE.PlaneGeometry(SCREEN_WIDTH, legendHeight);
  geometries.push(legendGeometry);
  const legend = new THREE.Mesh(legendGeometry, legendMaterial);
  legend.position.set(0, screenY - SCREEN_HEIGHT / 2 - legendHeight / 2 - 0.012, 0.022);
  group.add(legend);

  // Gabinete do monitor: caixa arredondada, moldura chanfrada em volta da
  // tela e da legenda, corcunda da eletrônica atrás, pé de monitor e LED.
  {
    const frameDepth = 0.035;
    const kit = new HardwareKit();
    const openHeight = SCREEN_HEIGHT + legendHeight + 0.012;
    const centerY = screenY - legendHeight / 2 - 0.006;
    kit.add('case', new RoundedBoxGeometry(SCREEN_WIDTH + 0.05, openHeight + 0.05, frameDepth, 3, 0.012).translate(0, centerY, 0));
    screenBezel(kit, pose(0, centerY, frameDepth / 2 - 0.002), { width: SCREEN_WIDTH, height: openHeight, border: 0.022, depth: 0.006 });
    kit.add('case', new RoundedBoxGeometry(SCREEN_WIDTH * 0.6, openHeight * 0.6, 0.035, 3, 0.012).translate(0, centerY + 0.01, -frameDepth / 2 - 0.014));
    monitorStand(kit, pose(0, 0, -0.06), { height: centerY - 0.02, baseWidth: 0.34, baseDepth: 0.2 });
    const housing = kit.build(materials, 'telescope-monitor');
    geometries.push(...groupGeometries(housing));
    group.add(housing);
    const led = indicatorLed(0x7fe3ff, 0.0035);
    led.position.set(SCREEN_WIDTH / 2 - 0.004, centerY - openHeight / 2 - 0.013, frameDepth / 2 + 0.004);
    geometries.push(led.geometry);
    owned.push(led.material as THREE.Material);
    group.add(led);
  }

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let dirty = true;

  function drawLegend(lines: readonly { color: string; text: string; dashed?: boolean }[], title: string): void {
    const ctx = legendContext!;
    const w = legendCanvas.width;
    const h = legendCanvas.height;
    ctx.fillStyle = '#0b1020';
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = 'middle';
    // Encolhe tudo se a legenda não couber na largura.
    ctx.font = '500 44px "DM Mono", ui-monospace, monospace';
    const needed =
      36 + 380 + lines.reduce((sum, line) => sum + 72 + ctx.measureText(line.text).width + 52, 0);
    const fit = Math.min(1, w / needed);
    ctx.save();
    ctx.scale(fit, 1);
    ctx.font = '600 50px Outfit, ui-sans-serif, sans-serif';
    ctx.fillStyle = '#e6eaf2';
    ctx.fillText(title, 36, h / 2);
    let x = 36 + ctx.measureText(title).width + 56;
    ctx.font = '500 44px "DM Mono", ui-monospace, monospace';
    for (const line of lines) {
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 8;
      ctx.setLineDash(line.dashed ? [14, 10] : []);
      ctx.beginPath();
      ctx.moveTo(x, h / 2);
      ctx.lineTo(x + 56, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      x += 72;
      ctx.fillStyle = '#cfd6e8';
      ctx.fillText(line.text, x, h / 2);
      x += ctx.measureText(line.text).width + 52;
    }
    ctx.restore();
    legendTexture.needsUpdate = true;
  }

  return {
    group,
    screen,
    glowing,

    setView(view: TelescopeView): void {
      // Observador acima do plano do disco, olhando para o centro.
      const position = new THREE.Vector3(0, Math.sin(view.inclination), Math.cos(view.inclination)).multiplyScalar(
        view.distance,
      );
      forward.copy(position).negate().normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
      up.crossVectors(right, forward).normalize();
      viewUniforms.uObserver.value.copy(position);
      viewUniforms.uForward.value.copy(forward);
      viewUniforms.uRight.value.copy(right);
      viewUniforms.uUp.value.copy(up);
      const halfY = Math.tan(view.fov / 2);
      viewUniforms.uHalf.value.set(halfY * (16 / 9), halfY);
      viewUniforms.uCircles.value.set(view.shadow, view.ring, view.ringWeak);
      viewUniforms.uDidactic.value = view.didactic ? 1 : 0;
      dirty = true;
    },

    setLegend(lines, title): void {
      drawLegend(lines, title);
    },

    setResolution(next: number): void {
      const height = Math.round((next * 9) / 16);
      if (target.width === next) return;
      target.setSize(next, height);
      dirty = true;
    },

    setSteps(count: number): void {
      if (passMaterial.defines['TRACE_STEPS'] === count) return;
      passMaterial.defines['TRACE_STEPS'] = count;
      passMaterial.needsUpdate = true;
      dirty = true;
    },

    render(renderer: THREE.WebGLRenderer): void {
      // O disco gira: com ele ligado, a imagem muda a cada quadro.
      if (!dirty && uniforms.uDisk.value < 0.5) return;
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(passScene, passCamera);
      renderer.setRenderTarget(previous);
      dirty = false;
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}

/**
 * O telescópio de verdade na bancada, mirando a esfera: refrator branco com
 * para-sol, anéis, barra dovetail, focalizador com botões e buscadora, sobre
 * uma cabeça alt-az num poste óptico. É só cenário (a imagem do monitor vem do
 * traçador), mas deixa claro de onde vem a "vista do telescópio".
 *
 * Origem no pé do poste, no tampo; o tubo aponta para `target` (no mesmo
 * referencial do pai do grupo, depois de posicionado).
 */
export function createScopeProp(materials: MaterialLibrary, axisHeight = 0.32): { group: THREE.Group; aim(target: THREE.Vector3): void; dispose(): void } {
  const group = new THREE.Group();
  group.name = 'telescope-prop';
  const mount = new THREE.Group();
  const ota = new THREE.Group();
  group.add(mount, ota);
  ota.position.y = axisHeight;
  let built: THREE.Group[] = [];

  // Tubo (OTA) no referencial dele: objetiva em +x, focalizador em −x.
  const otaKit = new HardwareKit();
  const r = 0.036;
  otaKit.add('ceramic', new THREE.CylinderGeometry(r, r, 0.3, 40).rotateZ(Math.PI / 2));
  otaKit.add('anodized', new THREE.CylinderGeometry(r * 1.18, r * 1.12, 0.1, 40, 1, true).rotateZ(Math.PI / 2).translate(0.19, 0, 0));
  otaKit.add('anodized', new THREE.TorusGeometry(r * 1.15, 0.004, 8, 40).rotateY(Math.PI / 2).translate(0.24, 0, 0));
  otaKit.add('chrome', new THREE.TorusGeometry(r * 0.98, 0.003, 8, 40).rotateY(Math.PI / 2).translate(0.15, 0, 0));
  otaKit.add('anodized', new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.004, 40).rotateZ(Math.PI / 2).translate(0.148, 0, 0));
  // Focalizador: corpo, tubo de saída, botões e ocular.
  otaKit.add('anodized', new THREE.CylinderGeometry(r * 0.9, r, 0.03, 32).rotateZ(Math.PI / 2).translate(-0.165, 0, 0));
  otaKit.add('chrome', new THREE.CylinderGeometry(0.017, 0.017, 0.06, 24).rotateZ(Math.PI / 2).translate(-0.21, 0, 0));
  otaKit.add('anodized', new THREE.CylinderGeometry(0.02, 0.016, 0.045, 24).rotateZ(Math.PI / 2).translate(-0.26, 0, 0));
  otaKit.add('anodized', new RoundedBoxGeometry(0.04, 0.025, 0.05, 2, 0.006).translate(-0.18, -r - 0.004, 0));
  for (const side of [-1, 1]) {
    otaKit.add('chrome', new THREE.CylinderGeometry(0.011, 0.011, 0.012, 20).rotateX(Math.PI / 2).translate(-0.18, -r - 0.008, side * 0.034));
  }
  // Anéis e barra dovetail.
  for (const x of [-0.07, 0.07]) {
    otaKit.add('anodized', new THREE.TorusGeometry(r + 0.004, 0.006, 8, 36).rotateY(Math.PI / 2).translate(x, 0, 0));
    otaKit.add('anodized', new RoundedBoxGeometry(0.018, 0.02, 0.022, 2, 0.004).translate(x, -r - 0.012, 0));
  }
  otaKit.add('anodized', new RoundedBoxGeometry(0.24, 0.012, 0.034, 2, 0.004).translate(0, -r - 0.026, 0));
  // Buscadora em cima.
  otaKit.add('anodized', new THREE.CylinderGeometry(0.011, 0.011, 0.12, 20).rotateZ(Math.PI / 2).translate(-0.02, r + 0.03, 0));
  for (const x of [-0.06, 0.02]) otaKit.add('anodized', new THREE.CylinderGeometry(0.004, 0.004, 0.022, 10).translate(x, r + 0.012, 0));
  const otaGroup = otaKit.build(materials, 'telescope-prop-ota');
  ota.add(otaGroup);

  // Montagem: cabeça alt-az num poste óptico com base.
  const mountKit = new HardwareKit();
  const headY = axisHeight - r - 0.032 - 0.03;
  opticalPost(mountKit, pose(0, 0, 0), { top: headY, holderHeight: 0.07, postRadius: 0.009 });
  mountKit.add('anodized', new RoundedBoxGeometry(0.06, 0.03, 0.05, 2, 0.008).translate(0, headY + 0.015, 0));
  mountKit.add('anodized', new RoundedBoxGeometry(0.05, 0.04, 0.012, 2, 0.004).translate(0, headY + 0.045, 0.02));
  mountKit.add('brass', new THREE.CylinderGeometry(0.009, 0.009, 0.014, 18).rotateX(Math.PI / 2).translate(0, headY + 0.05, 0.034));
  const mountGroup = mountKit.build(materials, 'telescope-prop-mount');
  mount.add(mountGroup);
  built = [otaGroup, mountGroup];

  const local = new THREE.Vector3();
  return {
    group,
    aim(target: THREE.Vector3): void {
      group.updateWorldMatrix(true, false);
      local.copy(target);
      group.worldToLocal(local);
      const dx = local.x;
      const dy = local.y - axisHeight;
      const dz = local.z;
      const yaw = Math.atan2(-dz, dx);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz));
      ota.rotation.set(0, yaw, pitch, 'YZX');
    },
    dispose(): void {
      for (const piece of built) disposeGroup(piece);
      group.clear();
    },
  };
}
