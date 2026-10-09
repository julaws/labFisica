import * as THREE from 'three';
import { ISCO_RADIUS } from '../../optics/gravity/schwarzschild';

/**
 * Traçador de geodésicas nulas na placa de vídeo (ADR 0017).
 *
 * A mesma equação do motor (`src/optics/gravity/schwarzschild.ts`), em GLSL:
 * cada pixel é um raio que sai do observador; o raio fica num plano pelo
 * centro, e nesse plano u = 1/r obedece a d²u/dφ² = −u + 3u² (unidades de M).
 * Runge–Kutta de 4ª ordem em φ, com o passo encolhendo perto do horizonte.
 *
 * O raio termina de três jeitos:
 * - cai no horizonte (u ≥ 1/2): preto;
 * - cruza o plano do disco de acreção entre r_ISCO = 6M e a borda de fora:
 *   soma a luz do disco, com o desvio g = √(1 − 3M/r)/(1 − Ωλ) (gravitacional,
 *   transversal e Doppler) e a temperatura de Shakura–Sunyaev; o disco é quase
 *   opaco e fica transparente na borda de fora;
 * - escapa (u volta a 0): a direção no infinito é a do céu de fundo e da
 *   estrela-fonte, e é calculada depois do laço, onde as derivadas de tela
 *   existem (filtragem do céu sem serrilhado).
 *
 * O desvio do observador (parado em r) também entra: g_obs = 1/√(1 − 2M/r).
 */

