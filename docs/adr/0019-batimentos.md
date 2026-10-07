# ADR 0019 — Batimentos e sintetizador

- **Status:** aceito
- **Data:** 2026-10-07

## Contexto

Terceiro experimento da ala nova (ADR 0016). Pedidos: dois osciladores f₁ e f₂ e a identidade
sen(2πf₁t) + sen(2πf₂t) = 2cos(π(f₁ − f₂)t)·sen(π(f₁ + f₂)t); a ligação entre tempo, espectro e
fasores; osciloscópio com a envoltória, analisador de espectro em tempo real (AnalyserNode) e
fasores girando; controles de f₁ e f₂ com resolução fina (batimentos de 0,5 a 20 Hz),
amplitudes, forma de onda, volume e teclado virtual; presets de afinação de violão,
intervalos e batimento lento.

## Decisão

### Física (`src/optics/acoustics/beats.ts`)

Formas de onda de amplitude 1 (senoidal, quadrada, dente de serra, triangular), soma das
vozes, |f₁ − f₂| e o período, a identidade soma-produto, a envoltória com amplitudes
diferentes √(A₁² + A₂² + 2A₁A₂cos 2πΔf t), a **medição** do batimento num sinal amostrado (o
máximo de |s| por período da portadora e as descidas da envoltória), os harmônicos de Fourier
de cada forma, os pares de harmônicos que batem (|p·f₁ − q·f₂| < 25 Hz), o temperamento igual e
os ângulos dos fasores. Testes (`tests/optics/beats.test.ts`): identidade a 10⁻¹⁰, batimento
medido = |f₁ − f₂| com erro < 1%, envoltória, série de Fourier da quadrada, quinta temperada
batendo a 0,745 Hz entre 3f₁ e 2f₂ (e a justa, a zero).

### O que se vê e ouve

- **Sintetizador** com dois botões que giram com as frequências e LEDs que pulsam com a
  envoltória; **alto-falante** cujo cone acompanha a envoltória.
- **Osciloscópio**: f₁ e f₂ em trilhas pequenas e a soma grande, coluna a coluna com o mínimo e o
  máximo do sinal (com muitos ciclos por coluna vira a faixa de um osciloscópio de verdade); a
  envoltória tracejada em dourado (ondas senoidais). Janela "batimento" (dois batimentos
  inteiros) ou "ondas" (seis ciclos da portadora).
- **Espectro**: linhas teóricas dos harmônicos de cada voz e, por cima, o espectro medido ao vivo
  pelo AnalyserNode (FFT de 16384 pontos), com uma lupa nas duas fundamentais separadas por Δf.
- **Fasores**: os dois vetores no referencial da frequência média, ponta com cauda, e a
  resultante; acima de 1,5 batida por segundo, em câmera lenta declarada na tela.
- **Teclado** de uma oitava (lá 3 a lá 4, temperado), clicável: a tecla define f₂.

### Áudio

Dois `OscillatorNode` (limitados em banda) com ganhos próprios, mistura a 0,22, analisador antes
do volume (o espectro é medido mesmo com o alto-falante mudo) e o barramento seguro da ADR 0016.
O áudio só é criado no primeiro controle mexido; o som começa mudo, e ligado cala a música de
fundo.

### Controles

Oscilador 1 (55 a 1760 Hz, log), desafinação de f₂ (±20 Hz, 0,01 Hz), intervalo (uníssono,
terça, quarta, quinta e oitava, razões justas), amplitudes, forma de onda, som, volume, janela do
osciloscópio e presets ("Mostre-me algo bonito", "Afinar o violão", "Quinta do piano", "Oitava
desafinada", "Batimento lento"). Atalhos: `-` `=` f₁, `,` `.` desafinação, `0` zera, `T` forma
de onda, `M` som, `Z` janela. O painel começa minimizado: aberto, cobriria as telas.

### Divergência

f₂ não tem um slider absoluto próprio: é o intervalo (ou a tecla) mais a desafinação fina. Um
slider de 55 a 1760 Hz não daria a resolução de 0,01 Hz pedida para os batimentos lentos; assim
f₂ cobre a mesma faixa e ganha a resolução fina.

## Consequências

- 59 a 65 draw calls. As três telas são canvas redesenhados a cada quadro (texturas menores no
  nível Baixo).
