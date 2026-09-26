# Laboratório de Óptica

Um laboratório de óptica interativo em 3D no navegador. A física vem de um motor
próprio em TypeScript puro (`src/optics/`), coberto por testes; a cena é three.js
com materiais PBR, HDRI e pós-processamento.

Primeiro experimento: **Lente e plano de foco**.

Especificação completa: [`docs/SPEC.md`](docs/SPEC.md).
Regras de trabalho do projeto: [`CLAUDE.md`](CLAUDE.md).

## Requisitos

- Node 20 ou superior
- Navegadores do Playwright (`npm run shots:install`) para as capturas de tela

## Começando

```bash
npm install
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento (Vite) em `localhost:5173` |
| `npm test` | testes unitários do motor óptico (Vitest) |
| `npm run shots` | capturas de tela automáticas em `screenshots/` (Playwright) |
| `npm run build` | build de produção em `dist/` |
| `npm run build:single` | build em um único HTML em `dist-single/` |
| `npm run typecheck` | checagem de tipos dos dois projetos TS |
| `npm run lint` | ESLint |

## Estrutura

```
src/optics/       física pura, sem three.js
src/core/         renderer, loop, câmera, pós-processamento, estado
src/scene/        sala, bancada, materiais, texturas procedurais, escalas
src/experiments/  um diretório por experimento
src/ui/           HUD, painéis, modal, i18n
tests/            Vitest (motor óptico)
e2e/              Playwright (capturas e smoke tests)
docs/             SPEC, fontes das fórmulas, ADRs
```

## Estado atual

Fase **F0 · Esqueleto** (SPEC §12): ferramentas, estrutura e uma cena de validação
com cubo e órbita. O experimento ainda não existe.

## Licença

Assets de terceiros: veja [`CREDITS.md`](CREDITS.md).
