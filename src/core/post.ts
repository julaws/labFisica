import * as THREE from 'three';
import {
  BlendFunction,
  EffectComposer,
  EffectPass,
  KernelSize,
  NoiseEffect,
  NormalPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  SSAOEffect,
  SelectiveBloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { QualitySettings } from './quality';

/**
 * Pós-processamento cinematográfico (SPEC §3.1 e §4).
 *
 * Ordem: cena → AO → bloom seletivo → tone mapping AgX → vinheta → grão → SMAA.
 *
 * O bloom é **seletivo**: só o plano de foco, os raios e as fontes de luz
 * brilham. Bloom global estoura os metais da bancada e suja a imagem.
 * Objetos entram no brilho por `bloom.selection.add(objeto)`.
 */

export interface PostPipeline {
  readonly composer: EffectComposer;
  /** Seleção de objetos que recebem bloom. */
  readonly bloom: SelectiveBloomEffect;
  render(dt: number): void;
  setSize(width: number, height: number): void;
  applyQuality(settings: QualitySettings): void;
  dispose(): void;
}

export interface PostOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  quality: QualitySettings;
}

export function createPostPipeline({
  renderer,
  scene,
  camera,
  quality,
}: PostOptions): PostPipeline {
  // Com ToneMappingEffect no composer, o renderer precisa entregar linear.
  renderer.toneMapping = THREE.NoToneMapping;

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    multisampling: 0,
  });

  composer.addPass(new RenderPass(scene, camera));

  const normalPass = new NormalPass(scene, camera);
  normalPass.enabled = quality.ambientOcclusion;
  composer.addPass(normalPass);

  const ssao = new SSAOEffect(camera, normalPass.texture, {
    blendFunction: BlendFunction.MULTIPLY,
    // Perto dos padrões da biblioteca: com intensidade alta o MULTIPLY
    // apaga a cena inteira, que já é escura.
    worldDistanceThreshold: 30,
    worldDistanceFalloff: 8,
    worldProximityThreshold: 0.3,
    worldProximityFalloff: 0.1,
    luminanceInfluence: 0.7,
    samples: 9,
    rings: 7,
    radius: 0.1,
    intensity: 1.0,
    bias: 0.03,
    fade: 0.01,
    resolutionScale: 0.5,
  });

  const bloom = new SelectiveBloomEffect(scene, camera, {
    blendFunction: BlendFunction.ADD,
    // O limiar alto mantém o brilho nos emissivos, não nos metais.
    luminanceThreshold: 0.7,
    luminanceSmoothing: 0.26,
    intensity: 0.85,
    kernelSize: KernelSize.LARGE,
    mipmapBlur: true,
  });
  bloom.inverted = false;
  bloom.ignoreBackground = true;

  const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.AGX });

  const vignette = new VignetteEffect({ offset: 0.35, darkness: 0.46 });

  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: true });
  grain.blendMode.opacity.value = 0.055;

  const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });

  // O AO entra sozinho para poder ser ligado e desligado sem recompilar o resto.
  const aoPass = new EffectPass(camera, ssao);
  aoPass.enabled = quality.ambientOcclusion;
  composer.addPass(aoPass);

  const lookPass = new EffectPass(camera, bloom, toneMapping, vignette, grain);
  composer.addPass(lookPass);

  // A última passagem NUNCA pode ser desligada: o EffectComposer marca
  // `renderToScreen` na última do array sem olhar para `enabled`, então
  // desligá-la manda o quadro para um buffer que ninguém lê — tela preta.
  // No nível Baixo o SMAA continua ligado, só troca para o preset barato.
  const smaaPass = new EffectPass(camera, smaa);
  composer.addPass(smaaPass);

  return {
    composer,
    bloom,
    render(dt: number): void {
      composer.render(dt);
    },
    setSize(width: number, height: number): void {
      composer.setSize(width, height);
    },
    applyQuality(settings: QualitySettings): void {
      normalPass.enabled = settings.ambientOcclusion;
      aoPass.enabled = settings.ambientOcclusion;
      smaa.applyPreset(settings.antialias ? SMAAPreset.HIGH : SMAAPreset.LOW);
      bloom.intensity = settings.bloom ? 0.85 : 0;
    },
    dispose(): void {
      composer.dispose();
    },
  };
}
