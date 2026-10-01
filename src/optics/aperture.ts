import type { Prescription } from './prescription';
import { analyze } from './paraxial';

/**
 * Abertura máxima que a objetiva alcança de verdade.
 *
 * O número f mais baixo não é uma escolha de interface: é o que a mecânica
 * permite. Com o stop totalmente aberto (o semidiâmetro declarado na
 * prescrição) a pupila de entrada tem um diâmetro fixo, e daí sai o f/N mínimo.
 * Pedir mais que isso exigiria elementos maiores.
 */
export function widestFNumber(prescription: Prescription): number {
  const analysis = analyze(prescription);
  return analysis.efl / analysis.entrancePupil.diameter;
}

/**
 * Ajusta o semidiâmetro do stop para que a **pupila de entrada** fique com
 * diâmetro `EFL / N`, que é a definição do número f (SPEC §5.2).
 * O stop não é a pupila: ele é visto pelas superfícies da frente com uma
 * magnificação, e é essa magnificação que entra na conta.
 *
 * Números f menores que `widestFNumber` são limitados a ele: a íris não pode
 * abrir além do próprio diâmetro.
 */
export function withFNumber(prescription: Prescription, fNumber: number): Prescription {
  const analysis = analyze(prescription);
  const stop = prescription.surfaces.find((s) => s.isStop);
  if (!stop) throw new Error('A prescrição não declara stop');

  const limited = Math.max(fNumber, analysis.efl / analysis.entrancePupil.diameter);
  const pupilMagnification = analysis.entrancePupil.diameter / (2 * stop.semiDiameter);
  const wantedPupilDiameter = analysis.efl / limited;
  const stopSemiDiameter = wantedPupilDiameter / 2 / pupilMagnification;

  return {
    ...prescription,
    surfaces: prescription.surfaces.map((s) => (s.isStop ? { ...s, semiDiameter: stopSemiDiameter } : s)),
  };
}
