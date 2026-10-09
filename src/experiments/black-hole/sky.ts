import * as THREE from 'three';

/**
 * Céu de fundo do buraco negro (ADR 0017): mapa equirretangular desenhado uma
 * vez na placa de vídeo, com a faixa da Via Láctea (bojo, nuvens e faixas de
 * poeira escura) e estrelas de cores e brilhos variados. Procedural, sem
 * imagem de terceiros.
 *
 * As estrelas são sorteadas numa grade 3D de direções (não na grade da
 * imagem), então não se acumulam nos polos. Cada uma é um borrão gaussiano
 * de pouco mais de um texel; o mipmap cuida da filtragem quando a lente
 * gravitacional comprime o céu.
 */

const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SKY_FRAGMENT = /* glsl */ `
varying vec2 vUv;
const float PI = 3.141592653589793;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 s = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1, 0, 0));
  float n010 = hash13(i + vec3(0, 1, 0));
  float n110 = hash13(i + vec3(1, 1, 0));
  float n001 = hash13(i + vec3(0, 0, 1));
  float n101 = hash13(i + vec3(1, 0, 1));
  float n011 = hash13(i + vec3(0, 1, 1));
  float n111 = hash13(i + vec3(1, 1, 1));
  return mix(
    mix(mix(n000, n100, s.x), mix(n010, n110, s.x), s.y),
    mix(mix(n001, n101, s.x), mix(n011, n111, s.x), s.y),
    s.z
  );
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amplitude * noise3(p);
    p = p * 2.03 + 11.7;
    amplitude *= 0.5;
  }
  return sum;
}

vec3 starColor(float t) {
  // Do vermelho-alaranjado ao azul, passando pelo branco.
  if (t < 0.15) return vec3(1.0, 0.72, 0.5);
  if (t < 0.4) return vec3(1.0, 0.9, 0.78);
  if (t < 0.8) return vec3(1.0, 1.0, 1.0);
  return vec3(0.72, 0.82, 1.0);
}

uniform float uTexel;
// 0: Via Láctea e véu; 1: só as estrelas (camadas separadas, ver tracer.ts).
uniform float uLayer;

vec3 starLayer(vec3 d, float cells, float density, float sigma, float gain) {
  vec3 cell = floor(d * cells);
  vec3 r = hash33(cell);
  if (r.x > density) return vec3(0.0);
  // Centro sorteado longe da borda da célula: o borrão não é cortado.
  vec3 center = normalize((cell + 0.3 + 0.4 * hash33(cell + 17.0)) / cells);
  float angle = acos(clamp(dot(d, center), -1.0, 1.0));
  float brightness = pow(r.y, 5.0) * gain + 0.12;
  return starColor(r.z) * brightness * exp(-pow(angle / sigma, 2.0));
}

void main() {
  float lon = (vUv.x - 0.5) * 2.0 * PI;
  float lat = (vUv.y - 0.5) * PI;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));

  // Via Láctea: uma faixa inclinada, com o bojo numa direção e poeira escura.
  vec3 pole = normalize(vec3(0.42, 0.82, -0.39));
  vec3 core = normalize(cross(pole, vec3(0.0, 0.0, 1.0)));
  float b = asin(clamp(dot(d, pole), -1.0, 1.0));
  float band = exp(-pow(b / 0.2, 2.0));
  float bulge = exp(-pow(acos(clamp(dot(d, core), -1.0, 1.0)) / 0.55, 2.0));
  float clouds = fbm(d * 5.0);
  float dust = smoothstep(0.42, 0.72, fbm(d * 11.0 + 3.0)) * exp(-pow(b / 0.06, 2.0));
  float glow = band * (0.35 + 0.9 * clouds) * (1.0 - 0.85 * dust) + bulge * 0.8 * (1.0 - 0.7 * dust);
  vec3 milky = glow * mix(vec3(0.5, 0.58, 0.85), vec3(1.0, 0.84, 0.64), bulge + 0.3 * clouds) * 0.055;
  // Um véu de estrelas fracas, mais denso na faixa.
  vec3 haze = vec3(0.6, 0.65, 0.8) * 0.003 * (0.4 + band);

  // Tamanhos medidos em texels: as estrelas ficam nítidas em qualquer resolução.
  vec3 stars = starLayer(d, 1.0 / (7.0 * uTexel), 0.35 + 0.3 * band, 0.75 * uTexel, 3.0)
             + starLayer(d, 1.0 / (16.0 * uTexel), 0.3, 1.0 * uTexel, 8.0)
             + starLayer(d, 1.0 / (4.5 * uTexel), 0.12 + 0.45 * band, 0.6 * uTexel, 1.0);

  gl_FragColor = vec4(uLayer < 0.5 ? milky + haze : stars, 1.0);
}
`;

export interface Sky {
  /** Via Láctea e o véu de estrelas fracas. */
  readonly texture: THREE.Texture;
  /**
   * As estrelas, numa textura à parte: onde o monitor tem resolução, o
   * traçador as troca por estrelas pontuais calculadas no próprio raio.
   */
  readonly stars: THREE.Texture;
  dispose(): void;
}

/** Desenha o céu num render target equirretangular (2:1), uma vez. */
export function createSky(renderer: THREE.WebGLRenderer, width: number): Sky {
  const makeTarget = (): THREE.WebGLRenderTarget =>
    new THREE.WebGLRenderTarget(width, width / 2, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
    });
  const milky = makeTarget();
  const stars = makeTarget();
  const material = new THREE.ShaderMaterial({
    uniforms: { uTexel: { value: (2 * Math.PI) / width }, uLayer: { value: 0 } },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const previous = renderer.getRenderTarget();
  for (const [layer, target] of [
    [0, milky],
    [1, stars],
  ] as const) {
    material.uniforms.uLayer!.value = layer;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }
  renderer.setRenderTarget(previous);
  geometry.dispose();
  material.dispose();

  return {
    texture: milky.texture,
    stars: stars.texture,
    dispose(): void {
      milky.dispose();
      stars.dispose();
    },
  };
}
