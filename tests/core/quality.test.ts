import { describe, expect, it } from 'vitest';
import { LIGHTWEIGHT_SETTINGS, QUALITY_PRESETS, createQualityManager } from '../../src/core/quality';

describe('modo leve', () => {
  it('desliga sombras, bloom, AO e profundidade de campo', () => {
    expect(LIGHTWEIGHT_SETTINGS).toMatchObject({
      lightweight: true,
      shadows: false,
      bloom: false,
      ambientOcclusion: false,
      depthOfField: false,
      maxPixelRatio: 1,
    });
    for (const preset of Object.values(QUALITY_PRESETS)) expect(preset.lightweight).toBe(false);
  });

  it('entra e sai, avisando os assinantes, e volta ao nível de antes', () => {
    const quality = createQualityManager('high');
    const seen: boolean[] = [];
    quality.onChange((settings) => seen.push(settings.lightweight));
    quality.setLightweight(true);
    expect(quality.settings).toBe(LIGHTWEIGHT_SETTINGS);
    quality.setLightweight(true);
    quality.setLightweight(false);
    expect(quality.settings.level).toBe('high');
    expect(seen).toEqual([true, false]);
  });

  it('o ajuste automático não mexe no modo leve', () => {
    const quality = createQualityManager('high', { patience: 2 });
    quality.setLightweight(true);
    for (let i = 0; i < 10; i += 1) quality.sample(100);
    expect(quality.settings).toBe(LIGHTWEIGHT_SETTINGS);
    quality.setLightweight(false);
    expect(quality.settings.level).toBe('high');
  });
});
