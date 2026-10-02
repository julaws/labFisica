# ADR 0007 — Troca de objetiva: Gauss duplo, convergente e divergente

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O responsável pediu para "trocar as lentes de côncavas para convexas" e ver o traçado dos
raios e a formação da imagem mudarem. A objetiva não é toda côncava: o Gauss duplo tem
quatro elementos convergentes e dois meniscos divergentes, e o conjunto é convergente.
Apresentadas as opções (trocar a objetiva inteira ou virar elemento por elemento), a
escolhida foi **trocar a objetiva inteira** por um seletor.

## Decisão

### Três objetivas, todas de |f| = 50 mm

| Objetiva | Prescrição | Forma imagem? |
|---|---|---|
| Gauss duplo | patente US 2.532.751 (ADR 0005) | sim, quase sem aberração |
| Convergente | biconvexa simples de N-BK7, +50 mm | sim, com aberração esférica forte |
| Divergente | bicôncava simples de N-BK7, −50 mm | não: imagem virtual |

As lentes simples ficam em `src/optics/prescriptions/singlets.ts`: simétricas, com o raio
achado por bissecção sobre a EFL da lente espessa (detalhes em `docs/optics-sources.md`
§8). A mesma |f| torna a comparação limpa: o Gauss duplo e a convergente têm o mesmo
foco, a mesma zona nítida e os mesmos círculos de confusão — **só a aberração muda**.

### O sensor é o corpo da câmera: ele não se mexe

A placa fica parada na posição de uma objetiva de 50 mm focada no infinito. Cada objetiva
é montada com o plano principal traseiro a 50 mm dela; focar estende a objetiva, como numa
câmera real. A divergente não tem para onde estender — não forma imagem real em lugar
nenhum — e fica em casa.

Com o sensor parado, o desfoque passa a ter a forma geral

    b = D · |p − v_d| / |v_d|,   D = |f| / N

com `p` a distância do plano principal ao sensor (`plateBlurDiameter` em
`thin-lens.ts`). Na convergente focada, `p = v_s` e a fórmula é exatamente a de sempre
(teste). Na divergente, `v_d` é negativo (imagem virtual, à frente da lente) e todo ponto
do vale chega ao sensor como um disco maior que o próprio sensor (~50 mm em f/2).

### Aberração esférica medida, não estimada

`aberrationSpotDiameter` traça raios reais pela prescrição em f/N e procura o plano de
menor feixe (o círculo de menor confusão). Em f/2: Gauss duplo 0,022 mm (abaixo do círculo
admissível de 0,036 mm), biconvexa 0,706 mm (20×). A biconvexa só fica nítida a partir de
f/5,6 (0,028 mm). O borrão cresce com o cubo da abertura, como a aberração de terceira
ordem (teste).

Ele entra:

- na **imagem do sensor**, somado em quadratura ao desfoque de cada pixel;
- na **frase do HUD** e no painel "Números", quando passa do círculo admissível;
- no modal, na seção nova "Trocar a objetiva".

Aproximações declaradas: o borrão é o de um objeto no infinito, na linha d, no eixo, e vale
para todas as distâncias. Os leques de raios continuam paraxiais (o cone na placa segue
batendo com o anel de CoC, critério 4); a aberração aparece na imagem e nos textos, não no
desenho dos raios.

### Lente divergente

- Os raios saem abrindo, na direção oposta à imagem virtual; um traço apagado liga a
  saída da lente à imagem virtual, de onde eles "parecem" vir.
- Sem imagem real não há plano de foco, zona nítida nem anéis de CoC: a lâmina, a faixa
  acesa no vale, as etiquetas e os anéis somem; os chips de foco e zona mostram "—".
- A imagem no sensor vira luz espalhada: quando o disco passa muito do que o kernel
  amostra, a cor vai para a média da cena.

### Interface

- Grupo novo "Objetiva" no painel (Gauss duplo · Convergente · Divergente), tecla `L`.
- No celular, para o painel não crescer, "Montada / Explodida" foi para "Mais ajustes"
  (continua na tecla `X`).
- O barril, os anéis e a íris são os mesmos nas três; só os vidros trocam. O barril tem
  o diâmetro da maior objetiva.

### Correções no motor

`widestFNumber` e `withFNumber` usavam a EFL com sinal; numa divergente davam número f e
pupila negativos. Passaram a usar |EFL|. `pupilDiameter` também.

## Consequências

- O motor ganhou o caso divergente de ponta a ponta, coberto por testes
  (`tests/optics/lens-swap.test.ts`).
- O orçamento de draw calls não muda: trocar a objetiva troca malhas, não acrescenta.

## Revisão de 02/10/2026: a divergente acompanha o anel

A pedido do responsável, a lente divergente deixou de ficar parada. O anel de foco é uma
rosca mecânica, gravada para uma objetiva de 50 mm; girá-lo leva **qualquer** objetiva pelo
mesmo curso, `v(s) − 50` dessa objetiva (`ringExtension` em `thin-lens.ts`). Na divergente
a lente anda, o sensor se afasta dela, e o desfoque muda — mas nenhuma posição do anel leva
um ponto a um ponto: em todas, cada objeto do vale chega ao sensor como um disco maior que
o próprio sensor (teste em `lens-swap.test.ts`). A frase do HUD diz isso com a posição atual
do anel.
