import { describe, expect, it } from 'vitest';
import { WAVELENGTHS_NM } from '../../src/optics/constants';
import { analyze, systemMatrix, traceParaxial } from '../../src/optics/paraxial';
import {
  axialCrossing,
  collimatedRay,
  intersectSurface,
  normalize,
  refract,
  sphericalAberration,
  traceRay,
} from '../../src/optics/trace';
import { glassElements, opticalLength, vertexPositions } from '../../src/optics/prescription';
import {
  DEFAULT_DESIGN,
  LENS_50MM_F2,
  designSymmetricDoubleDoublet,
  withFNumber,
} from '../../src/optics/prescriptions/symmetric-double-doublet';

const lens = LENS_50MM_F2;
const lastVertex = vertexPositions(lens.surfaces).at(-1)!;

describe('análise paraxial (SPEC §5.6)', () => {
  it('dá EFL de 50,0 mm com erro abaixo de 0,5%', () => {
    const { efl } = analyze(lens);
    expect(Math.abs(efl - 50) / 50).toBeLessThanOrEqual(0.005);
  });

  it('tem determinante 1 na matriz do sistema, como exige a conservação', () => {
    const [a, b, c, d] = systemMatrix(lens.surfaces);
    expect(a * d - b * c).toBeCloseTo(1, 10);
  });

  it('coloca o foco traseiro atrás da última superfície', () => {
    const { bfl, efl } = analyze(lens);
    expect(bfl).toBeGreaterThan(0);
    expect(bfl).toBeLessThan(efl);
  });

  it('põe a pupila de entrada à frente do stop, como num sistema simétrico', () => {
    const { entrancePupil } = analyze(lens);
    const stopZ = vertexPositions(lens.surfaces)[3]!;
    expect(entrancePupil.z).toBeLessThan(stopZ);
    expect(entrancePupil.diameter).toBeGreaterThan(0);
  });

  it('leva um raio paralelo ao eixo à altura prevista pela EFL', () => {
    const { efl } = analyze(lens);
    const out = traceParaxial(lens.surfaces, { y: 1, omega: 0 });
    // ω_saída = −y/f  (ar de ambos os lados)
    expect(out.omega).toBeCloseTo(-1 / efl, 8);
  });
});

describe('traçado real versus paraxial (SPEC §5.6)', () => {
  it('faz o raio quase paraxial cruzar o eixo no foco previsto, com erro < 0,01 mm', () => {
    const { bfl } = analyze(lens);
    const result = traceRay(lens, collimatedRay(1e-3));
    expect(result.blocked).toBeNull();
    const crossing = axialCrossing(result.exit!) - lastVertex;
    expect(Math.abs(crossing - bfl)).toBeLessThan(0.01);
  });

  it('concorda com o paraxial também nas linhas F e C', () => {
    for (const wavelength of [WAVELENGTHS_NM.F, WAVELENGTHS_NM.C]) {
      const { bfl } = analyze(lens, wavelength);
      const result = traceRay(lens, collimatedRay(1e-3), wavelength);
      const crossing = axialCrossing(result.exit!) - lastVertex;
      expect(Math.abs(crossing - bfl)).toBeLessThan(0.01);
    }
  });

  it('tem aberração esférica longitudinal finita, subcorrigida e de ordem plausível em f/2', () => {
    const marginalHeight = 50 / 2 / 2; // raio da pupila em f/2: D/2 = f/(2N)
    const sa = sphericalAberration(lens, marginalHeight);

    expect(Number.isFinite(sa.longitudinal)).toBe(true);
    // Subcorrigida: o raio marginal foca antes do paraxial. É o sinal esperado
    // para elementos positivos de faces esféricas.
    expect(sa.longitudinal).toBeLessThan(0);
    // Ordem de grandeza: alguns milímetros num projeto de 4 elementos em f/2.
    expect(Math.abs(sa.longitudinal)).toBeGreaterThan(0.1);
    expect(Math.abs(sa.longitudinal)).toBeLessThan(6);
  });

  it('encolhe a aberração esférica quando a abertura fecha', () => {
    const atF2 = Math.abs(sphericalAberration(lens, 50 / 4).longitudinal);
    const atF8 = Math.abs(sphericalAberration(lens, 50 / 16).longitudinal);
    expect(atF8).toBeLessThan(atF2);
  });

  it('é acromática: as linhas F e C focam praticamente no mesmo ponto', () => {
    const focusAt = (wavelength: number): number =>
      axialCrossing(traceRay(lens, collimatedRay(0.02), wavelength).exit!);
    expect(Math.abs(focusAt(WAVELENGTHS_NM.F) - focusAt(WAVELENGTHS_NM.C))).toBeLessThan(0.01);
  });

  it('ainda tem espectro secundário: a linha d não cai exatamente entre F e C', () => {
    const focusAt = (wavelength: number): number =>
      axialCrossing(traceRay(lens, collimatedRay(0.02), wavelength).exit!);
    const secondary = focusAt(WAVELENGTHS_NM.d) - focusAt(WAVELENGTHS_NM.F);
    expect(Math.abs(secondary)).toBeGreaterThan(0);
  });
});

