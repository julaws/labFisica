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

vec3 shadeTrace(TraceResult hit) {
  vec3 ddx = dFdx(hit.dir);
  vec3 ddy = dFdy(hit.dir);
  vec3 color = hit.light;
  if (hit.kind == 0) color += hit.transmittance * (skyColor(hit.dir, ddx, ddy) + sourceStar(hit.dir));
  return color;
}
`;

export interface TracerUniforms {
  [name: string]: THREE.IUniform;
  uSky: THREE.IUniform<THREE.Texture | null>;
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
