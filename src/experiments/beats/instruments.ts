import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MaterialLibrary } from '../../scene/materials';
import { nameplateTexture } from '../../scene/textures/procedural';

/**
 * Os instrumentos da bancada dos batimentos (ADR 0019), da esquerda para a
 * direita: alto-falante, sintetizador de dois osciladores, osciloscópio,
 * monitor de espectro e a tela redonda dos fasores; na frente, um teclado de
 * uma oitava (lá 3 a lá 4) que se pode clicar.
 *
 * As telas são canvas redesenhados a cada quadro pelo experimento
 * (`displays.ts`); aqui só ficam as malhas, as texturas e o que se mexe — os
 * botões giram com as frequências, os LEDs e o cone do alto-falante pulsam
 * com a envoltória.
 */

export interface CanvasScreen {
  readonly mesh: THREE.Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** Manda a textura para a GPU depois de desenhar. */
  refresh(): void;
}

export interface BeatsRig {
  readonly group: THREE.Group;
  readonly glowing: THREE.Object3D[];
  readonly scope: CanvasScreen;
  readonly spectrum: CanvasScreen;
  readonly phasor: CanvasScreen;
  /** Teclas, com `userData.semitone` (semitons a partir do lá 4, de −12 a 0). */
  readonly keys: THREE.Mesh[];
  readonly anchors: { readonly synth: THREE.Object3D; readonly keyboard: THREE.Object3D; readonly speaker: THREE.Object3D };
  /** Gira os botões das frequências. */
  setKnobs(f1: number, f2: number): void;
  /** Brilho dos LEDs e o cone: o nível de cada voz e da soma, de 0 a 1. */
  setPulse(level1: number, level2: number, sum: number): void;
  /** Destaca a tecla tocada (ou nenhuma). */
  setActiveKey(semitone: number | null): void;
  dispose(): void;
}

const BLACK_KEYS = new Set([-11, -9, -6, -4, -1]);

