# ADR 0020 — Foguete: Tsiolkovsky e conservação do momento

- **Status:** aceito
- **Data:** 2026-10-07

## Contexto

Quarto experimento da ala nova (ADR 0016). Pedidos: Δv = v_e·ln(m₀/m_f), v_e = I_sp·g₀; o
momento do foguete igual ao levado pelo gás; F = v_e·dm/dt; integração numérica da massa
variável com gravidade e arrasto opcionais, comparada a Tsiolkovsky, com as perdas à mostra;
estágios; cena com o foguete, o jato e a Terra se afastando; painel de momento; gráficos de
velocidade, massa e Δv × razão de massas; modo desafio de chegar à órbita com um orçamento de
massa.

## Decisão

### Física (`src/optics/mechanics/rocket.ts`)

- RK4 no estado (altitude, velocidade, massa, momento do gás, impulso externo, perdas), com o
  passo caindo exatamente no fim de cada queima. Gravidade g₀(R/(R + h))², arrasto ½ρC_dAv² com
  atmosfera exponencial (ρ₀ = 1,225 kg/m³, H = 8,5 km). O chão segura o foguete enquanto o
  empuxo não vence o peso.
- Momento: dp_gás/dt = ṁ(v − v_e); na separação, a estrutura do estágio leva mv. Foguete + gás
  + estágios = impulso das forças externas (zero sem elas).
- Estágios: propelente e estrutura divididos 75/25 (dois) ou 70/22/8 (três); vazão proporcional
  ao propelente de cada estágio (todos queimam pelo mesmo tempo).
- Testes (`tests/optics/rocket.test.ts`): Tsiolkovsky, dobrar v_e dobra Δv, Δv aritmético para
  razões geométricas, estágios somando Δv (e mais que um estágio só), integração = Tsiolkovsky
  com erro < 10⁻⁹ (um e três estágios), momento total zero sem forças externas e igual ao
  impulso externo com elas, v_final = Δv ideal − perdas, perda por gravidade ≈ g·t, empuxo menor
  que o peso.

### O que se vê

- O foguete (1 a 3 estágios, alturas proporcionais ao propelente) na plataforma com a torre; no
  voo, sobe um pouco e paira: quem se mexe é o mundo. A plataforma desce e some; os estágios
  gastos se soltam e caem girando; a chama (cone aceso que tremula) e o jato de partículas, cujo
  comprimento acompanha v_e.
- **A janela do céu** atrás do foguete: um shader com uma câmera perspectiva olhando na
  horizontal a partir da altitude do voo; a Terra é a esfera de raio R intersectada de verdade:
  no chão, horizonte reto e céu azul; subindo, o céu escurece (o ar rarefeito), aparecem as
  estrelas, o horizonte desce acos(R/(R + h)) e se curva, com nuvens, continentes e o limbo azul.
- **Console** com quatro telas: o momento no referencial da Terra (foguete, gás, estágios e o
  que a Terra e o ar levaram — a soma é sempre zero), velocidade × tempo com a curva de
  Tsiolkovsky tracejada (a distância é a perda) e a meta orbital no desafio, massa × tempo com os
  degraus das separações, e Δv × m₀/m_f com o ponto de cada estágio.

### Controles

Propelente (10 a 500 t) e massa seca (0,5 a 60 t), I_sp (200 a 460 s) e vazão (50 a 5000 kg/s),
estágios (1, 2, 3), gravidade e ar, e ações: lançar, voltar à plataforma, "Mostre-me algo bonito"
(três estágios a hidrogênio) e o desafio. Atalhos: `L` lança, `K` volta, `1 2 3`, `G`, `H`,
`[` `]` propelente. O voo é integrado de uma vez e reproduzido acelerado (cerca de 22 s na tela).

### O desafio

Carga de 1 t a 7,8 km/s com gravidade e ar ligados; no máximo 600 t no lançamento, estrutura de ao
menos 8% do propelente e no máximo 6 g. Estrelas pela eficiência (carga/massa inicial): uma na
órbita, duas a partir de 2%, três a partir de 3%.

### Divergências e simplificações

- **Voo vertical**, em uma dimensão: a "órbita" do desafio é só a velocidade de 7,8 km/s. Um
  foguete de verdade faz a curva de gravidade e perde ~1,5 km/s para a gravidade; aqui, subindo
  reto, perde mais (2 a 4 km/s), o que deixa o desafio mais difícil — declarado no modal.
- A vazão é escolhida para o primeiro estágio; os de cima a herdam proporcional ao propelente.
- A carga útil é fixa (1 t), para o desafio ter regra única.

## Consequências

- 47 draw calls. O console só é redesenhado quando algo muda ou durante o voo; o HUD é avisado
  cinco vezes por segundo no voo.