describe('vinhetagem e reflexão interna total', () => {
  it('bloqueia um raio que chega além do semidiâmetro', () => {
    const outside = DEFAULT_DESIGN.semiDiameter + 1;
    const result = traceRay(lens, collimatedRay(outside));
    expect(result.blocked?.reason).toBe('vignette');
    expect(result.exit).toBeNull();
  });

  it('deixa passar um raio dentro do semidiâmetro', () => {
    const result = traceRay(lens, collimatedRay(DEFAULT_DESIGN.semiDiameter - 1));
    expect(result.blocked).toBeNull();
  });

  it('detecta reflexão interna total acima do ângulo crítico', () => {
    // Vidro (n = 1,5) para ar, incidência de 60° — o crítico é ~41,8°.
    const theta = (60 * Math.PI) / 180;
    const incident = normalize({ x: 0, y: Math.sin(theta), z: Math.cos(theta) });
    const normal = { x: 0, y: 0, z: -1 };
    expect(refract(incident, normal, 1.5, 1)).toBeNull();
  });

  it('refrata normalmente abaixo do ângulo crítico', () => {
    const theta = (20 * Math.PI) / 180;
    const incident = normalize({ x: 0, y: Math.sin(theta), z: Math.cos(theta) });
    const normal = { x: 0, y: 0, z: -1 };
    const out = refract(incident, normal, 1.5, 1);
    expect(out).not.toBeNull();
    // Saindo para um meio menos denso, o raio se afasta da normal.
    expect(Math.abs(out!.y)).toBeGreaterThan(Math.abs(incident.y));
  });

  it('obedece à lei de Snell na forma escalar', () => {
    const theta = (30 * Math.PI) / 180;
    const incident = normalize({ x: 0, y: Math.sin(theta), z: Math.cos(theta) });
    const normal = { x: 0, y: 0, z: -1 };
    const out = refract(incident, normal, 1, 1.5)!;
    const thetaT = Math.asin(Math.abs(out.y));
    expect(Math.sin(theta)).toBeCloseTo(1.5 * Math.sin(thetaT), 10);
  });
});

