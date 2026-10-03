# ADR 0010 — Força magnética: bobinas de Helmholtz e hélices

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O pedido: um canhão dispara elétrons numa câmara com campo magnético uniforme e
perpendicular, gerado por bobinas de Helmholtz. As partículas fazem círculos, e o raio muda
com o campo. A bobina gira, para mudar a direção do campo. Sliders em tempo real para a
intensidade e a direção do campo e para a tensão (ddp) do canhão; as partículas desenham
espirais e arcos luminosos coloridos, como numa câmara de bolhas. Placa dourada
"@juliophisico" e uma placa prateada grande com as equações da força magnética.

A primeira versão tinha também um seletor de velocidades (campos E e B cruzados). Ele
foi **removido a pedido**, junto com a revisão de desempenho descrita no fim.

## Decisão

### Física (`src/optics/fields/lorentz.ts`)

- Força de Lorentz F = q(E + v × B). Na câmara o campo é uniforme e só magnético, e a
  trajetória tem **solução exata**: uma hélice, r(θ) = r₀ + a·θ + u·sen θ + w·(1 − cos θ)
  (`helixPath`). O motor também tem o **método de Boris relativístico** (`traceElectron`)
  para campos quaisquer; os testes conferem que os dois dão o mesmo caminho (menos de
  1 mm em 1,2 m).
- Elétron acelerado por U: momento e velocidade relativísticos (correção de 4×10⁻⁴ a 250 V).
- Campo no centro do par de Helmholtz: B = (4/5)^{3/2}·μ₀·N·I/R, μ₀ CODATA 2018.
- Raio de giro r = p·sen θ/(eB), passo da hélice 2π·p·cos θ/(eB), período 2πγm/(eB).
  O motor mantém `wienSpeed` (v = E/B) e o teste do filtro de Wien, que não dependem do
  experimento. Testes em `tests/optics/lorentz.test.ts` e
  `tests/optics/magnetic-apparatus.test.ts`.

### Aparelho (escala 1:1, `src/experiments/magnetic-force/apparatus.ts`)

| Peça | Valor |
|---|---|
| Bobinas de Helmholtz | N = 200, R = 30 cm (0 a 2 mT ↔ 0 a 3,3 A) |
| Câmara de vidro | esfera de 25 cm de raio, gás a baixa pressão |
| Canhão | 100 a 500 V |

Padrão: 250 V e 0,5 mT, círculo de 10,7 cm para o elétron mais rápido. O feixe corre
15 cm abaixo do centro e sai de um tubo interno quase no meio da esfera, como num tubo de
feixe fino (Teltron): o círculo inteiro cabe no vidro e volta ao canhão.

As bobinas giram em torno do eixo vertical: 0° põe o campo perpendicular ao feixe
(círculo), inclinado vira hélice, 90° é paralelo (reta, v × B = 0), 180° inverte o sentido.

### Simplificações declaradas no modal

- O campo é **uniforme dentro da esfera e nulo fora** (o par de Helmholtz é uniforme a
  poucos por cento nessa região).
- O **tubo interno é blindado** (mu-metal): o campo só age quando o elétron sai dele. Sem
  isso, um tubo de 14 cm dentro do campo desviaria o feixe para a parede antes da saída.
- **Dispersão didática de energia**: o canhão solta elétrons de 60% a 100% de eU (cinco
  desenhados), para mostrar lado a lado como o raio depende da velocidade (um canhão real
  espalha menos de 1 eV). O controle "Energia: única" mostra o caso real.
- Os pontos que andam nas trajetórias são muito mais lentos que os elétrons (2,6 ns por
  volta a 0,5 mT).
- A cor é da **velocidade** (vermelho lento, azul rápido); o brilho é o do gás atravessado.

### Cena

- Rastros (`tracks.ts`): ver "Desempenho" abaixo. Cada recálculo vira um instantâneo; quando
  o campo muda, o anterior esmaece em ~0,5 s. Arrastar o slider deixa um leque de arcos se
  apagando.
- Seta magenta acima das bobinas, paralela ao eixo delas, gira junto: a direção do campo
  sem cobrir os rastros.
- Terceira estação da sala (`STATION_X = [-4,3; 0; 4,3]`, sala de 15 m). O canhão virou
  componente compartilhado (`src/scene/electron-gun.ts`), com o texto da placa configurável.

### Placas de equações (as três bancadas)

`src/scene/equation-plate.ts` e `src/scene/textures/equation.ts`: placa de prata escovada
com tinta preta e um diagramador mínimo de fórmulas em canvas (frações, expoentes, índices,
vetores com seta), sem dependência nova. Cada experimento monta a sua e a remove ao sair.

| Bancada | Placa | Onde |
|---|---|---|
| Lente e foco | 1/f = 1/u + 1/v, m = −v/u, N = f/D | em pé no canto frontal direito do tampo: o vidro da imagem ocupa o tampo de frente a fundo e a bandeja do vale a frente à esquerda; ali ela não cobre a imagem na vista padrão |
| Dupla fenda | equação de Schrödinger | a lateral frontal inteira, abaixo da faixa de LED |
| Força magnética | F = qv × B, r = mv/(\|q\|B), T = 2πm/(\|q\|B), eU = ½mv² | em pé no tampo, à direita das bobinas |

## Consequências

- Atalhos: `[` `]` campo, `,` `.` giro, `1` `2` `3` `4` (0°, 20°, 90°, 180°), `M` energia. As setas de troca de bancada passam a contar a partir do destino quando
  apertadas no meio de um voo (com três bancadas, contar da origem dava a volta errada).
- O painel ganhou leitura genérica de unidades nos sliders (`unit`, `decimals`).

## Desempenho (revisão de 02/10/2026)

A bancada travava: 30 fps parada na vista geral, 15 fps no close da câmara, e quadros de
2,4 a 4,3 s ao mexer no campo (medido com GPU, RTX 3050, Direct3D 11). Três causas, cada
uma medida antes de corrigir:

1. **Reescrever vértices a cada mudança.** Os rastros eram polilinhas (`LineSegments2`)
   reescritas a cada recálculo. No Direct3D, via ANGLE, essa reescrita parava a GPU: 1,2 s
   na primeira, ~250 ms nas seguintes (sem reescrever, o travamento sumia). Agora a
   geometria das linhas é **fixa**: o vertex shader avalia a hélice exata do motor a partir
   dos parâmetros de cada elétron, guardados numa textura de dados de 6 × 30 texels. Mudar
   o campo só troca esses números. Os pontos que andam também são posicionados no shader.
   (Uniforms em array com índice dinâmico, o caminho óbvio, viraram 130 ms por quadro no
   Direct3D; a textura com `texelFetch` não custa nada.)
2. **Quadrados gigantes no bloom.** Passagens do pós-processamento com material substituto
   (máscara do bloom seletivo, profundidade) usam o atributo `position` direto. Nas linhas
   instanciadas ele guardava o canto do quad, e cada uma das milhares de instâncias virava
   um quadrado de 1 × 2 m sobreposto: 33 ms por quadro. O canto foi para `aCorner`, e
   `position` fica zerado (triângulos de área nula).
3. **Vidro caro.** A esfera usava material físico com verniz; agora é material padrão
   transparente, com menos polígonos.

Também: seletor removido (peças, física e controles), 5 elétrons em vez de 9, recálculo no
máximo a cada 120 ms. Resultado: **16,7 ms por quadro (60 fps) parada e mexendo no campo,
na vista geral e no close, sem nenhum quadro longo.**