export function createBeatsRig(materials: MaterialLibrary, quality: 'low' | 'high'): BeatsRig {
  const group = new THREE.Group();
  group.name = 'beats-instruments';
  const geometries: THREE.BufferGeometry[] = [];
  const owned: (THREE.Material | THREE.Texture)[] = [];
  const glowing: THREE.Object3D[] = [];
  const scale = quality === 'low' ? 0.75 : 1;

  const screen = (pixelsW: number, pixelsH: number, geometry: THREE.BufferGeometry): CanvasScreen => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(pixelsW * scale);
    canvas.height = Math.round(pixelsH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D indisponível para as telas');
    ctx.scale(scale, scale);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    owned.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    owned.push(material);
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    glowing.push(mesh);
    return {
      mesh,
      canvas,
      ctx,
      refresh: () => {
        texture.needsUpdate = true;
      },
    };
  };

  const solid = (parts: THREE.BufferGeometry[], material: THREE.Material, name: string): THREE.Mesh => {
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!merged) throw new Error(`Falha ao montar ${name}`);
    geometries.push(merged);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  };

  // --- Alto-falante -----------------------------------------------------------------
  const speaker = new THREE.Group();
  speaker.position.set(-1.38, 0, -0.12);
  speaker.rotation.y = 0.28;
  group.add(speaker);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a2d1a, roughness: 0.62, metalness: 0 });
  owned.push(wood);
  speaker.add(solid([new THREE.BoxGeometry(0.3, 0.46, 0.26).translate(0, 0.23, 0)], wood, 'speaker-box'));
  const grilleMaterial = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.9, metalness: 0.1 });
  owned.push(grilleMaterial);
  speaker.add(solid([new THREE.PlaneGeometry(0.26, 0.42).translate(0, 0.23, 0.131)], grilleMaterial, 'speaker-front'));
  const coneGeometry = new THREE.CylinderGeometry(0.105, 0.04, 0.05, 40, 1, true).rotateX(Math.PI / 2);
  geometries.push(coneGeometry);
  const coneMaterial = new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.7, side: THREE.DoubleSide });
  owned.push(coneMaterial);
  const cone = new THREE.Mesh(coneGeometry, coneMaterial);
  cone.position.set(0, 0.28, 0.118);
  speaker.add(cone);
  const capGeometry = new THREE.SphereGeometry(0.035, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2);
  geometries.push(capGeometry);
  const cap = new THREE.Mesh(capGeometry, materials.brushedBrass);
  cap.position.set(0, 0.28, 0.105);
  speaker.add(cap);
  const tweeterGeometry = new THREE.CylinderGeometry(0.03, 0.03, 0.01, 24).rotateX(Math.PI / 2);
  geometries.push(tweeterGeometry);
  const tweeter = new THREE.Mesh(tweeterGeometry, materials.darkSteel);
  tweeter.position.set(0, 0.1, 0.135);
  speaker.add(tweeter);

  // --- Sintetizador --------------------------------------------------------------------
  const synth = new THREE.Group();
  synth.position.set(-0.86, 0, -0.04);
  synth.rotation.y = 0.12;
  group.add(synth);
  synth.add(
    solid(
      [
        new THREE.BoxGeometry(0.56, 0.07, 0.36).translate(0, 0.035, 0),
        new THREE.BoxGeometry(0.03, 0.2, 0.36).translate(-0.295, 0.1, 0),
        new THREE.BoxGeometry(0.03, 0.2, 0.36).translate(0.295, 0.1, 0),
      ],
      wood,
      'synth-case',
    ),
  );
  // Painel inclinado com a serigrafia.
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = 1024;
  panelCanvas.height = 512;
  const panelContext = panelCanvas.getContext('2d');
  if (!panelContext) throw new Error('Canvas 2D indisponível para o painel');
  panelContext.fillStyle = '#16181d';
  panelContext.fillRect(0, 0, 1024, 512);
  panelContext.strokeStyle = 'rgba(230, 236, 246, 0.25)';
  panelContext.lineWidth = 4;
  panelContext.strokeRect(24, 24, 976, 464);
  panelContext.beginPath();
  panelContext.moveTo(512, 40);
  panelContext.lineTo(512, 472);
  panelContext.stroke();
  panelContext.fillStyle = '#e6eaf2';
  panelContext.font = '700 46px Outfit, ui-sans-serif, sans-serif';
  panelContext.textAlign = 'center';
  panelContext.fillText('OSC 1', 256, 92);
  panelContext.fillText('OSC 2', 768, 92);
  panelContext.font = '500 30px "DM Mono", ui-monospace, monospace';
  panelContext.fillStyle = '#9fb0d0';
  panelContext.fillText('FREQ', 256, 430);
  panelContext.fillText('FREQ', 768, 430);
  for (const cx of [256, 768]) {
    for (let i = 0; i <= 10; i += 1) {
      const a = Math.PI * (0.75 + (1.5 * i) / 10);
      panelContext.beginPath();
      panelContext.moveTo(cx + Math.cos(a) * 118, 270 + Math.sin(a) * 118);
      panelContext.lineTo(cx + Math.cos(a) * 138, 270 + Math.sin(a) * 138);
      panelContext.stroke();
    }
  }
  const panelTexture = new THREE.CanvasTexture(panelCanvas);
  panelTexture.colorSpace = THREE.SRGBColorSpace;
  panelTexture.anisotropy = 8;
  owned.push(panelTexture);
  const panelMaterial = new THREE.MeshStandardMaterial({ map: panelTexture, roughness: 0.6, metalness: 0.2 });
  owned.push(panelMaterial);
  const panel = new THREE.Group();
  panel.position.set(0, 0.13, 0.02);
  panel.rotation.x = -0.6;
  synth.add(panel);
  const panelGeometry = new THREE.PlaneGeometry(0.56, 0.28);
  geometries.push(panelGeometry);
  panel.add(new THREE.Mesh(panelGeometry, panelMaterial));
  const knobGeometry = new THREE.CylinderGeometry(0.038, 0.042, 0.04, 32).rotateX(Math.PI / 2).translate(0, 0, 0.02);
  const pointerGeometry = new THREE.BoxGeometry(0.006, 0.03, 0.006).translate(0, 0.022, 0.043);
  geometries.push(knobGeometry, pointerGeometry);
  const knobs = [-0.14, 0.14].map((x) => {
    const knob = new THREE.Group();
    knob.position.set(x, -0.012, 0);
    knob.add(new THREE.Mesh(knobGeometry, materials.knurledRubber));
    knob.add(new THREE.Mesh(pointerGeometry, materials.brushedBrass));
    panel.add(knob);
    return knob;
  });
  // LEDs: um por oscilador e o da soma, que pisca no ritmo do batimento.
  const ledGeometry = new THREE.SphereGeometry(0.011, 16, 8);
  geometries.push(ledGeometry);
  const ledColors = [0x7fe3ff, 0xffb45c, 0x8dffcf];
  const leds = ledColors.map((color, i) => {
    const material = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    owned.push(material);
    const led = new THREE.Mesh(ledGeometry, material);
    led.position.set(i === 2 ? 0 : i === 0 ? -0.22 : 0.22, 0.1, 0.008);
    panel.add(led);
    glowing.push(led);
    return { material, base: new THREE.Color(color) };
  });
  const synthPlateGeometry = new THREE.PlaneGeometry(0.2, 0.2 * (352 / 1024));
  geometries.push(synthPlateGeometry);
  const plateMaterial = new THREE.MeshStandardMaterial({
    map: nameplateTexture('@juliophisico', 'SINTETIZADOR · 2 OSCILADORES'),
    metalness: 0.75,
    roughness: 0.38,
    envMapIntensity: 0.6,
  });
  owned.push(plateMaterial);
  const synthPlate = new THREE.Mesh(synthPlateGeometry, plateMaterial);
  synthPlate.position.set(0, 0.035, 0.182);
  synth.add(synthPlate);

  // --- Osciloscópio ------------------------------------------------------------------------
  const scopeGroup = new THREE.Group();
  scopeGroup.position.set(-0.16, 0, -0.1);
  group.add(scopeGroup);
  const scopeW = 0.6;
  const scopeH = scopeW * (9 / 16);
  scopeGroup.add(
    solid(
      [
        new THREE.BoxGeometry(0.76, 0.5, 0.4).translate(0, 0.27, 0),
        new THREE.BoxGeometry(0.66, 0.02, 0.32).translate(0, 0.01, 0),
      ],
      materials.darkSteel,
      'scope-body',
    ),
  );
  const scopeBezel = new THREE.MeshStandardMaterial({ color: 0x0b0d10, roughness: 0.4, metalness: 0.3 });
  owned.push(scopeBezel);
  scopeGroup.add(
    solid([new THREE.BoxGeometry(scopeW + 0.04, scopeH + 0.04, 0.02).translate(0, 0.31, 0.205)], scopeBezel, 'scope-bezel'),
  );
  const scope = screen(1024, 576, new THREE.PlaneGeometry(scopeW, scopeH));
  scope.mesh.position.set(0, 0.31, 0.216);
  scopeGroup.add(scope.mesh);
  const scopeKnobs = [-0.25, -0.12, 0.12, 0.25].map((x) => new THREE.CylinderGeometry(0.018, 0.02, 0.02, 24).rotateX(Math.PI / 2).translate(x, 0.07, 0.21));
  scopeGroup.add(solid(scopeKnobs, materials.knurledRubber, 'scope-knobs'));

  // --- Monitor de espectro -------------------------------------------------------------------
  const spectrumGroup = new THREE.Group();
  spectrumGroup.position.set(0.7, 0, -0.14);
  spectrumGroup.rotation.y = -0.16;
  group.add(spectrumGroup);
  const specW = 0.58;
  const specH = specW * (9 / 16);
  spectrumGroup.add(
    solid(
      [
        new THREE.BoxGeometry(specW + 0.05, specH + 0.05, 0.035).translate(0, 0.37, 0),
        new THREE.BoxGeometry(0.04, 0.2, 0.04).translate(0, 0.1, -0.02),
        new THREE.BoxGeometry(0.26, 0.02, 0.18).translate(0, 0.01, -0.02),
      ],
      materials.darkSteel,
      'spectrum-monitor',
    ),
  );
  const spectrum = screen(1024, 576, new THREE.PlaneGeometry(specW, specH));
  spectrum.mesh.position.set(0, 0.37, 0.019);
  spectrumGroup.add(spectrum.mesh);

  // --- Tela redonda dos fasores --------------------------------------------------------------
  const phasorGroup = new THREE.Group();
  phasorGroup.position.set(1.27, 0, -0.06);
  phasorGroup.rotation.y = -0.38;
  group.add(phasorGroup);
  phasorGroup.add(
    solid(
      [
        new THREE.CylinderGeometry(0.2, 0.2, 0.16, 48).rotateX(Math.PI / 2).translate(0, 0.27, 0),
        new THREE.BoxGeometry(0.2, 0.08, 0.16).translate(0, 0.04, 0),
      ],
      materials.darkSteel,
      'phasor-body',
    ),
  );
  phasorGroup.add(solid([new THREE.TorusGeometry(0.185, 0.012, 12, 64).translate(0, 0.27, 0.08)], materials.brushedBrass, 'phasor-ring'));
  const phasor = screen(512, 512, new THREE.CircleGeometry(0.175, 64));
  phasor.mesh.position.set(0, 0.27, 0.082);
  phasorGroup.add(phasor.mesh);

  // --- Teclado ------------------------------------------------------------------------------------
  const keyboard = new THREE.Group();
  keyboard.position.set(-0.16, 0, 0.3);
  group.add(keyboard);
  const whiteWidth = 0.05;
  const whites = [-12, -10, -9, -7, -5, -4, -2, 0];
  const caseWidth = whites.length * whiteWidth + 0.04;
  keyboard.add(solid([new THREE.BoxGeometry(caseWidth, 0.03, 0.2).translate(0, 0.015, 0)], wood, 'keyboard-case'));
  const whiteGeometry = new THREE.BoxGeometry(whiteWidth - 0.004, 0.018, 0.17).translate(0, 0.009, 0);
  const blackGeometry = new THREE.BoxGeometry(0.028, 0.02, 0.1).translate(0, 0.01, 0);
  geometries.push(whiteGeometry, blackGeometry);
  const keys: THREE.Mesh[] = [];
  const keyMaterials = new Map<number, THREE.MeshStandardMaterial>();
  whites.forEach((semitone, i) => {
    const material = new THREE.MeshStandardMaterial({ color: 0xeeeae0, roughness: 0.35, emissive: 0x000000 });
    owned.push(material);
    keyMaterials.set(semitone, material);
    const key = new THREE.Mesh(whiteGeometry, material);
    key.position.set(-((whites.length - 1) * whiteWidth) / 2 + i * whiteWidth, 0.03, 0.005);
    key.userData.semitone = semitone;
    key.castShadow = true;
    keyboard.add(key);
    keys.push(key);
  });
  for (const semitone of BLACK_KEYS) {
    // Entre as duas brancas vizinhas.
    const left = whites.indexOf(semitone - 1);
    const material = new THREE.MeshStandardMaterial({ color: 0x111216, roughness: 0.3, emissive: 0x000000 });
    owned.push(material);
    keyMaterials.set(semitone, material);
    const key = new THREE.Mesh(blackGeometry, material);
    key.position.set(-((whites.length - 1) * whiteWidth) / 2 + (left + 0.5) * whiteWidth, 0.048, -0.03);
    key.userData.semitone = semitone;
    key.castShadow = true;
    keyboard.add(key);
    keys.push(key);
  }

  const anchors = {
    synth: new THREE.Object3D(),
    keyboard: new THREE.Object3D(),
    speaker: new THREE.Object3D(),
  };
  anchors.synth.position.set(0, 0.3, 0);
  synth.add(anchors.synth);
  anchors.keyboard.position.set(0, 0.08, 0);
  keyboard.add(anchors.keyboard);
  anchors.speaker.position.set(0, 0.5, 0);
  speaker.add(anchors.speaker);

  const knobAngle = (f: number): number => {
    // 55 Hz a 1760 Hz em escala logarítmica, 270° de curso.
    const t = Math.min(Math.max(Math.log(f / 55) / Math.log(1760 / 55), 0), 1);
    return Math.PI * 0.75 - t * Math.PI * 1.5;
  };

  let activeKey: number | null = null;

  return {
    group,
    glowing,
    scope,
    spectrum,
    phasor,
    keys,
    anchors,

    setKnobs(f1: number, f2: number): void {
      knobs[0]!.rotation.z = knobAngle(f1);
      knobs[1]!.rotation.z = knobAngle(f2);
    },

    setPulse(level1: number, level2: number, sum: number): void {
      const levels = [level1, level2, sum];
      leds.forEach((led, i) => {
        led.material.color.copy(led.base).multiplyScalar(0.15 + 1.6 * Math.min(Math.max(levels[i]!, 0), 1.2));
      });
      cone.position.z = 0.118 + 0.012 * sum;
      cap.position.z = 0.105 + 0.012 * sum;
    },

    setActiveKey(semitone: number | null): void {
      if (activeKey === semitone) return;
      if (activeKey !== null) {
        const previous = keyMaterials.get(activeKey);
        previous?.emissive.setHex(0x000000);
        const key = keys.find((k) => k.userData.semitone === activeKey);
        if (key) key.rotation.x = 0;
      }
      activeKey = semitone;
      if (semitone !== null) {
        keyMaterials.get(semitone)?.emissive.setHex(0xb07a1c);
        const key = keys.find((k) => k.userData.semitone === semitone);
        if (key) key.rotation.x = 0.05;
      }
    },

    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const item of owned) item.dispose();
      group.clear();
    },
  };
}
