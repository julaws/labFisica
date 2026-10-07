import type * as THREE from 'three';
import type { LabContext, Locale } from '../core/experiment';
import { createVideoTv } from './video-tv';

/**
 * Vídeo explicativo de uma bancada: a TV retrô sobre o tampo, a etiqueta
 * "Vídeo explicativo · clique", o clique e uma tecla (V, por padrão). Tudo o que um
 * experimento precisa para oferecer o seu vídeo da série "Planka e…".
 *
 * O vídeo abre na frente da cena pelo `ctx.openVideo` do laboratório, que
 * também cala a música de fundo. Sem `openVideo` (um contexto antigo, ou o
 * script de capturas sem interface), nada é montado.
 */

export interface ExplainerVideoSpec {
  /** Arquivo em `public/video/`. */
  readonly file: string;
  /** Capa (imagem 16:9), já como URL. */
  readonly poster: string;
  readonly title: Record<Locale, string>;
  readonly description: Record<Locale, string>;
  /** Posição da TV no tampo, em coordenadas da bancada (y = topo). */
  readonly position: THREE.Vector3Like;
  /** Giro em torno do eixo vertical, para a tela olhar para a câmera. */
  readonly rotationY: number;
  /** Tecla que abre o vídeo; por padrão V (a dupla fenda usa V para o feixe). */
  readonly key?: string;
}

export interface ExplainerVideo {
  /** Abre o vídeo (o mesmo que clicar na TV). */
  open(): void;
  setLocale(locale: Locale): void;
  dispose(): void;
}

const caption = (locale: Locale): string => (locale === 'en' ? 'Click to watch' : 'Clique para assistir');
const labelText = (locale: Locale): string => (locale === 'en' ? 'Explainer video · click' : 'Vídeo explicativo · clique');

export function mountExplainerVideo(ctx: LabContext, spec: ExplainerVideoSpec, locale: Locale): ExplainerVideo | null {
  if (!ctx.openVideo) return null;
  // Uma etiqueta por vídeo: na troca de bancada, a que chega é montada antes
  // de a que sai ser desmontada, e um id comum faria uma apagar a outra.
  const labelId = `video:${spec.file}`;
  const tv = createVideoTv({
    materials: ctx.materials,
    posterUrl: spec.poster,
    title: spec.title['pt-BR'],
    caption: caption(locale),
    invalidate: () => ctx.invalidate(),
  });
  tv.group.position.set(spec.position.x, spec.position.y, spec.position.z);
  tv.group.rotation.y = spec.rotationY;
  ctx.bench.group.add(tv.group);
  for (const object of tv.glowing) ctx.addGlow(object);

  const open = (): void =>
    ctx.openVideo?.({
      src: `${import.meta.env.BASE_URL}video/${spec.file}`,
      poster: spec.poster,
      title: spec.title,
      description: spec.description,
      anchor: tv.screen,
    });

  ctx.labels.add({ id: labelId, anchor: tv.group, offset: { x: 0, y: tv.height + 0.04, z: 0 }, text: labelText(locale) });
  const removers: (() => void)[] = [ctx.onKey(spec.key ?? 'v', open)];
  if (ctx.registerClickable) {
    removers.push(
      ctx.registerClickable({
        targets: [tv.group],
        cursor: 'pointer',
        occluders: () => ctx.scene,
        onClick: open,
      }),
    );
  }

  return {
    open,
    setLocale(next: Locale): void {
      ctx.labels.setText(labelId, labelText(next));
      tv.setCaption(caption(next));
    },
    dispose(): void {
      for (const remove of removers) remove();
      ctx.labels.remove(labelId);
      tv.dispose();
    },
  };
}
