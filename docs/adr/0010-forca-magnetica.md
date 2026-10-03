# ADR 0010 — Força magnética: bobinas de Helmholtz, hélices e seletor de velocidades

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O pedido: um canhão dispara elétrons numa câmara com campo magnético uniforme e
perpendicular, gerado por bobinas de Helmholtz. As partículas fazem círculos, e o raio muda
com o campo. A bobina gira, para mudar a direção do campo. Sliders em tempo real para a
intensidade e a direção do campo e para a tensão (ddp) do canhão; as partículas desenham
espirais e arcos luminosos coloridos, como numa câmara de bolhas. Um seletor de
velocidades (campos E e B cruzados) filtra uma velocidade antes da curva. Placa dourada
"@juliophisico" e uma placa prateada grande com as equações da força magnética.

## Decisão

### Física (`src/optics/fields/lorentz.ts`)

- Força de Lorentz F = q(E + v × B), integrada pelo **método de Boris relativístico**
  (rotação magnética exata; num campo só magnético a energia se conserva e o círculo não
  espirala para fora). Passo espacial de 0,6 mm.
- Elétron acelerado por U: momento e velocidade relativísticos (correção de 4×10⁻⁴ a 250 V).
- Campo no centro do par de Helmholtz: B = (4/5)^{3/2}·μ₀·N·I/R, μ₀ CODATA 2018.
- Raio de giro r = p·sen θ/(eB), passo da hélice 2π·p·cos θ/(eB), período 2πγm/(eB),
  seletor de Wien v = E/B. Testes em `tests/optics/lorentz.test.ts` e
  `tests/optics/magnetic-apparatus.test.ts`.

### Aparelho (escala 1:1, `src/experiments/magnetic-force/apparatus.ts`)

| Peça | Valor |
|---|---|
| Bobinas de Helmholtz | N = 200, R = 30 cm (0 a 2 mT ↔ 0 a 3,3 A) |
| Câmara de vidro | esfera de 25 cm de raio, gás a baixa pressão |
| Canhão | 100 a 500 V |
| Seletor | placas a 2 cm, 12 cm de comprimento, 0 a 300 V; bobinas próprias de 1 mT; fenda de ±1,5 mm |

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
- **Dispersão didática de energia**: o canhão solta elétrons de 60% a 100% de eU, para o
  seletor ter o que filtrar (um canhão real espalha menos de 1 eV). O controle "Energia:
  única" mostra o caso real.
- Os pontos que andam nas trajetórias são muito mais lentos que os elétrons (2,6 ns por
  volta a 0,5 mT).
- A cor é da **velocidade** (vermelho lento, azul rápido); o brilho é o do gás atravessado.

### Cena

- Rastros (`tracks.ts`): um único `LineSegments2`. Cada recálculo vira um instantâneo;
  quando o campo muda, o anterior esmaece em ~1 s (atributo por segmento lido no shader).
  Arrastar o slider deixa um leque de arcos se apagando. O buffer guarda só os
  instantâneos vivos: parado, desenha só o atual (~40 mil triângulos, 99 draw calls).
- Recálculo no máximo a cada 70 ms durante um arraste; cada um integra ~10 elétrons.
- Seta magenta acima das bobinas, paralela ao eixo delas, gira junto: a direção do campo
  sem cobrir os rastros.
- Elétrons barrados no seletor aparecem fracos, terminando nas placas ou na fenda.
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
| Força magnética | F = qv × B, r = mv/(\|q\|B), v = E/B, eU = ½mv² | em pé no tampo, à direita das bobinas |

## Consequências

- Atalhos: `[` `]` campo, `,` `.` giro, `1` `2` `3` `4` (0°, 20°, 90°, 180°), `V` seletor,
  `M` energia. As setas de troca de bancada passam a contar a partir do destino quando
  apertadas no meio de um voo (com três bancadas, contar da origem dava a volta errada).
- O painel ganhou leitura genérica de unidades nos sliders (`unit`, `decimals`).
