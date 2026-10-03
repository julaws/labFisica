# Laboratório de Óptica

Um laboratório de óptica interativo em 3D, no navegador, com uma bancada por
experimento na mesma sala. Troque de bancada pelas abas no alto da tela, pelas
setas `←` `→` ou pelo endereço:

| Experimento | Endereço | O que mostra |
|---|---|---|
| **O plano de foco** | `#/lens-focus` | uma objetiva de 50 mm sobre a bancada: gire o anel de foco e veja o plano nítido atravessar um vale em miniatura, os raios convergirem antes, sobre ou depois do vidro fosco, e a imagem invertida se formar com o desfoque que a física manda |
| **A dupla fenda** | `#/double-slit` | um canhão de elétrons de 50 kV contra duas fendas: sem detectores, os elétrons desenham franjas de interferência; com os detectores ligados, ficam duas faixas |
| **A força magnética** | `#/magnetic-force` | um feixe de elétrons numa esfera de vidro entre bobinas de Helmholtz: círculos, hélices e arcos coloridos que mudam em tempo real com o campo, a direção e a tensão; um seletor de velocidades filtra um só |

Cada bancada tem uma placa prateada com as equações do experimento: a das lentes, a de
Schrödinger e as da força magnética.

Só a bancada ativa fica montada, e o código de cada experimento é baixado só
quando ele abre (ADR 0008).

A física vem de um motor próprio em TypeScript puro (`src/optics/`), coberto por
testes; a cena é three.js com materiais PBR, HDRI e pós-processamento.

- Especificação: [`docs/SPEC.md`](docs/SPEC.md)
- Regras de trabalho: [`CLAUDE.md`](CLAUDE.md)
- Fontes de toda fórmula e constante física: [`docs/optics-sources.md`](docs/optics-sources.md)
- Decisões de arquitetura: [`docs/adr/`](docs/adr/)

## O que dá para fazer: o plano de foco

| Ação | Como |
|---|---|
| Focar | arrastar o anel de foco, o slider de distância, ou `1` `2` `3` e `[` `]` |
| Abrir e fechar o diafragma | botões f/2 · f/5,6 · f/16, slider de stops, ou `F` |
| Abrir a objetiva | `X` (montada ↔ explodida; abre explodida) |
| Escolher os raios | caixas Pinheiro · Cabana · Pico no painel (só o pinheiro marcado ao abrir) |
| Trocar a objetiva | Gauss duplo · convergente · divergente no painel, ou `L` |
| Focar numa miniatura | clicar nela, no console da bancada |
| Passear | arrastar para orbitar, botão direito para pan, roda para zoom, `W A S D` e `Q E`, ou a cruz e as setas de zoom no canto inferior direito |
| Câmeras cinematográficas | `C`; `R` volta à vista padrão |
| Esconder a interface | `/` |
| Apresentação | a câmera passeia devagar ao abrir a página e depois de 1 minuto parado; mexer o mouse devolve o controle |
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

A objetiva padrão é um **Gauss duplo de seis elementos, 50 mm f/2**, da patente
americana 2.532.751 (James G. Baker, 1950), com os vidros trocados pelos
equivalentes do catálogo SCHOTT atual (ADR 0005). Dá para trocá-la por uma
lente **convergente simples** (+50 mm, com a aberração esférica medida pelo
traçador) ou **divergente simples** (−50 mm, que não forma imagem real) — ADR 0007.

## O que dá para fazer: a dupla fenda

| Ação | Como |
|---|---|
| Tampar ou abrir cada fenda | caixas Esquerda e Direita, ou `1` `2` |
| Ligar os detectores | Desligados · Ligados no painel, ou `O` (de observar) |
| Esconder o feixe e ver só o padrão | Visível · Só o padrão, ou `V` |
| Trocar a cor do fósforo | verde · ciano · âmbar · violeta · branco, ou `K` |
| Mover o anteparo (1,00 a 1,80 m) | arrastar o anteparo, o slider, ou `[` `]` |
| Mudar a largura do anteparo (24 a 48 µm) | slider Largura ("Mais ajustes" no celular) |

O padrão vem da integral de difração de Fresnel das duas fendas, com o
comprimento de onda de de Broglie relativístico dos elétrons de 50 kV
(λ = 5,36 pm). Sem detector somam-se amplitudes e aparecem ~19 franjas a
0,94 µm uma da outra; com detector somam-se probabilidades e ficam duas faixas.
Transversalmente ao feixe tudo está **10 000× maior** (1 µm vira 1 cm); ao longo
dele, as distâncias são reais. A cor é a do fósforo do anteparo, não do elétron
(ADR 0009). Um monitor no fundo da bancada mostra o anteparo de frente.

## O que dá para fazer: a força magnética

| Ação | Como |
|---|---|
| Mudar o campo (0 a 2 mT) | slider Campo B, ou `[` `]` |
| Girar as bobinas (direção do campo) | slider Giro, `,` `.`, ou `1` `2` `3` `4` (0°, 20°, 90°, 180°) |
| Mudar a tensão do canhão (100 a 500 V) | slider Canhão |
| Energia espalhada ou única | Espalhada · Única, ou `M` |
| Ligar o seletor de velocidades | Desligado · Ligado e a tensão das placas, ou `V` |

As trajetórias são integradas pelo motor (método de Boris relativístico) pelo aparelho
inteiro: canhão, seletor, fenda e câmara. Tudo em tamanho real, com bobinas de 30 cm de
raio e campos reais. A cor é a velocidade do elétron (ADR 0010).

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
configuração: `?focus=370&f=16&lens=exploded&shot=optical-path`, ou
`?shot=screen#/double-slit` para o anteparo da dupla fenda.

## Estrutura

```
src/optics/       física pura, sem three.js: lente fina, Sellmeier, ABCD, traçador,
                  ondas (dupla fenda de Fresnel), campos (força de Lorentz)
src/core/         renderer, loop, câmera, pós-processamento, qualidade, entrada
src/scene/        sala, bancada, materiais, texturas procedurais, escalas, raios
src/experiments/  um diretório por experimento (lens-focus, double-slit, magnetic-force)
src/ui/           HUD, painel, modal, seletor de bancadas, i18n
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