export const TRACER_CHUNK = /* glsl */ `
uniform sampler2D uSky;
uniform sampler2D uStars;
uniform float uSkyIntensity;
uniform vec3 uSource;
uniform float uSourceRadius;
uniform float uSourceIntensity;
uniform float uDisk;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskTime;
uniform float uDiskTemperature;
uniform float uDiskIntensity;
uniform float uStep;

const float PI = 3.141592653589793;

struct TraceResult {
  // 0: escapou; 1: caiu no horizonte.
  int kind;
  vec3 dir;
  vec3 light;
  float transmittance;
};

float bhHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float bhNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 s = f * f * (3.0 - 2.0 * f);
  float a = bhHash(i);
  float b = bhHash(i + vec2(1.0, 0.0));
  float c = bhHash(i + vec2(0.0, 1.0));
  float d = bhHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

// Cor de um corpo negro (aproximação de Tanner Helland), em RGB linear.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float r = t <= 66.0 ? 1.0 : clamp(1.292936 * pow(t - 60.0, -0.1332047592), 0.0, 1.0);
  float g = t <= 66.0
    ? clamp(0.39008157 * log(t) - 0.63184144, 0.0, 1.0)
    : clamp(1.129890861 * pow(t - 60.0, -0.0755148492), 0.0, 1.0);
  float b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54320679 * log(t - 10.0) - 1.19625409, 0.0, 1.0));
  return pow(vec3(r, g, b), vec3(2.2));
}

// Perfil de Shakura–Sunyaev normalizado (máximo 1 em 49/36·r_in).
float diskShape(float r) {
  if (r <= uDiskInner) return 0.0;
  float shape = pow(r, -0.75) * pow(1.0 - sqrt(uDiskInner / r), 0.25);
  float rp = 49.0 / 36.0 * uDiskInner;
  float peak = pow(rp, -0.75) * pow(1.0 - sqrt(uDiskInner / rp), 0.25);
  return shape / peak;
}

// Turbulência do gás, girando com a velocidade kepleriana de cada raio:
// a rotação diferencial enrola o desenho em espirais.
float diskPattern(float r, float angle) {
  float a = angle - pow(r, -1.5) * uDiskTime;
  vec2 q = vec2(cos(a), sin(a)) * r;
  float n = 0.5 * bhNoise(q * 1.1) + 0.3 * bhNoise(q * 2.7 + 7.0) + 0.2 * bhNoise(vec2(r * 3.0, 1.7));
  return 0.45 + 1.1 * n;
}

vec2 bhAccel(vec2 s) {
  return vec2(s.y, -s.x + 3.0 * s.x * s.x);
}

TraceResult traceSchwarzschild(vec3 P, vec3 D) {
  TraceResult result;
  result.kind = 1;
  result.dir = D;
  result.light = vec3(0.0);
  result.transmittance = 1.0;

  float r0 = length(P);
  vec3 e1 = P / r0;
  vec3 n = cross(e1, D);
  float sinPsi = length(n);
  if (sinPsi < 1e-7) {
    // Raio radial: para dentro cai, para fora segue reto.
    if (dot(D, e1) > 0.0) result.kind = 0;
    return result;
  }
  n /= sinPsi;
  vec3 e2 = cross(n, e1);

  float u = 1.0 / r0;
  float b = r0 * sinPsi / sqrt(max(1.0 - 2.0 * u, 1e-6));
  float w = sqrt(max(0.0, 1.0 / (b * b) - u * u * (1.0 - 2.0 * u)));
  if (dot(D, e1) > 0.0) w = -w;
  // Momento angular do fóton (o de verdade vai no sentido contrário ao
  // traçado) projetado no eixo do disco: λ = L_z/E.
  float lambda = -b * n.y;
  float gObserver = 1.0 / sqrt(max(1.0 - 2.0 * u, 1e-4));

  float phi = 0.0;
  vec2 s = vec2(u, w);
  float height = e1.y;

  for (int i = 0; i < TRACE_STEPS; i++) {
    float h = uStep / (1.0 + 8.0 * s.x);
    vec2 k1 = bhAccel(s);
    vec2 k2 = bhAccel(s + 0.5 * h * k1);
    vec2 k3 = bhAccel(s + 0.5 * h * k2);
    vec2 k4 = bhAccel(s + h * k3);
    vec2 next = s + h / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
    float nextPhi = phi + h;

    if (next.x >= 0.5) {
      result.kind = 1;
      return result;
    }

    // Cruzou o plano do disco (y = 0)?
    float nextHeight = cos(nextPhi) * e1.y + sin(nextPhi) * e2.y;
    if (uDisk > 0.5 && height * nextHeight < 0.0) {
      float f = height / (height - nextHeight);
      float uc = mix(s.x, next.x, f);
      float rc = 1.0 / max(uc, 1e-6);
      if (rc > uDiskInner && rc < uDiskOuter) {
        float pc = mix(phi, nextPhi, f);
        vec3 where = cos(pc) * e1 + sin(pc) * e2;
        float angle = atan(where.z, where.x);
        float omega = pow(rc, -1.5);
        float g = gObserver * sqrt(1.0 - 3.0 / rc) / (1.0 - omega * lambda);
        float t = diskShape(rc);
        float alpha = smoothstep(uDiskOuter, uDiskOuter * 0.72, rc) * 0.96;
        vec3 color = blackbody(g * t * uDiskTemperature);
        float lum = pow(g * t, 4.0) * diskPattern(rc, angle) * uDiskIntensity;
        result.light += result.transmittance * alpha * color * lum;
        result.transmittance *= 1.0 - alpha;
        if (result.transmittance < 0.02) {
          result.kind = 1;
          return result;
        }
      }
    }
    height = nextHeight;

    if (next.x <= 0.0 && s.y < 0.0) {
      // Escapou: o φ em que u chega a zero dá a direção no infinito.
      float pe = phi + s.x / max(s.x - next.x, 1e-9) * h;
      result.kind = 0;
      result.dir = cos(pe) * e1 + sin(pe) * e2;
      return result;
    }
    s = next;
    phi = nextPhi;
  }
  // Voltas demais em torno da esfera de fótons.
  result.kind = 1;
  return result;
}

vec2 skyUv(vec3 d) {
  return vec2(atan(d.z, d.x) / (2.0 * PI) + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5);
}

// Céu na direção d, filtrado pelas derivadas de tela da direção (sem
// serrilhado onde a lente estica ou comprime o céu).
vec3 skyColor(vec3 d, vec3 ddx, vec3 ddy) {
  vec2 uv = skyUv(d);
  vec2 gx = skyUv(normalize(d + ddx)) - uv;
  vec2 gy = skyUv(normalize(d + ddy)) - uv;
  gx.x -= floor(gx.x + 0.5);
  gy.x -= floor(gy.x + 0.5);
  gx = clamp(gx, vec2(-0.03), vec2(0.03));
  gy = clamp(gy, vec2(-0.03), vec2(0.03));
  return textureGrad(uSky, uv, gx, gy).rgb * uSkyIntensity;
}

// A estrela-fonte: um disquinho brilhante. Alinhada atrás do buraco negro,
// vira o anel de Einstein.
vec3 sourceStar(vec3 d) {
  float angle = acos(clamp(dot(d, uSource), -1.0, 1.0));
  float core = exp(-pow(angle / uSourceRadius, 2.0));
  float halo = exp(-angle / (uSourceRadius * 3.0)) * 0.02;
  return vec3(0.82, 0.9, 1.0) * (core + halo) * uSourceIntensity;
}

// --- Estrelas pontuais ---------------------------------------------------------
// Onde há resolução (o monitor do telescópio), as estrelas são calculadas aqui,
// na direção de fuga de cada raio, com o tamanho de um pixel: ficam pontos
// nítidos em qualquer aumento, em vez dos borrões do texel ampliado. Brilho em
// lei de potência (muitas fracas, poucas fortes), cor de corpo negro de 3 000
// a 25 000 K e, nas mais fortes, halo e a cruz de difração do telescópio
// (alinhada à tela pelas derivadas). Onde o céu fica comprimido (a esfera), as
// estrelas da textura assumem e estas somem, sem cintilar.

vec3 bhHash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

vec3 starTint(float t) {
  float kelvin = t < 0.55
    ? mix(3000.0, 5600.0, t / 0.55)
    : (t < 0.9 ? mix(5600.0, 8500.0, (t - 0.55) / 0.35) : mix(9500.0, 25000.0, (t - 0.9) / 0.1));
  vec3 c = blackbody(kelvin);
  c /= max(max(c.r, c.g), max(c.b, 1e-4));
  return mix(vec3(1.0), c, 0.7);
}

vec3 pointStarLayer(vec3 d, float cell, float density, float gain, float pix, vec3 ax, vec3 ay, float spikes) {
  vec3 id = floor(d / cell);
  vec3 r = bhHash33(id + vec3(cell * 977.0));
  if (r.x > density) return vec3(0.0);
  // Centro longe da borda da célula: halo e cruz não são cortados.
  vec3 center = normalize((id + 0.35 + 0.3 * bhHash33(id + vec3(17.0 + cell * 531.0))) * cell);
  vec3 off = d - center * dot(d, center);
  float rr = dot(off, off);
  float lum = gain * (0.07 + 0.25 * r.y * r.y + pow(r.y, 7.0));
  float sigma = 0.7 * pix;
  float light = exp(-rr / (sigma * sigma));
  float bright = smoothstep(0.2 * gain, gain, lum);
  if (bright > 0.0) {
    light += 0.1 * bright * exp(-sqrt(rr) / (1.4 * pix));
    float sx = dot(off, ax);
    float sy = dot(off, ay);
    float len = pix * (2.5 + 5.0 * bright);
    float w = 0.45 * pix;
    float spike = exp(-(sx * sx) / (len * len)) * exp(-(sy * sy) / (w * w))
                + exp(-(sy * sy) / (len * len)) * exp(-(sx * sx) / (w * w));
    light += spikes * 0.3 * bright * spike;
  }
  return starTint(r.z) * lum * light;
}

vec3 pointStars(vec3 d, vec3 ddx, vec3 ddy, out float weight) {
  float pix = max(max(length(ddx), length(ddy)), 1e-6);
  // Onde a lente estica o céu, o pixel cobre uma fatia fina de direções: a
  // cruz de difração (que é do telescópio, não do céu) sai só onde ele é
  // quase quadrado.
  float iso = clamp(length(cross(ddx, ddy)) / (pix * pix), 0.0, 1.0);
  float spikes = smoothstep(0.45, 0.8, iso);
  vec3 ax = ddx - d * dot(ddx, d);
  vec3 ay = ddy - d * dot(ddy, d);
  ax = length(ax) > 1e-9 ? normalize(ax) : vec3(1.0, 0.0, 0.0);
  ay = length(ay) > 1e-9 ? normalize(ay) : vec3(0.0, 1.0, 0.0);
  // Cada camada some quando o pixel passa de ~1/6 da célula dela: no monitor
  // (0,002 a 0,004 rad por pixel, conforme a qualidade) as três ficam; na
  // esfera, onde o céu inteiro cabe em poucas centenas de pixels, a textura
  // assume.
  float wFine = 1.0 - smoothstep(0.12, 0.2, pix / 0.04);
  float wMid = 1.0 - smoothstep(0.12, 0.2, pix / 0.07);
  float wCoarse = 1.0 - smoothstep(0.12, 0.2, pix / 0.13);
  weight = wFine;
  vec3 stars = vec3(0.0);
  if (wFine > 0.0) stars += wFine * pointStarLayer(d, 0.04, 0.85, 0.6, pix, ax, ay, 0.0);
  if (wMid > 0.0) stars += wMid * pointStarLayer(d, 0.07, 0.6, 1.5, pix, ax, ay, 0.0);
  if (wCoarse > 0.0) stars += wCoarse * pointStarLayer(d, 0.13, 0.45, 5.0, pix, ax, ay, spikes);
  return stars;
}

vec3 skyStars(vec3 d, vec3 ddx, vec3 ddy) {
  vec2 uv = skyUv(d);
  vec2 gx = skyUv(normalize(d + ddx)) - uv;
  vec2 gy = skyUv(normalize(d + ddy)) - uv;
  gx.x -= floor(gx.x + 0.5);
  gy.x -= floor(gy.x + 0.5);
  gx = clamp(gx, vec2(-0.03), vec2(0.03));
  gy = clamp(gy, vec2(-0.03), vec2(0.03));
  return textureGrad(uStars, uv, gx, gy).rgb;
}

vec3 shadeTrace(TraceResult hit) {
  vec3 ddx = dFdx(hit.dir);
  vec3 ddy = dFdy(hit.dir);
  vec3 color = hit.light;
  if (hit.kind == 0) {
    float procedural;
    vec3 points = pointStars(hit.dir, ddx, ddy, procedural);
    vec3 stars = mix(skyStars(hit.dir, ddx, ddy), vec3(0.0), procedural) + points;
    color += hit.transmittance * (skyColor(hit.dir, ddx, ddy) + stars * uSkyIntensity + sourceStar(hit.dir));
  }
  return color;
}
`;

