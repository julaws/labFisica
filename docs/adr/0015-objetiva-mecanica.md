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

## Consequências

- Na alta qualidade, a vista padrão da lente passa de ~300 para ~390 chamadas de
  desenho (5,2 ms por quadro numa RTX 3050); no modo leve, ~190. Peças do mesmo
  material foram fundidas (cubo e pinhão, tampa e haste do manípulo) e os parafusos
  dos blocos saíram.
- `?hq=1` na URL abre em alta qualidade, para capturas e comparações (o padrão é o
  modo leve, ADR 0014).
