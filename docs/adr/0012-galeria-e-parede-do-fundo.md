# ADR 0012 — Galeria de retratos, enfeites e a parede do fundo mais perto

- **Status:** aceito
- **Data:** 2026-10-03

## Contexto

O pedido: seis quadros no fundo da sala, três de cada lado da estante, com fotos reais
em preto e branco de Newton, Einstein, Schrödinger, Heisenberg, Planck e Dirac, cada um
com uma placa dourada de nome e anos; enfeites de física na prateleira do meio (átomo,
foguete, telescópio, globo); e a parede da estante pelo menos duas vezes mais perto das
bancadas.

## Decisão

### A parede do fundo

A sala deixa de ser simétrica em z: a parede do fundo vai de z = −5,5 m para
**z = −2,9 m**, e a da frente fica em +5,5 m, atrás de todas as câmeras. A traseira das
bancadas está em z = −0,5 m: a distância até a parede cai de 5,0 m para **2,4 m**, e a
estante fica a ~1,9 m delas. As luminárias do teto vão para z = −0,2 m, para a ponta não
atravessar a parede; o quadro lateral da galáxia e o do átomo acompanham o fundo.

### Os retratos (`src/scene/portrait-wall.ts`)

- **Fotos reais, de domínio público** (Wikimedia Commons), registradas em `CREDITS.md`.
  A regra do projeto pede CC0; domínio público não tem direito autoral nenhum e cumpre a
  mesma exigência. Newton morreu em 1727, 112 anos antes da primeira fotografia: o dele é
  o retrato pintado por Godfrey Kneller em 1689, também em preto e branco.
- As seis fotos foram recortadas, passadas para tons de cinza e montadas num **atlas
  3 × 2** com o passe-partout já desenhado (um JPEG de 290 KB). Uma malha desenha as seis.
- Moldura preta laqueada com filete de latão, luminária de quadro por cima e a placa
  dourada embaixo (a mesma arte do selo @juliophisico, agora em atlas: as seis placas
  numa textura). Nascimento e morte: Newton 1643 – 1727 (calendário gregoriano),
  Einstein 1879 – 1955, Schrödinger 1887 – 1961, Heisenberg 1901 – 1976,
  Planck 1858 – 1947, Dirac 1902 – 1984.
- A parede do fundo quase não recebe luz; as fotos e as placas têm um pouco de emissão,
  como se a luminária as acendesse, sem custar uma luz real por quadro.

### Os enfeites (`src/scene/shelf-decor.ts`)

Na prateleira do meio, no lugar das câmeras antigas: globo com meridiano de latão,
telescópio no tripé, átomo com três órbitas acesas, foguete, pêndulo de Newton e ímã em
ferradura. Tudo procedural; as peças pintadas são uma malha só, com a cor em cada
vértice, mais uma de latão, uma de cromo e uma acesa (bloom).

## Revisão de 03/10/2026: quadros clicáveis, Marie Curie e a parede ainda mais perto

- **Quadros clicáveis.** Clicar num quadro o faz sair da parede para a frente da tela,
  grande e nítido, com um texto curto embaixo: os avanços do cientista e a ligação com
  as bancadas (`ui/portrait-copy.ts`, em português e inglês). Clicar de novo na imagem
  (ou no fundo, ou Esc) o devolve. O quadro na tela é HTML, fora da cena 3D e do
  desfoque, com as mesmas proporções do 3D, e parte do retângulo do quadro projetado pela
  câmera (uma transformação só, FLIP); enquanto ele está fora, a foto some da moldura
  na parede. A foto ampliada (660 × 880) só é baixada no clique; até chegar, o ladrilho
  do atlas, já baixado pela cena, faz as vezes dela.
- **Clique sem roubar a órbita.** O núcleo de entrada ganhou `registerClickable`: um
  toque curto (menos de 6 px e 600 ms) é clique, e arrastar continua orbitando. O
  clique só vale se o primeiro objeto opaco no caminho do raio for o quadro: um
  equipamento na frente não o abre. O cursor vira lupa sobre os quadros.
- **Marie Curie** entra como o quarto quadro à direita da estante (x = 6,15 m), com a
  placa 1867 – 1934. O atlas passa a 4 × 2.
- **A parede ainda mais perto**: z = −1,6 m, a 1,1 m da traseira das bancadas (a estante
  a meio metro delas). Os quadros e os enfeites ficam maiores na vista padrão e muito
  menos desfocados. As luminárias do teto encurtam para 3,6 m (de −1,5 a 2,1 m em z) e
  ganham um pouco de intensidade (1,9 → 2,2) para a bancada receber a mesma luz.

## Consequências

- Os textos dos cientistas citam números do motor (λ = 5,36 pm a 50 kV, 5,48 pm sem a
  correção relativística); se o motor mudar, os textos precisam acompanhar.
- Nove malhas a mais na sala (cinco da galeria, quatro dos enfeites); as bancadas seguem
  dentro do orçamento de draw calls, a 60 fps.
- As placas da força magnética: o modo `columns` do diagramador passa a pôr o título em
  cima, centrado, e as equações lado a lado embaixo, como nas outras placas.
