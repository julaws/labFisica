import { describe, expect, it } from 'vitest';
import {
  DIORAMA_DEPTH,
  DIORAMA_K,
  distanceToDioramaOffset,
  dioramaOffsetToDistance,
  isWithinDiorama,
} from '../../src/scene/scale';
import { DEFAULT_SUBJECT_DISTANCES_MM, FOCUS_RANGE_MM } from '../../src/optics/constants';
import { distanceToSceneX, sceneXToDistance } from '../../src/experiments/lens-focus/diorama';

describe('mapa de profundidade do diorama (SPEC §6.2)', () => {
  it('é monotônico: mais longe na física é mais longe na cena', () => {
    const distances = [300, 370, 500, 600, 1000, 2000, 5000, 10_000];
    const offsets = distances.map(distanceToDioramaOffset);

    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
    }
  });

  it('faz a volta completa: distância → posição → distância', () => {
    for (const millimeters of [300, 370, 600, 1200, 2000, 5000, 10_000]) {
      expect(dioramaOffsetToDistance(distanceToDioramaOffset(millimeters))).toBeCloseTo(
        millimeters,
        6,
      );
    }
  });

  it('põe a borda próxima na folga declarada e a distante no fim da bandeja', () => {
    expect(distanceToDioramaOffset(DIORAMA_DEPTH.minMm)).toBeCloseTo(DIORAMA_DEPTH.gapScene, 9);
    expect(distanceToDioramaOffset(DIORAMA_DEPTH.maxMm)).toBeCloseTo(
      DIORAMA_DEPTH.gapScene + DIORAMA_DEPTH.spanScene,
      9,
    );
  });

  it('anda sempre o mesmo tanto quando a distância dobra', () => {
    // É a propriedade que define uma escala logarítmica, e é o que o modal
    // "Sobre as escalas" promete ao usuário.
    const step = DIORAMA_K * Math.LN2;
    for (const millimeters of [400, 800, 2000]) {
      const delta = distanceToDioramaOffset(millimeters * 2) - distanceToDioramaOffset(millimeters);
      expect(delta).toBeCloseTo(step, 9);
    }
  });

  it('cobre toda a faixa do anel de foco', () => {
    expect(DIORAMA_DEPTH.minMm).toBeLessThanOrEqual(FOCUS_RANGE_MM.min);
    expect(DIORAMA_DEPTH.maxMm).toBeGreaterThanOrEqual(FOCUS_RANGE_MM.max);
  });

  it('acomoda os três objetos de referência com folga entre eles', () => {
    const { foreground, midground, background } = DEFAULT_SUBJECT_DISTANCES_MM;

    for (const distance of [foreground, midground, background]) {
      expect(isWithinDiorama(distance)).toBe(true);
    }

    const pine = distanceToDioramaOffset(foreground);
    const cabin = distanceToDioramaOffset(midground);
    const peak = distanceToDioramaOffset(background);

    expect(cabin - pine).toBeGreaterThan(0.05);
    expect(peak - cabin).toBeGreaterThan(0.05);
  });

  it('coloca os objetos do lado do objeto, em −x, na ordem certa', () => {
    const { foreground, midground, background } = DEFAULT_SUBJECT_DISTANCES_MM;
    const pine = distanceToSceneX(foreground);
    const cabin = distanceToSceneX(midground);
    const peak = distanceToSceneX(background);

    // O objeto fica em −x, e mais longe na física é mais negativo na cena.
    expect(pine).toBeLessThan(0);
    expect(cabin).toBeLessThan(pine);
    expect(peak).toBeLessThan(cabin);
  });

  it('lê de volta a distância física de uma posição da cena', () => {
    for (const millimeters of [370, 600, 2000]) {
      expect(sceneXToDistance(distanceToSceneX(millimeters))).toBeCloseTo(millimeters, 6);
    }
  });

  it('limita distâncias fora da faixa às bordas da bandeja', () => {
    expect(distanceToDioramaOffset(10)).toBeCloseTo(distanceToDioramaOffset(DIORAMA_DEPTH.minMm), 9);
    expect(distanceToDioramaOffset(1e9)).toBeCloseTo(
      distanceToDioramaOffset(DIORAMA_DEPTH.maxMm),
      9,
    );
    expect(isWithinDiorama(100)).toBe(false);
    expect(isWithinDiorama(50_000)).toBe(false);
  });
});
