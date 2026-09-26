# CLAUDE.md — Laboratório de Óptica

Este arquivo é lido automaticamente pelo Claude Code em toda sessão. A especificação completa está em `docs/SPEC.md`. Leia-a inteira antes de qualquer tarefa nova.

## O que é o projeto

Um laboratório de óptica interativo em 3D, rodando no navegador, com qualidade visual de "estúdio" (PBR, iluminação por HDRI, pós-processamento). É uma plataforma com vários experimentos. O primeiro, que valida toda a arquitetura, é **"Lente e plano de foco"**. Referência visual e de interação: https://lens.lab.sael.net/

## Regras de trabalho (obrigatórias)

1. **Trabalhe por fases.** Siga a ordem das fases em `docs/SPEC.md` §12. Não comece uma fase sem cumprir os critérios de aceite da anterior. Ao fim de cada fase, pare, resuma o que foi feito, mostre as capturas de tela e aguarde aprovação.
2. **Planeje antes de codar.** Para cada fase, escreva primeiro um plano curto (arquivos a criar ou alterar, riscos, como vai testar) e só então implemente.
3. **A física manda.** Todo número exibido na interface vem do motor óptico em `src/optics/`, nunca de constantes soltas na camada visual. Unidades internas em **milímetros**. Se a visualização precisar exagerar uma escala, isso é feito em `src/scene/scale.ts` e declarado ao usuário (ver SPEC §6.2).
4. **Testes antes de visual.** O motor óptico é TypeScript puro, sem dependência de three.js, coberto por Vitest. `npm test` precisa passar antes de cada commit. Os valores de referência estão em SPEC §5.6.
5. **Verifique o visual por captura de tela.** Use o script Playwright (`npm run shots`) para gerar capturas em `screenshots/` e **abra as imagens para inspecioná-las** antes de declarar uma fase visual concluída. Compare com a descrição de referência em SPEC §3.
6. **Commits pequenos e descritivos**, um por unidade lógica, em inglês, no formato Conventional Commits (`feat(optics): add thin-lens solver`).
7. **TypeScript estrito** (`strict: true`, sem `any` implícito). Código e identificadores em inglês; textos da interface em **português do Brasil**, com camada de i18n pronta para inglês.
8. **Desempenho é requisito.** Meta de 60 fps em GPU de notebook intermediária e 30 fps em celular recente. Meça com o painel de estatísticas (tecla `P`, só em modo dev) e registre os números no resumo de cada fase visual.
9. **Nada de dependência nova sem justificativa.** A stack está definida em SPEC §4. Se precisar de algo fora dela, pergunte antes.
10. **Assets externos só com licença CC0** (Poly Haven, ambientCG), registrados em `CREDITS.md`. Prefira texturas procedurais geradas em código.
11. **Não apague nem reescreva módulos compartilhados** (`src/core`, `src/optics`, `src/ui`) para acomodar um experimento. Estenda por interfaces.
12. Quando uma decisão da SPEC se mostrar inviável, **pare e explique** o problema e as alternativas, em vez de contorná-la silenciosamente.

## Comandos

- `npm run dev`: servidor de desenvolvimento (Vite)
- `npm test`: testes unitários (Vitest)
- `npm run shots`: capturas de tela automáticas (Playwright)
- `npm run build`: build de produção em `dist/`
- `npm run build:single`: build em um único HTML (opcional, SPEC §4)
- `npm run lint` / `npm run typecheck`

## Mapa rápido

- `src/optics/`: física pura (lentes, traçado de raios, vidros, profundidade de campo)
- `src/core/`: renderer, loop, câmera, pós-processamento, qualidade adaptativa, registro de experimentos
- `src/scene/`: ambiente do laboratório, bancada, materiais, texturas procedurais
- `src/experiments/<id>/`: cada experimento
- `src/ui/`: HUD, painéis, console, modais, i18n
- `docs/`: SPEC, fontes das fórmulas e prescrições ópticas, decisões de arquitetura (`docs/adr/`)
