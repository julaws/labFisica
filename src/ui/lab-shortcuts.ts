import type { Shortcut } from './modal';

/**
 * Atalhos do laboratório, que valem em qualquer experimento: câmera, interface
 * e troca de bancada. Cada experimento acrescenta os seus no modal.
 */
export const LAB_SHORTCUTS: readonly Shortcut[] = [
  { keys: '← →', description: { 'pt-BR': 'experimento anterior ou seguinte', en: 'previous or next experiment' } },
  { keys: 'C', description: { 'pt-BR': 'câmeras cinematográficas', en: 'cinematic cameras' } },
  { keys: 'R', description: { 'pt-BR': 'resetar a vista', en: 'reset view' } },
  { keys: '/', description: { 'pt-BR': 'esconder a interface', en: 'hide the interface' } },
  { keys: 'W A S D', description: { 'pt-BR': 'mover a câmera', en: 'move the camera' } },
  { keys: 'Q E', description: { 'pt-BR': 'girar a câmera', en: 'turn the camera' } },
  { keys: '?', description: { 'pt-BR': 'esta ajuda', en: 'this help' } },
];
