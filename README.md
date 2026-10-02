# Laboratório de Óptica

Um laboratório de óptica interativo em 3D, no navegador. O primeiro experimento,
**O plano de foco**, abre uma objetiva de 50 mm sobre uma bancada óptica: gire o
anel de foco e veja o plano onde a foto fica nítida atravessar um vale em
miniatura, os raios de cada objeto convergirem antes, sobre ou depois do vidro
fosco, e a imagem invertida se formar com o desfoque que a física manda.

A física vem de um motor próprio em TypeScript puro (`src/optics/`), coberto por
testes; a cena é three.js com materiais PBR, HDRI e pós-processamento.

- Especificação: [`docs/SPEC.md`](docs/SPEC.md)
- Regras de trabalho: [`CLAUDE.md`](CLAUDE.md)
- Fontes de toda fórmula e constante física: [`docs/optics-sources.md`](docs/optics-sources.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/)

## O que dá para fazer

| Ação | Como |
|---|---|
| Focar | arrastar o anel de foco, o slider de distância, ou `1` `2` `3` e `[` `]` |
| Abrir e fechar o diafragma | botões f/2 · f/5,6 · f/16, slider de stops, ou `F` |
| Abrir a objetiva | `X` (montada ↔ explodida) |
| Focar numa miniatura | clicar nela, no console da bancada |
| Passear | arrastar para orbitar, botão direito para pan, roda para zoom, `W A S D` e `Q E` |
| Câmeras cinematográficas | `C`; `R` volta à vista padrão |
| Esconder a interface | `/` |
| Ajuda e "Sobre as escalas" | `?` |

Cada número na tela sai do motor: a zona nítida de **1,9 cm** a 60 cm em f/2, o
disco de **1,41 mm** do pinheiro, o desfoque de cada pixel da imagem no sensor.

## Honestidade sobre as escalas

Três coisas não estão em escala real, e o modal "Sobre as escalas" diz quais e
por quê, lendo os fatores direto do código:

1. A objetiva é desenhada **12× maior**, e o vidro fosco com a imagem mais
   **2×** por cima disso (ADR 0006).
2. A profundidade do diorama é **logarítmica** (30 cm a 10 m numa bandeja de
   85 cm). O plano de foco usa o mesmo mapa, então ele corta um objeto na cena
   exatamente quando a física diz que o objeto está nítido. Os objetos do vale
   são de maquete no tamanho, mas cada um fica na posição da sua distância real.

A objetiva é um **Gauss duplo de seis elementos, 50 mm f/2**, da patente
americana 2.532.751 (James G. Baker, 1950), com os vidros trocados pelos
equivalentes do catálogo SCHOTT atual (ADR 0005).

## Requisitos

- Node 20 ou superior
- Para as capturas: `npm run shots:install` (Chromium do Playwright)

## Começando

```bash
npm install
npm run dev
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento em `localhost:5173` (`P` mostra fps e draw calls) |
| `npm test` | testes unitários do motor óptico e dos textos (Vitest) |
| `npm run shots` | capturas e verificações no navegador em `screenshots/` (Playwright) |
| `npm run build` | build de produção em `dist/` |
| `npm run build:single` | build num único HTML em `dist-single/` |
| `npm run typecheck` / `npm run lint` | TypeScript estrito e ESLint |

As capturas aceitam estado pela URL, útil também para compartilhar uma
configuração: `?focus=370&f=16&lens=exploded&shot=optical-path`.

## Estrutura

```
src/optics/       física pura, sem three.js: lente fina, Sellmeier, ABCD, traçador
src/core/         renderer, loop, câmera, pós-processamento, qualidade, entrada
src/scene/        sala, bancada, materiais, texturas procedurais, escalas, raios
src/experiments/  um diretório por experimento
src/ui/           HUD, painel, modal, i18n
tests/            Vitest
e2e/              Playwright
docs/             SPEC, fontes, ADRs
```

## Publicação

No ar em **https://julaws.github.io/labOptica/**. Cada push na `main` roda
typecheck, lint e testes e publica no GitHub Pages
(`.github/workflows/deploy.yml`).

## Créditos e licenças

O código está sob a licença MIT ([`LICENSE`](LICENSE)). HDRI (CC0), dados de
vidro (CC0) e fontes Outfit e DM Mono (OFL, que continua valendo para as
fontes): veja [`CREDITS.md`](CREDITS.md).