describe('interseção com superfícies', () => {
  it('acerta o vértice de uma superfície convexa no eixo', () => {
    const hit = intersectSurface({ origin: { x: 0, y: 0, z: -5 }, direction: { x: 0, y: 0, z: 1 } }, 0, 50);
    expect(hit?.z).toBeCloseTo(0, 10);
  });

  it('acerta uma superfície plana', () => {
    const hit = intersectSurface({ origin: { x: 1, y: 2, z: -5 }, direction: { x: 0, y: 0, z: 1 } }, 3, Infinity);
    expect(hit).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('escolhe o lado do vértice em superfícies côncavas', () => {
    const hit = intersectSurface({ origin: { x: 0, y: 1, z: -5 }, direction: { x: 0, y: 0, z: 1 } }, 0, -20);
    // Numa côncava (centro à esquerda do vértice) a sagita recua em −z,
    // e vale R + sqrt(R² − h²) = −20 + sqrt(399) ≈ −0,025 mm.
    const expected = -20 + Math.sqrt(400 - 1);
    expect(hit!.z).toBeCloseTo(expected, 9);
    expect(hit!.z).toBeLessThan(0);
    expect(hit!.z).toBeGreaterThan(-1);
  });
});

describe('estrutura da prescrição', () => {
  it('tem 7 superfícies, com o stop no meio', () => {
    expect(lens.surfaces).toHaveLength(7);
    expect(lens.surfaces[3]!.isStop).toBe(true);
    expect(lens.surfaces[3]!.radius).toBe(Infinity);
  });

  it('é simétrica em torno do stop', () => {
    const s = lens.surfaces;
    expect(s[0]!.radius).toBeCloseTo(-s[6]!.radius, 9);
    expect(s[1]!.radius).toBeCloseTo(-s[5]!.radius, 9);
    expect(s[2]!.radius).toBeCloseTo(-s[4]!.radius, 9);
  });

  it('agrupa quatro elementos de vidro', () => {
    expect(glassElements(lens.surfaces)).toHaveLength(4);
  });

  it('cabe num barril de tamanho plausível para uma 50 mm', () => {
    const length = opticalLength(lens.surfaces);
    expect(length).toBeGreaterThan(20);
    expect(length).toBeLessThan(60);
  });

  it('declara fonte e notas, como exige a SPEC §13', () => {
    expect(lens.source).toContain('refractiveindex.info');
    expect(lens.notes.length).toBeGreaterThan(20);
  });

  it('tem espessura de borda positiva em todos os elementos', () => {
    const s = lens.surfaces;
    const sag = (radius: number, h: number): number =>
      Number.isFinite(radius)
        ? radius - Math.sign(radius) * Math.sqrt(radius * radius - h * h)
        : 0;

    for (let i = 0; i < s.length - 1; i += 1) {
      if (s[i]!.material.name === 'ar') continue;
      const h = Math.min(s[i]!.semiDiameter, s[i + 1]!.semiDiameter);
      const edge = s[i]!.thickness - sag(s[i]!.radius, h) + sag(s[i + 1]!.radius, h);
      expect(edge).toBeGreaterThan(0);
    }
  });
});

describe('abertura', () => {
  it('ajusta o stop para dar a pupila de entrada f/N', () => {
    for (const fNumber of [2, 5.6, 16]) {
      const adjusted = withFNumber(lens, fNumber);
      const { efl, entrancePupil } = analyze(adjusted);
      expect(entrancePupil.diameter).toBeCloseTo(efl / fNumber, 6);
    }
  });

  it('encolhe o stop quando a abertura fecha', () => {
    const wide = withFNumber(lens, 2).surfaces[3]!.semiDiameter;
    const narrow = withFNumber(lens, 16).surfaces[3]!.semiDiameter;
    expect(narrow).toBeLessThan(wide);
  });
});

describe('escolha do bending (reprodução da varredura de projeto)', () => {
  it('confirma que 1,30 minimiza a aberração esférica marginal', () => {
    let bestBending = 0;
    let bestAberration = Infinity;

    for (let bending = 0.8; bending <= 2.0001; bending += 0.05) {
      const candidate = designSymmetricDoubleDoublet({ ...DEFAULT_DESIGN, bending });
      const sa = Math.abs(sphericalAberration(candidate, 50 / 4).longitudinal);
      if (sa < bestAberration) {
        bestAberration = sa;
        bestBending = bending;
      }
    }

    expect(bestBending).toBeCloseTo(DEFAULT_DESIGN.bending, 1);
  });
});