export interface TracerUniforms {
  [name: string]: THREE.IUniform;
  uSky: THREE.IUniform<THREE.Texture | null>;
  /** Estrelas do céu (camada separada da Via Láctea, ver sky.ts). */
  uStars: THREE.IUniform<THREE.Texture | null>;
  uSkyIntensity: THREE.IUniform<number>;
  uSource: THREE.IUniform<THREE.Vector3>;
  uSourceRadius: THREE.IUniform<number>;
  uSourceIntensity: THREE.IUniform<number>;
  uDisk: THREE.IUniform<number>;
  uDiskInner: THREE.IUniform<number>;
  uDiskOuter: THREE.IUniform<number>;
  uDiskTime: THREE.IUniform<number>;
  uDiskTemperature: THREE.IUniform<number>;
  uDiskIntensity: THREE.IUniform<number>;
  uStep: THREE.IUniform<number>;
}

/** Borda de fora do disco, M. */
export const DISK_OUTER_RADIUS = 20;
/** Temperatura de cor do pico do disco, K: escalada para o visível (declarado). */
export const DISK_COLOR_TEMPERATURE = 4300;

export function createTracerUniforms(): TracerUniforms {
  return {
    uSky: { value: null },
    uStars: { value: null },
    uSkyIntensity: { value: 1 },
    uSource: { value: new THREE.Vector3(0, 0, -1) },
    uSourceRadius: { value: (0.6 * Math.PI) / 180 },
    uSourceIntensity: { value: 6 },
    uDisk: { value: 1 },
    uDiskInner: { value: ISCO_RADIUS },
    uDiskOuter: { value: DISK_OUTER_RADIUS },
    uDiskTime: { value: 0 },
    uDiskTemperature: { value: DISK_COLOR_TEMPERATURE },
    uDiskIntensity: { value: 1.1 },
    uStep: { value: 0.035 },
  };
}
