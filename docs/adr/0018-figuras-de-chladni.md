# ADR 0018 — Figuras de Chladni: a areia desenha os nós

- **Status:** aceito
- **Data:** 2026-10-07

## Contexto

Segundo experimento da ala nova (ADR 0016). Pedidos: placa quadrada com as autofunções
aproximadas u = cos(nπx/L)cos(mπy/L) − cos(mπx/L)cos(nπy/L) e placa circular com
J_n(kr)·cos(nθ), declarando o modelo idealizado; areia que recebe agitação proporcional a
|u| e se acumula nos nós; ressonâncias reconhecidas, com padrão difuso entre elas; controles
de frequência com sintonia fina, modo (n, m), formato, quantidade de areia, espalhar de novo e
varredura; som com mudo.

## Decisão

### Física (`src/optics/acoustics/chladni.ts`)

- **Quadrada** (24 cm, aço de 0,8 mm): as autofunções pedidas, com X = x + L/2 (bordas livres
  de inclinação, ∂u/∂n = 0) e n ≠ m. Satisfazem ∇²u = −k²u, k² = (π/L)²(n² + m²).
- **Circular** (raio 12 cm): J_n(kr)·cos(nθ) com a borda nodal, k = j_{n,s}/a. Bessel pela
  integral de Bessel (trapézio, convergência exponencial) e zeros por bissecção; tabelas de 1024
  pontos por modo.
- **Frequências** da placa fina de Kirchhoff: ω = k²√(D/ρh), D = Eh³/12(1 − ν²). Com o aço,
  f_nm = 33,2·(n² + m²) Hz.
- **Resposta forçada**: um oscilador amortecido por modo (Q = 60), todos excitados com a mesma
  força (simplificação declarada); amplitude complexa normalizada para 1 no pico. Em
  ressonância (o modo dominante com metade do pico ou mais) o desenho é limpo; entre elas,
  modos fracos e fora de fase se misturam e a placa quase não se mexe.
- **Areia**: o grão pula só onde a amplitude passa de um limiar (a placa acelerando mais que
  a gravidade), com salto gaussiano proporcional ao excesso; reflete nas bordas. Os grãos param
  onde a placa não se mexe — as linhas nodais.
- **Linhas nodais** do modo quadrado: metade das trocas de sinal ao longo da borda; na
  circular, n diâmetros e s − 1 círculos.
- Testes (`tests/optics/chladni.test.ts`): Bessel e zeros tabelados, (n, m) e (m, n) só trocam
  o sinal, diagonais nodais, ∇²u = −k²u, borda livre, frequências, ressonância e
  não-ressonância, areia concentrada onde |u| é pequeno, nenhum grão sai da placa.

### O que se vê

- Placa de aço pintada de preto fosco (a areia clara contrasta), desenhada 3,5× maior, sobre a
  haste de um excitador eletromecânico; a vibração aparece em câmera lenta e ampliada.
- Até 40 mil grãos numa nuvem de pontos (um draw call), com a altura da placa embaixo de cada
  um. A vibração e a areia leem uma grade de 97 × 97 do deslocamento complexo, refeita só
  quando a frequência muda.
- Gerador de funções com visor (frequência, modo, linhas nodais, barra de ressonância, som e
  varredura) e cabo até o excitador.

### Controles

Frequência (30 a 4000 Hz, log) e sintonia fina (±20 Hz), modo n e m (vai direto à ressonância
daquele modo), placa quadrada ou redonda, areia (5 a 40 mil, secundário), som (começa mudo),
varredura (uma oitava a cada 6 s, parando 3,5 s em cada ressonância) e ações "Mostre-me algo
bonito" (a mandala do modo (4, 3) da placa redonda), modo anterior e seguinte e espalhar a areia.
Atalhos: `[` `]` modo, `-` `=` frequência, `,` `.` sintonia fina, `F` placa, `B` areia, `M` som,
`N` varredura.

### Som

Oscilador senoidal na frequência real (30 a 4000 Hz são audíveis: não há escala), mais alto na
ressonância, pelo barramento seguro (ADR 0016). Ligar o som cala a música de fundo.

## Consequências

- 39 draw calls no SwiftShader. A areia custa ~2 ms por passo na CPU com 40 mil grãos.
