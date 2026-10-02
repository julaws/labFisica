# ADR 0009 — Dupla fenda com elétrons: geometria, física e escalas

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O pedido: um canhão de elétrons apontado para uma dupla fenda, com tampa em cada fenda e
um detector em cada uma. Com os detectores ligados, o anteparo mostra **duas faixas
luminosas** (comportamento corpuscular); desligados, **várias franjas** de interferência.
Controles: detectores, tampas, cor do feixe, feixe visível ou não (só o padrão), e ajuste
leve da distância e do tamanho do anteparo. Placa dourada "@juliophisico" no canhão.

A dificuldade física: no regime de Fraunhofer (anteparo muito longe), ligar os detectores
dá a soma de dois padrões de fenda única quase sobrepostos — **uma** faixa larga, não
duas. Mostrar duas faixas exige o anteparo perto o bastante para cada fenda projetar a
sua (regime de Fresnel), mas longe o bastante para haver muitas franjas sem detector.

## Decisão

### Física (`src/optics/waves/double-slit.ts`)

- **Comprimento de onda de de Broglie relativístico**, constantes CODATA 2018:
  `λ = h / √(2·m·e·V·(1 + e·V/(2·m·c²)))`. A 50 kV (a tensão de Jönsson, 1961),
  λ = 5,3553 pm e v = 41,3% de c.
- **Difração de Fresnel de fendas longas**, unidimensional:
  `U(X) = (1/√2)·{[C(w₂) − C(w₁)] + i·[S(w₂) − S(w₁)]}`, `w = (x − X)·√(2/(λL))`,
  normalizada para que uma abertura infinita dê |U| = 1. Vale perto e longe das fendas.
- **Detectores desligados**: `I = |U₁ + U₂|²` (há interferência).
  **Ligados**: `I = |U₁|² + |U₂|²` (informação de caminho; o termo cruzado some).
  Tampar uma fenda zera a amplitude dela.
- Integrais de Fresnel por tabela (Simpson cumulativo, passo 1/2000, até 8) e expansão
  assintótica acima disso (Abramowitz e Stegun 7.3.27–28). Fontes em
  `docs/optics-sources.md` §9.
- Cada elétron cai num ponto sorteado da distribuição calculada (`sampleFromPattern` e a
  CDF do experimento); com detector, sorteado no padrão **da fenda por onde passou**.

### Geometria escolhida

| Grandeza | Valor | Por quê |
|---|---|---|
| Tensão | 50 kV | a de Jönsson; λ = 5,36 pm |
| Largura da fenda a | 1,2 µm | número de Fresnel ~0,2 a 1,4 m |
| Separação d | 8 µm | d ≫ a: faixas separadas com detector |
| Distância L | 1,40 m (1,00 a 1,80) | ~19 franjas sem detector e duas faixas com detector |
| Anteparo | 36 µm (24 a 48) | cabe o padrão inteiro |

Com detector a 1,40 m: duas faixas em ±4,2 µm, com o vale entre elas a 39% do pico. Sem
detector: franjas a λL/d = 0,94 µm. Afastar o anteparo leva ao padrão clássico de
Fraunhofer, mais claro no meio: o slider de distância mostra a transição.

### Escalas (declaradas no modal "Sobre as escalas e a cor")

- **Transversal ao feixe: 10 000×** (1 µm vira 1 cm). Fendas, padrão e anteparo.
- **Ao longo do feixe: 1:1.** O anteparo a 1,40 m está a 1,40 unidade de cena das fendas.
- **A onda desenhada** entre as fendas e o anteparo usa `λ_cena = M²·λ ≈ 0,54 mm`: com a
  ampliação transversal M, é o único comprimento de onda que faz as linhas escuras dela
  chegarem às franjas escuras do anteparo desenhado. Os pulsos que andam nela e a
  velocidade dos elétrons são só visuais.
- **A cor** não é do elétron: é a do fósforo do anteparo (os reais são verdes, P31) e a do
  desenho do feixe. Cinco opções: verde, ciano, âmbar, violeta, branco.

### Cena

- Canhão (tubo com bobinas de latão e placa dourada "@juliophisico · Canhão de elétrons ·
  50 kV"), placa das fendas (tampas de latão que deslizam para o lado, bobinas detectoras
  com LED que pisca a cada elétron detectado) e anteparo de fósforo, cada um num carrinho
  do trilho.
- O anteparo mostra o padrão como exposição longa e os impactos de cada elétron, que se
  apagam em ~1,5 s. O brilho segue uma **curva de exposição de alto contraste,
  brilho ∝ I²** (como um filme fotográfico), declarada no modal: com resposta linear, a
  gama da tela mostra o vale de 39% entre as duas faixas como ~65% de brilho e as faixas
  parecem uma só; uma curva saturante seria pior ainda, achatando as franjas, que fora do
  meio têm contraste baixo. A referência é fixa no máximo das duas fendas abertas sem
  detector: tampar uma fenda escurece o anteparo. O anteparo e o monitor ficam fora do
  bloom, que espalharia o brilho sobre o vale e as franjas finas. Mudar a geometria para
  afundar o vale foi descartado: com as faixas mais separadas, sobra pouca sobreposição e
  as franjas do modo ondulatório ficam fracas.
- **Monitor no fundo da bancada** com a mesma imagem do anteparo, de frente: o anteparo
  fica de perfil para quem olha a bancada, e é no monitor que as franjas se leem. É o que
  se faz nos experimentos reais (uma câmera filma o fósforo).
- "Só o padrão" esconde feixe, halo, onda e impactos; fica só a distribuição no anteparo e
  no monitor.

### Controles

Fendas (caixas Esquerda e Direita, `1` `2`), detectores (`O`, de observar — `D` já é da
câmera), feixe visível ou só o padrão (`V`), cor do fósforo (`K`), distância do anteparo
(slider, arrastar o anteparo, `[` `]`) e largura do anteparo (slider; em "Mais ajustes" no
celular).

## Consequências

- O texto não diz que "observar destrói a onda" de forma mística: diz que o detector
  registra o caminho e que, com essa informação, o termo de interferência some.
- Todo número do HUD, dos números e do modal vem do motor (`electronWavelength`,
  `electronSpeedFraction`, `fringeSpacing`, `fresnelNumber`, `countMaxima`).
