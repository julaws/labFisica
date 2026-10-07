# ADR 0017 — Buraco negro: a luz que dá voltas

- **Status:** aceito
- **Data:** 2026-10-07

## Contexto

Primeiro dos quatro experimentos da ala nova (ADR 0016): um buraco negro com lente
gravitacional. Pedidos: geodésicas nulas de Schwarzschild traçadas numericamente pela
equação orbital d²u/dφ² = −u + 3Mu²; horizonte (2M), esfera de fótons (3M), sombra
(b_c = 3√3 M) e anel de Einstein com fonte, lente e observador alinhados; comparação com o
campo fraco (α ≈ 4M/b, θ_E); céu estrelado distorcido; disco de acreção opcional com Doppler;
massa, distância do observador, posição da fonte, câmera orbitando e visões realista e
didática.

## Decisão

### Física (`src/optics/gravity/schwarzschild.ts`)

- Unidades geométricas por dentro (G = c = 1, comprimentos em M = GM/c²); massas solares e
  km nas bordas (GM☉/c² = 1,4766 km).
- Runge–Kutta de 4ª ordem em φ para (u, du/dφ), passo encolhendo perto do horizonte; captura
  em u ≥ 1/2; a saída (u = 0) é achada por Newton sobre o próprio passo.
- Raio vindo do infinito (parâmetro b) ou saindo de um observador parado em r com ângulo ψ:
  b = r·sen ψ/√(1 − 2M/r).
- Raio angular da sombra (Synge): sen ψ = b_c√(1 − 2M/r)/r, maior que 90° dentro da esfera de
  fótons. Anel de Einstein **exato** para a fonte no infinito atrás do buraco negro: o ψ cujo
  raio chega a φ = π (bissecção); anéis relativísticos em φ = (2n + 1)π. Campo fraco:
  θ_E = √(4M·D_LS/(D_L·D_S)).
- Disco fino de Shakura–Sunyaev (T ∝ r^(−3/4)(1 − √(r_in/r))^(1/4), borda de dentro na ISCO,
  6M) e o desvio g = √(1 − 3M/r)/(1 − Ωλ) de um gás em órbita kepleriana.
- Testes (`tests/optics/schwarzschild.test.ts`): deflexão → 4M/b quando b cresce (com o termo
  de 2ª ordem 15π/4·(M/b)²), 1,75″ para a luz rasante ao Sol, captura para b < b_c e escape
  para b > b_c, a borda achada por bissecção igual a 3√3 M, a sombra vista de longe = b_c/r,
  a borda da sombra igual à da captura, meio céu na esfera de fótons, anel exato → campo
  fraco, anel relativístico colado à sombra, desvios do disco.

### O que se vê

- **A esfera de vidro** (à esquerda), num pedestal de latão: um "universo de bolso". Cada pixel
  é uma geodésica traçada **da câmera real** na placa de vídeo (`tracer.ts`, o mesmo
  integrador em GLSL). Orbitar a câmera em volta da bancada é orbitar o buraco negro. A esfera
  mostra uma região de 300 km de raio: mais massa, buraco negro maior.
- **O telescópio** (o monitor à direita): o que um observador parado à distância escolhida vê,
  olhando para o centro, com o disco inclinado. A estrela-fonte fica na direção oposta,
  deslocada de (β_x, β_y) no céu dele: alinhada, vira o anel de Einstein. Campo de 64°.
- **Céu**: mapa equirretangular desenhado uma vez na placa de vídeo (Via Láctea com bojo,
  nuvens e poeira; estrelas numa grade 3D de direções, do tamanho do texel), filtrado por
  mipmap com as derivadas de tela da direção final (sem serrilhado onde a lente comprime o
  céu).
- **Disco de acreção**: opaco, mais transparente na borda de fora (20 M), com turbulência que
  gira à velocidade kepleriana de cada raio. Cor do corpo negro em g·T, brilho ∝ (gT)⁴: o lado
  que vem é mais claro e mais azul. A imagem do lado de trás do disco aparece por cima e por
  baixo da sombra.
- **Visão didática**: a esfera troca o traçado pelo diagrama em 12 M de raio (fixo): horizonte,
  esfera de fótons, círculo do raio crítico, disco e um leque de raios paralelos vindos da
  esquerda — capturados em laranja, desviados em ciano e o crítico em dourado, dando voltas
  —, com fótons andando por eles. No telescópio, círculos da sombra, do anel exato e do anel de
  campo fraco (tracejado), com a legenda embaixo da tela.

### Controles

Massa (1 a 30 M☉, log), distância do telescópio (100 a 5000 km, log) e a altura dele sobre o
disco (secundário), estrela de fundo (horizontal e vertical, ±12°), visão realista ou
didática, disco ligado ou desligado e presets ("Mostre-me algo bonito", "Anel de Einstein",
"Bem pertinho" — dentro da esfera de fótons — e "Disco de cima"). Atalhos: `[` `]` massa, `-`
`=` distância, `I J K L` estrela, `O` alinha, `X` disco, `V` visão.

### Simplificações declaradas (modal "Sobre os tamanhos")

- Buraco negro sem rotação (Schwarzschild, não Kerr); observadores parados.
- A esfera é uma janela: o resto do laboratório não sofre a lente.
- Disco fino e opaco; as cores (um disco estelar brilha em raios X) foram trazidas para o
  visível (pico de 4300 K) e a rotação desacelerada (uma volta na ISCO em 5 s).

### Desempenho

O traçado custa por pixel: 150, 200 ou 260 passos e passo em φ de 0,055, 0,042 ou 0,032 rad
conforme o nível de qualidade, e o telescópio em 512, 768 ou 960 px de largura. 46 draw calls
no SwiftShader.

## Consequências

- Quinta estação ativa na ala nova. O painel começa minimizado: aberto, cobriria o monitor.
