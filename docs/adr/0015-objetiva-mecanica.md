# ADR 0015 — A objetiva como peça mecânica

- **Status:** aceito
- **Data:** 2026-10-04

## Contexto

O pedido: comparar a objetiva da bancada da lente com a da referência
(sael.net/plane-of-focus), sobretudo no modo explodido, e chegar a uma riqueza de
detalhes e a um brilho parecidos. A referência monta a objetiva como uma peça
mecânica: cada vidro num anel preto, bordas dos vidros acesas em ciano, um brilho
âmbar no diafragma, coroas dentadas de latão nas duas pontas, um pinhão ("helicoide")
engrenado por cima, blocos de latão abraçando as coroas e um botão serrilhado no
trilho.

## Decisão

Tudo é geometria de cena, desenhada para mostrar a montagem; a óptica (vidros,
stop, foco) continua vindo da prescrição e do motor.

- **Células** (`createElementCell`): cada vidro ganha um anel de retenção de alumínio
  anodizado, fino (1,2 a 2,6 mm de física), no meio da borda, com o mesmo diâmetro
  externo para todos. Dois toros finos acesos (ciano, com bloom) desenham a borda do
  vidro. Finas de propósito: entre células vizinhas sobra vão para ver o vidro.
- **Diafragma com carcaça**: duas placas anulares e uma cinta escondem a parte
  recolhida das lâminas; a boca da carcaça é a abertura em f/2, e um aro âmbar
  aceso marca a boca. As lâminas do modelo geométrico (`iris.ts`) varrem até 34 mm do
  eixo, quase o dobro dos vidros: o shader delas descarta o que passa do raio da
  carcaça, que fica do tamanho das células (antes, as lâminas eram um disco preto
  que escondia os vidros no modo explodido).
- **Brilho âmbar**: a segunda luz prática da sala, emprestada (o número de luzes não
  muda), fica no diafragma e acompanha a íris no foco e na explosão.
- **Coroas dentadas** (`gearGeometry`: perfil de dentes trapezoidais extrudado, com
  chanfro): uma de 96 dentes no anel de foco, que gira com ele, e outra na frente do
  flange. Latão usinado acobreado (`MeshPhysicalMaterial` com anisotropia e verniz).
- **Helicoide**: pinhão de 18 dentes engrenado por cima da coroa do anel, num eixo de
  aço; gira ao contrário, na razão dos dentes, quando o foco muda.
- **Blocos de latão** em cima e embaixo de cada coroa e **barras-guia** de aço escuro
  ligando o carro do anel ao flange (esticadas a cada quadro de animação, por
  `BarrelParts.sync`).
- **Manípulo** serrilhado de latão na frente do carrinho.

## Revisão de 04/10/2026: console da referência, luz dourada e crédito

- **Sem células**: os anéis pretos em volta dos vidros (e os aros acesos deles)
  saíram; o contorno dos vidros volta a ser o brilho de Fresnel do próprio vidro.
- **Hastes do modo explodido** param na borda de baixo de cada vidro, em vez de
  atravessá-lo até o eixo.
- **Luz dourada**: na bancada da lente, a luz principal esquenta (0xffcf96, 3,8) e o
  recorte de trás fica âmbar (0xff9640, 3,2) — `LabRoom.setAccent`, só cor e
  intensidade, sem recompilar; ao sair da bancada, a sala volta ao tom padrão. O brilho
  do diafragma ficou mais forte, e uma fileira de LEDs âmbar corre na frente do trilho
  (uma malha instanciada, com bloom).
- **Bancadas mais reflexivas** (todas): verniz liso no corpo (0,5 / 0,14), no tampo
  (0,65 / 0,1) e na mesa óptica (0,55 / 0,12); a faixa de luz do teto se reflete nítida.
- **Console** (`console-screens.ts`), no desenho da referência: a miniatura do foco
  atual ganha uma moldura neon azul com halo (bloom); embaixo da tira, uma régua com
  trilho aceso, um cursor de aço que acompanha o foco (interpolado em escala log entre
  as miniaturas) e setas ‹ › que passam à vizinha; à direita, os três diafragmas de
  atalho (f/2, f/5,6, f/16), clicáveis, com aro dourado e luz embaixo no da abertura
  atual. As miniaturas encolheram de 0,45 para 0,38 m para caber o painel.
- **Crédito** gravado no painel do console, embaixo da régua: "Inspirado em “The Plane
  of Focus” · sael.net/plane-of-focus · @ryansael", e repetido no modal "?" da lente.

- **Mais brilho na bancada da lente** (pedido seguinte): a mesa desta bancada usa
  cópias dos materiais com o dobro de verniz (até 1) e de reflexo do ambiente e o
  verniz duas vezes mais liso; a luminária do teto sobre ela brilha o dobro
  (`LightAccent.ceiling`); os neons do console, os LEDs do trilho e a faixa de LED da
  borda brilham o dobro. As outras bancadas ficam como estavam, e tudo volta ao sair.

## Consequências

- Na alta qualidade, a vista padrão da lente passa de ~300 para ~390 chamadas de
  desenho (5,2 ms por quadro numa RTX 3050); no modo leve, ~190. Peças do mesmo
  material foram fundidas (cubo e pinhão, tampa e haste do manípulo) e os parafusos
  dos blocos saíram.
- `?hq=1` na URL abre em alta qualidade, para capturas e comparações (o padrão é o
  modo leve, ADR 0014).
