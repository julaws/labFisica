# ADR 0005 — Gauss duplo da patente US 2.532.751, objetiva a 12× e barril longo

- **Status:** aceito
- **Data:** 2026-10-01
- **Substitui:** [ADR 0002](0002-prescricao-da-objetiva.md) e [ADR 0003](0003-limite-de-abertura-e-escala-da-lente.md)

## Contexto

O responsável pediu, com a referência (https://sael.net/plane-of-focus/) como modelo:

1. o plano da imagem pelo menos **duas vezes maior**;
2. **mais distância entre o anel de foco e as lentes**, para ver a montagem;
3. lentes **maiores**, com as **bordas da cor do vidro**;
4. um barril **mais comprido e com mais lentes**, como o da referência.

O item 4 não é só visual. A objetiva desenhada é a objetiva simulada (SPEC §5.3): mais
lentes exige outra prescrição, e a SPEC §13 proíbe inventá-la. O ADR 0002 tinha ficado com
quatro elementos justamente por não achar um Gauss duplo citável.

## Decisão

### Prescrição: Gauss duplo de seis elementos da patente US 2.532.751

A patente de James G. Baker (Perkin-Elmer, 1950), já examinada no ADR 0002, foi descartada
na época pelo OCR corrompido. Desta vez a tabela do Exemplo 1 foi lida na **imagem**
escaneada do documento, em duas cópias (desenho e texto) conferidas entre si. É um Gauss
duplo f/2 de seis elementos — o que a SPEC §5.3 pedia desde o começo.

O que a patente não dá foi completado de forma declarada (detalhes em
`docs/optics-sources.md` §6): vidros pelo equivalente SCHOTT mais próximo, diafragma no
meio do espaço central (como no desenho), escala para EFL = 50 mm e diâmetros livres
derivados dos raios marginal (f/2) e principal (10°), limitados pela espessura de borda.

Resultado: EFL 50,000 mm, abertura máxima **f/2** (a nominal), aberração esférica em f/2 de
−0,16 mm (contra −1,88 mm do par de dubletos).

### Bug corrigido no motor: posição das pupilas

Ao dimensionar os diâmetros, as pupilas calculadas pelo `analyze` não batiam com o traçado
real. A condição de imagem do stop usava `A` no lugar de `D` (`d = −B·n′/A` em vez de
`−B·n′/D`). Corrigido, com teste de regressão por raio real. Consequências: a abertura
máxima do par de dubletos era f/1,73, não f/1,76 (ADR 0003); a origem dos leques de raios e
o tamanho da íris para cada f/N mudaram um pouco. Os números do HUD vêm da lente fina e não
mudaram.

### Escala de desenho: 12× (era 6×)

Um fator único em `src/scene/scale.ts`, declarado no modal "Sobre as escalas". Dobra a
placa da imagem e as lentes, como pedido, sem quebrar proporções. Para caber na bancada:

- a folga entre a objetiva e o vale (`DIORAMA_DEPTH.gapScene`) foi de 0,14 para 0,40
  unidade. É um deslocamento aditivo do mapa de profundidade; o plano de foco usa o mesmo
  mapa, então **quem está em foco não muda**;
- a objetiva andou no trilho (marca 850 mm) para centrar o conjunto;
- o espaçamento do modo explodido caiu para 11 mm de física entre elementos.

### Barril longo e anel de foco à frente

O barril avança 26 mm à frente do primeiro vidro, e o anel de foco mora nessa extensão,
longe dos elementos. Os anéis passaram a ser ocos (aro, não disco) e o anel de abertura
virou uma engrenagem de latão no plano do diafragma, como na referência. No modo
explodido, o anel de foco vai para a frente, a engrenagem acompanha a íris ao centro e o
flange vai para trás.

### Bordas da cor do vidro

A SPEC §6.4 pede bordas pintadas de preto, como nas lentes reais. A faixa preta saiu a
pedido: a borda agora é o próprio vidro, fechada pelo perfil do torno, e o brilho de
Fresnel desenha o contorno de cada elemento. Faces mais estreitas que o elemento terminam
num ressalto plano, como no desenho da patente.

### Câmera virtual do sensor

Com a lente a 12× e o vale mais longe, a câmera virtual na pupila de entrada via o vale
pequeno, no meio de um quadro preto. Ela passou a ficar a uma distância fixa da borda
próxima do vale (a mesma de antes). Isso **não mexe no desfoque**: o shader converte a
profundidade em distância física pelo mapa, a partir da origem da objetiva, descontando a
posição da câmera. A câmera só decide o enquadramento; num vale comprimido em escala
logarítmica não existe ponto de vista "fisicamente certo".

## Consequências

- Seis elementos de vidro em vez de quatro, sem faixa de borda: dois vidros a mais e
  quatro faixas a menos. A vista inicial fica em ~226 draw calls no nível Alto.
- Os enquadramentos cinematográficos passaram a mirar peças (centro da lente, placa,
  meio do vale) em vez de múltiplos do tamanho da lente, para sobreviver a uma nova troca
  de escala.
- O par de dubletos continua no repositório, testado, como referência do motor.

## Revisão de 02/10/2026

A engrenagem de latão do anel de abertura foi **removida** a pedido do responsável: era
só decoração (a abertura é controlada pela íris e pelo painel) e ficava no meio da
objetiva, por cima dos elementos. O barril mantém o anel de foco à frente e o flange atrás.
