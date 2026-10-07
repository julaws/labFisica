import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { EARTH_RADIUS } from '../../optics/mechanics/rocket';
import type { MaterialLibrary } from '../../scene/materials';

/**
 * A janela atrás do foguete (ADR 0020): o céu visto da altitude do voo.
 *
 * Um shader num painel em pé desenha o que se veria olhando na horizontal:
 * no chão, o céu azul e o horizonte reto; subindo, o azul escurece (o ar fica
 * rarefeito, ρ ∝ e^(−h/H)), aparecem as estrelas e o horizonte desce e se
 * curva. A depressão do horizonte é a de verdade, acos(R/(R + h)), num campo
 * de 70° de altura; a Terra é um disco de raio angular asin(R/(R + h)) em
 * volta do nadir.
 */

export interface SkyView {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  setAltitude(meters: number): void;
  update(elapsed: number): void;
  dispose(): void;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uAltitude;
uniform float uTime;
uniform float uAspect;
varying vec2 vUv;
const float PI = 3.141592653589793;
const float R = ${EARTH_RADIUS.toFixed(1)};
const float FOV = 70.0 * PI / 180.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 s = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), s.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), s.x), s.y);
}
float fbm(vec2 p) {
  float sum = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { sum += a * noise(p); p *= 2.07; a *= 0.5; }
  return sum;
}

void main() {
  float h = max(uAltitude, 0.0);
  float eps = h / R;
  // Direção de cada pixel numa câmera perspectiva olhando na horizontal
  // (campo vertical de 70°): o horizonte é reto no chão e, lá em cima, desce
  // e se curva como nas fotos tiradas do espaço.
  float t = tan(FOV / 2.0);
  vec3 d = normalize(vec3((vUv.x - 0.5) * 2.0 * t * uAspect, (vUv.y - 0.5) * 2.0 * t, -1.0));
  // Esfera de raio 1 (a Terra), observador em (0, 1 + h/R, 0).
  float b = (1.0 + eps) * d.y;
  float c = eps * (2.0 + eps);
  float disc = b * b - c;
  float space = smoothstep(15000.0, 90000.0, h);
  float dip = acos(1.0 / (1.0 + eps));
  // Ângulo do pixel acima do horizonte (negativo: abaixo).
  float above = asin(clamp(d.y, -1.0, 1.0)) + dip;

  vec3 color;
  if (disc > 0.0 && b < 0.0) {
    float s = -b - sqrt(disc);
    vec3 hit = vec3(0.0, 1.0 + eps, 0.0) + s * d;
    // Coordenadas na superfície (gnomônica a partir do ponto embaixo), em km.
    vec2 q = hit.xz / max(hit.y, 0.2) * R / 1000.0;
    float clouds = smoothstep(0.52, 0.78, fbm(q / 35.0 + vec2(uTime * 0.01, 0.0)));
    float land = smoothstep(0.55, 0.62, fbm(q / 220.0 + 4.0));
    vec3 ground = mix(vec3(0.04, 0.14, 0.33), vec3(0.14, 0.3, 0.16), land);
    color = mix(ground, vec3(0.92), clouds * 0.85);
    // Bruma: quanto mais ar no caminho (longe e baixo), mais azul-claro.
    float air = 1.0 - exp(-s * R / 40000.0 * exp(-h / 8500.0) - 0.15);
    color = mix(color, vec3(0.55, 0.72, 0.95), clamp(air, 0.0, 0.9));
    color *= 0.9;
  } else {
    // Céu: azul no chão, escurecendo com a altitude; fino brilho no limbo.
    vec3 day = mix(vec3(0.62, 0.79, 0.98), vec3(0.16, 0.38, 0.82), smoothstep(0.0, 0.7, above));
    vec3 sky = mix(day, vec3(0.0, 0.0, 0.02), space);
    sky += vec3(0.25, 0.5, 1.0) * exp(-max(above, 0.0) / 0.03) * (0.25 + 0.75 * space);
    vec2 cell = floor(vUv * vec2(220.0 * uAspect, 220.0));
    float star = step(0.985, hash(cell)) * hash(cell + 3.1);
    sky += vec3(star) * smoothstep(0.4, 1.0, space) * 1.4;
    color = sky;
  }
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSkyView(materials: MaterialLibrary, width: number, height: number): SkyView {
  const group = new THREE.Group();
  group.name = 'rocket-sky';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const glowing: THREE.Object3D[] = [];

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uAltitude: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: width / height },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  owned.push(material);
  const panelGeometry = new THREE.PlaneGeometry(width, height);
  geometries.push(panelGeometry);
  const panel = new THREE.Mesh(panelGeometry, material);
  panel.position.y = height / 2 + 0.06;
  group.add(panel);
  glowing.push(panel);

  const frame = mergeGeometries([
    new THREE.BoxGeometry(width + 0.05, 0.025, 0.04).translate(0, 0.06 - 0.0125, -0.01),
    new THREE.BoxGeometry(width + 0.05, 0.025, 0.04).translate(0, height + 0.06 + 0.0125, -0.01),
    new THREE.BoxGeometry(0.025, height + 0.05, 0.04).translate(-width / 2 - 0.0125, height / 2 + 0.06, -0.01),
    new THREE.BoxGeometry(0.025, height + 0.05, 0.04).translate(width / 2 + 0.0125, height / 2 + 0.06, -0.01),
    new THREE.BoxGeometry(width * 0.5, 0.06, 0.2).translate(0, 0.03, -0.05),
  ]);
  if (!frame) throw new Error('Falha ao montar a janela do céu');
  geometries.push(frame);
  const frameMesh = new THREE.Mesh(frame, materials.darkSteel);
  frameMesh.castShadow = true;
  group.add(frameMesh);

  return {
    group,
    glowing,
    setAltitude(meters: number): void {
      material.uniforms.uAltitude!.value = meters;
    },
    update(elapsed: number): void {
      material.uniforms.uTime!.value = elapsed;
    },
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
