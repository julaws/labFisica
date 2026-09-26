# Laboratório de Óptica: especificação do projeto

Versão 1.0 · Experimento de validação: **Lente e plano de foco**

---

## 1. Visão geral

Construir um **laboratório de óptica interativo em 3D** para o navegador, no qual cada experimento é montado sobre uma bancada óptica realista, com componentes que o usuário manipula diretamente (girar anéis, deslizar suportes, trocar aberturas) enquanto vê a luz se comportar de acordo com a física correta.

Três pilares, em ordem de prioridade:

1. **Correção física.** Os números e o comportamento qualitativo precisam estar certos. O público inclui gente que conhece óptica a fundo.
2. **Clareza didática.** Cada experimento mostra *o fenômeno invisível* (o plano de foco, o círculo de confusão, a frente de onda), explica em texto curto o que está acontecendo e responde a cada ação do usuário.
3. **Qualidade visual de estúdio.** Materiais PBR, iluminação por HDRI, vidro com transmissão e dispersão, pós-processamento cinematográfico. A estética de referência é descrita em §3.

A plataforma nasce preparada para vários experimentos (§11), mas **a primeira entrega é um único experimento completo**: "Lente e plano de foco", equivalente em escopo ao site de referência e superior a ele em rigor físico.

---

## 2. Referência

Site: https://lens.lab.sael.net/ ("The Plane of Focus — a lens, opened up").

O que ele faz e que devemos igualar:

- Uma objetiva de 50 mm mostrada "explodida" sobre um trilho, com elementos de vidro, anel de foco serrilhado e anel de abertura.
- Um diorama em miniatura (vale com pinheiros, cabana iluminada, montanha nevada) diante da lente.
- Um **plano de foco luminoso** que varre o diorama quando o anel gira, com uma linha brilhante onde o plano corta os objetos.
- Um plano de imagem (vidro/sensor) atrás da lente mostrando a imagem **invertida**, e anéis desenhados sobre ele indicando o tamanho do círculo de confusão de cada objeto.
- Leques de raios saindo de pontos do diorama, atravessando a lente e convergindo antes, sobre ou depois do plano de imagem.
- HUD com foco (cm), abertura (f/N) e zona nítida (cm), e uma frase explicativa que muda com o estado.
- Painel de controles: foco (Primeiro plano / Meio / Fundo + slider de distância), abertura (f/2, f/5.6, f/16), lente (Montada / Explodida).
- Console inferior com tira de miniaturas em diferentes focos e mostradores de íris.
- Atalhos: `1` `2` `3` foco em primeiro plano, meio e fundo · `[` `]` ajuste fino · `F` abertura · `X` montada/explodida · `C` câmeras cinematográficas · `R` resetar vista · `/` esconder interface · arrastar para orbitar · botão direito para pan · roda para zoom · `W` `A` `S` `D` para mover, `Q` `E` para girar.
- Modal "?" com texto didático: onde a foto fica nítida, por que o resto desfoca, o anel de foco, a abertura, por que a imagem sai de cabeça para baixo.

O que devemos fazer **melhor**:

- Motor óptico explícito e testado, com dois modos: lente fina (valores de referência) e traçado real através de uma prescrição de Gauss duplo (mostra aberrações).
- Imagem no sensor gerada por renderização com profundidade de campo **fisicamente derivada** (desfoque por pixel calculado a partir do círculo de confusão real), com bokeh no formato das lâminas do diafragma.
- Abertura contínua (escala de stops completos f/1.4 a f/22) além dos três atalhos.
- Painel "Números" opcional com v, extensão do foco, hiperfocal, limites próximo/distante, magnificação.
- Arquitetura multi-experimento.

---

## 3. Direção visual

### 3.1 Cena

Um estúdio/laboratório escuro, com profundidade:

- **Sala:** paredes grafite-azuladas, piso de concreto polido com reflexo suave (reflexão em espaço de tela ou plano refletor com rugosidade), prateleiras ao fundo com câmeras antigas e objetivas desfocadas pela profundidade de campo da câmera principal.
- **Painéis de parede:** três quadros retroiluminados mostrando o mesmo pinheiro fora de foco, no limite e nítido, com raios desenhados. São os "cartazes" do laboratório. Têm emissão fraca e bordas em azul-ciano.
- **Bancada:** console escuro com cantos chanfrados, faixa de LED embutida, trilho óptico de alumínio anodizado com régua gravada (marcações em mm), carrinhos deslizantes com parafusos de fixação em latão.
- **Lente:** corpo em alumínio preto fosco anodizado, anéis de latão escovado, anel de foco em borracha serrilhada (normal map procedural), escala de distância gravada (textura gerada em canvas), elementos de vidro com transmissão, espessura, IOR do vidro real e leve dispersão, bordas dos elementos pintadas de preto (como em lentes reais). Diafragma com 9 lâminas animadas.
- **Diorama:** bandeja de madeira sobre um carrinho do trilho. Terreno em miniatura com relevo suave, grama estilizada instanciada, pinheiros low-poly com variação de cor, cabana com janelas emissivas quentes, rio ou lago opcional, montanha com neve no topo. Estética de maquete (tilt-shift), cores saturadas porém controladas.
- **Plano de imagem:** placa de vidro fosco (difusora) em moldura, sobre carrinho próprio, atrás da lente. A imagem projetada aparece nela, invertida.
- **Luz:** HDRI de estúdio como ambiente e reflexos; 1 luz principal suave com sombras (PCSS ou VSM); luzes de área retangulares (RectAreaLight) nas faixas do teto; brilho do plano de foco e dos raios via bloom seletivo.

### 3.2 Tokens de design (interface)

| Token | Valor | Uso |
|---|---|---|
| `--ink` | `#0B0F1A` | fundo base, cor de tema |
| `--panel` | `rgba(16, 22, 36, 0.72)` + blur 12 px | cartões e painéis |
| `--line` | `rgba(170, 200, 255, 0.14)` | bordas finas |
| `--text` | `#E6EAF2` | texto principal |
| `--muted` | `#8A94A8` | texto secundário |
| `--focus` | `#7FE3FF` | plano de foco, destaque "nítido" |
| `--brass` | `#C8923A` | latão, estado ativo de botões |
| `--warm` | `#FFB45C` | luz da cabana, "desfocado atrás" |
| `--cool` | `#9C8CFF` | "desfocado à frente" |

Tipografia: uma família sans geométrica com numerais tabulares para todos os valores (sugestão: *Manrope* ou *Sora*, auto-hospedadas). Títulos grandes em peso 800, corpo 400–500. Frases em caixa normal (sentence case), sem rótulos em caixa alta espaçada. Valores numéricos sempre com unidade e sempre com numerais tabulares para não "tremer" durante o arraste.

### 3.3 Layout da interface

```
┌──────────────────────────────────────────────────────────────────┐
│ [Cartão HUD]                                   [Painel controles]│
│  O plano                                        Foco  1 2 3      │
│  de foco                                        [Frente|Meio|Fundo]
│  frase de 2 linhas                              Distância ──●──  │
│  [Foco 60 cm][f/2][Zona 1,9 cm]                 Abertura [f/2 …] │
│  frase dinâmica                                 Lente [Mont|Expl]│
│                                                 [Números] [?]    │
│                        CENA 3D                                   │
│                                                                  │
│ ┌──────────┬─────────────────────────────────────┬────────────┐  │
│ │ íris     │ ◀ miniatura miniatura [ativa] … ▶  │ ○  ◎  ◉    │  │
│ └──────────┴─────────────────────────────────────┴────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

- O console inferior é **parte da cena 3D** (telas embutidas na bancada), não um overlay HTML. As miniaturas são render targets aplicados como textura emissiva nas telas; o clique é detectado por raycast.
- Cartão HUD e painel de controles são HTML sobre o canvas.
- Etiquetas 3D (projetadas na tela) apontam para: "Plano da imagem", "Anel de foco · arraste", "Plano de foco · 60 cm", "Zona nítida · 1,9 cm".
- Celular: painel de controles vira gaveta inferior; HUD compacto; o console 3D continua visível pela câmera padrão ajustada à proporção de tela.

---

## 4. Stack técnica

| Área | Escolha | Observação |
|---|---|---|
| Build | **Vite** + **TypeScript** (strict) | |
| 3D | **three.js** (última versão estável) com `WebGLRenderer` | Projetar para migrar a `WebGPURenderer` depois, sem depender disso agora |
| Pós-processamento | **postprocessing** (pmndrs) | Bloom seletivo, SMAA, AO (N8AO ou SSAO), tone mapping AgX ou ACES, vinheta, grão sutil |
| Câmera | **camera-controls** (yomotsu) | Órbita, pan, dolly suaves, transições entre câmeras cinematográficas |
| Animação | tweens próprios ou **gsap** | Transição montada/explodida, íris, anel |
| Texturas | Procedurais (canvas 2D / shaders) + CC0 opcionais | Compressão **KTX2** (Basis) via `gltf-transform`/`toktx` para qualquer imagem externa |
| Ambiente | HDRI de estúdio CC0 (Poly Haven), pré-filtrado com PMREM | Resolução 1k–2k, formato `.hdr` ou `.exr` |
| UI | TypeScript + CSS puro (sem framework) | Componentes simples, estado centralizado |
| Estado | Store mínima com assinaturas (padrão observer) | Uma fonte de verdade para foco, abertura, modo |
| Testes | **Vitest** (física), **Playwright** (capturas e smoke tests) | |
| Qualidade | ESLint + Prettier | |
| Build único (opcional) | `vite-plugin-singlefile` | Gera um HTML único, no espírito "one HTML lab" do original |

Requisitos do ambiente: Node 20+, git, navegadores do Playwright instalados (`npx playwright install chromium`).

---

## 5. Motor óptico (`src/optics/`)

TypeScript puro, sem three.js, totalmente testado. Unidades: **mm** para distâncias, **nm** para comprimentos de onda.

### 5.1 Convenções

- Objeto à esquerda, luz se propaga no sentido +z. Distâncias de objeto `u` e imagem `v` positivas no caso real (convenção "gaussiana" com sinais explícitos documentados em `docs/optics-sources.md`).
- Parâmetros do experimento 1 (configuráveis): `f = 50 mm`, sensor full-frame `36 × 24 mm`, círculo de confusão admissível `c = 0,036 mm` (valor que reproduz os números do site de referência; tornar ajustável em "Números", com a opção 0,030 mm), aberturas f/1.4 a f/22 em stops completos.

### 5.2 Modelo de lente fina (valores exibidos)

```
1/f = 1/u + 1/v            →  v = f·u / (u − f)
extensão do foco            e = v − f
magnificação                m = −v / u
diâmetro da pupila          D = f / N
hiperfocal                  H = f² / (N·c) + f
limite próximo              Dn = u·(H − f) / (H + u − 2f)
limite distante             Df = u·(H − f) / (H − u)      (∞ se u ≥ H)
zona nítida                 DOF = Df − Dn
círculo de confusão no sensor para um objeto em d, focando em s:
                            b(d) = f² / (N·(s − f)) · |d − s| / d
posição de convergência do objeto d atrás da lente:
                            v_d = f·d / (d − f)
(v_d > v_s → converge atrás do sensor; v_d < v_s → converge à frente)
```

API sugerida:

```ts
interface ThinLensState { f: number; N: number; focusDistance: number; coc: number; sensor: { w: number; h: number } }
imageDistance(f, u): number
focusExtension(f, u): number
hyperfocal(f, N, c): number
dofLimits(f, N, c, s): { near: number; far: number; total: number }
blurDiameter(f, N, s, d): number
convergence(f, s, d): { v: number; side: 'front' | 'on' | 'behind' }
```

### 5.3 Traçado de raios real (modo "Aberrações")

- Traçador sequencial genérico: superfícies esféricas (raio de curvatura, espessura até a próxima, material, semidiâmetro), stop de abertura em superfície definida.
- Refração vetorial pela lei de Snell: `t = η·i + (η·cosθi − cosθt)·n`, com detecção de reflexão interna total e de vinhetagem (raio fora do semidiâmetro é bloqueado).
- Matriz paraxial (ABCD) para calcular EFL, BFL, planos principais e posição das pupilas de entrada e saída.
- Prescrição: um **Gauss duplo clássico ~50 mm f/2** obtido de fonte pública documentada (exemplo de patente ou livro-texto de projeto óptico), escalonado para EFL = 50 mm. Registrar a fonte e a tabela em `docs/optics-sources.md`. Se não houver fonte confiável, usar dois dubletos acromáticos simétricos em torno do stop e documentar isso. **Não inventar números de prescrição.**
- Foco por deslocamento unitário (todo o grupo óptico anda junto), com extensão calculada pelo modelo paraxial da prescrição.
- A geometria 3D dos elementos de vidro (§6.4) é gerada **a partir da mesma prescrição**, para que a lente desenhada seja a lente simulada.

### 5.4 Vidros e dispersão

- Catálogo mínimo com equação de Sellmeier: `n²(λ) − 1 = Σ Bᵢλ² / (λ² − Cᵢ)` com λ em µm.
- N-BK7: B = (1.03961212, 0.231792344, 1.01046945), C = (0.00600069867, 0.0200179144, 103.560653).
- Demais vidros da prescrição: coeficientes tirados do catálogo Schott (ou refractiveindex.info), com fonte registrada.
- Comprimentos de onda de trabalho: F (486,13 nm), d (587,56 nm), C (656,27 nm). No modo "Aberrações", os raios podem ser traçados nas três cores para mostrar aberração cromática.

### 5.5 Formação da imagem

O motor expõe uma função que, para uma profundidade de cena (distância física em mm), devolve o diâmetro do desfoque no sensor. O renderizador do sensor (§6.6) usa isso por pixel. Nada de "blur artístico" desacoplado da física.

### 5.6 Testes de referência (Vitest)

Com `f = 50 mm`, tolerância relativa 0,5% salvo indicação:

| Caso | Esperado |
|---|---|
| `imageDistance(50, 600)` | 54,545 mm (extensão 4,545 mm) |
| `imageDistance(50, 370)` | 57,812 mm (extensão 7,812 mm) |
| `imageDistance(50, 2000)` | 51,282 mm |
| DOF, c = 0,036, s = 600, f/2 | 19,0 mm (590,6 a 609,7) |
| DOF, c = 0,036, s = 370, f/2 | 6,8 mm (366,6 a 373,4) |
| DOF, c = 0,036, s = 600, f/5.6 | 53,3 mm |
| DOF, c = 0,036, s = 600, f/16 | 154,5 mm (532,5 a 687,1) |
| DOF, c = 0,030, s = 600, f/2 | 15,8 mm (592,2 a 608,0) |
| Hiperfocal, c = 0,030, f/2 | ≈ 41 717 mm |
| `blurDiameter(f/2, s=600, d=370)` | 1,413 mm |
| `blurDiameter(f/2, s=600, d=2000)` | 1,591 mm |
| `blurDiameter(f/16, s=600, d=370)` | 0,177 mm |
| Sellmeier N-BK7 em 587,56 nm | n = 1,51680 ± 1e-4 |
| Gauss duplo, EFL paraxial | 50,0 mm ± 0,5% |
| Raio paraxial no eixo passa pelo foco do traçador real | erro < 0,01 mm |
| Raio marginal em f/2 tem aberração esférica longitudinal | valor finito, sinal e ordem de grandeza plausíveis, documentados |

Os dois primeiros valores de DOF com c = 0,036 coincidem com o site de referência (1,9 cm a 60 cm; 0,7 cm a 37 cm), o que serve de validação cruzada.

---

## 6. Experimento 1: Lente e plano de foco

### 6.1 Objetivo didático

Mostrar que uma lente leva **uma única distância** a um ponto perfeito, que essa distância forma um plano no mundo, e que tudo fora dele chega ao sensor como um disco (o círculo de confusão), cujo tamanho depende da distância ao plano e da abertura.

### 6.2 Escalas: física versus didática

A lente real tem 50 mm e o diorama representa objetos entre ~30 cm e alguns metros. Mostrar tudo em escala real é inviável. Regras:

- **Física em mm**, sempre, no motor.
- **Mapa de profundidade do diorama:** posição na cena `z = z₀ + k·ln(d / d_min)`, monotônico, implementado só em `src/scene/scale.ts`. O plano de foco é desenhado na posição mapeada da distância de foco, e os objetos ficam nas posições mapeadas das suas distâncias físicas. Assim, "o plano corta o pinheiro" na cena se e somente se a física disser que o pinheiro está em foco.
- **Lente e sensor ampliados** por um fator constante declarado. Os raios entre lente e sensor são desenhados na escala ampliada, com convergência na posição proporcional a `v_d − v_s`, amplificada por um fator de exagero também declarado.
- Um item no modal "?" chamado **"Sobre as escalas"** explica esses exageros com os fatores exatos. Isso é essencial para credibilidade.

Distâncias físicas padrão dos objetos (configuráveis): pinheiro de primeiro plano **37 cm**, cabana **60 cm**, pico da montanha **200 cm**. Faixa do foco: 30 cm a 10 m, mais posição ∞. O slider de distância usa escala logarítmica.

### 6.3 Estado e controles

Estado central:

```ts
{ focusDistance: number /* mm */, fNumber: number, lensMode: 'assembled' | 'exploded',
  opticsMode: 'thin' | 'real', showNumbers: boolean, cinematic: boolean, uiHidden: boolean, coc: number }
```

Controles (todos alteram o mesmo estado e se sincronizam):

- **Anel de foco 3D:** arrastar gira o anel; a rotação mapeia para distância em escala log, com marcas da escala de distância gravadas no anel coincidindo com o valor real. Os elementos de vidro deslizam no barril (movimento helicoidal visual) conforme a extensão `e`.
- **Slider no painel**, **slider no console 3D** e atalhos `1` `2` `3` `[` `]`.
- **Abertura:** botões f/2, f/5.6, f/16; slider contínuo em stops; tecla `F` cicla. As lâminas do diafragma animam, os mostradores do console refletem a abertura.
- **Lente:** montada ↔ explodida com animação de 0,8 s, easing suave; tecla `X`.
- **Modo óptico:** lente fina ↔ traçado real (no painel "Números").
- **Miniaturas:** clicar numa miniatura do console define o foco para aquela distância.
- `C` alterna câmeras cinematográficas (ao menos 5 enquadramentos com transições), `R` reseta, `/` esconde a UI, `P` estatísticas (dev).

### 6.4 Modelo 3D da lente

- Gerado por código a partir da prescrição (§5.3): cada elemento é um sólido de revolução com as duas curvaturas corretas e a espessura correta (em escala ampliada), com borda cilíndrica preta.
- Material do vidro: `MeshPhysicalMaterial` com `transmission = 1`, `ior` do vidro em 587 nm, `thickness` coerente, `roughness` ≈ 0,02, `dispersion` pequena, `attenuationColor` levemente esverdeada; revestimento antirreflexo sugerido por `iridescence` sutil (reflexo violeta/verde).
- Barril, anéis e carrinhos: PBR metal/rugosidade. Latão escovado com textura de anisotropia procedural; alumínio anodizado preto; borracha do anel com normal map serrilhado procedural.
- Escala de distância gravada no anel de foco: canvas → textura, com números em metros e pés, alinhada à rotação real.
- Diafragma: 9 lâminas curvas modeladas, rotação sincronizada com f/N (área da abertura coerente com D = f/N).
- Modo explodido: elementos e anéis afastados ao longo do eixo sobre suportes individuais no trilho, como no original. Modo montado: tudo dentro do barril, com um corte (cutaway) de 90° para que os elementos continuem visíveis.

### 6.5 Plano de foco e raios

- **Plano de foco:** lâmina vertical translúcida na posição mapeada, com gradiente, borda brilhante e leve animação de "scan". Largura visual da faixa proporcional ao DOF mapeado (mostra a zona nítida como volume, não só como plano).
- **Linha de interseção:** shader nos materiais do diorama que acende uma faixa emissiva `--focus` onde a distância ao plano é menor que a meia-espessura da zona nítida. Implementar via `onBeforeCompile` ou material customizado compartilhado.
- **Raios:** para cada um dos três objetos de referência, um leque de 16–32 raios partindo do ponto do objeto, amostrando o anel da pupila de entrada, atravessando a lente (pelo traçador do modo ativo) e seguindo até o plano de imagem e um pouco além. Cor por objeto (pinheiro `--focus`, cabana `--warm`, pico `--cool`). Partículas percorrem os raios para indicar o sentido da luz. Linhas com `Line2`/`LineMaterial` (espessura em pixels) e bloom.
- **Círculos de confusão no vidro:** anéis desenhados no plano de imagem com diâmetro proporcional a `b(d)`, na mesma cor de cada objeto; o objeto em foco vira um ponto brilhante.
- **Etiquetas 3D** conforme §3.3, atualizadas em tempo real.

### 6.6 Imagem no sensor (o diferencial)

- Uma **câmera virtual** posicionada no centro óptico da lente olha para o diorama, com FOV derivado de sensor 36 mm e `v` atual.
- Renderiza cor + profundidade linear num render target (1024 px no desktop, 512 no celular).
- **Passe de profundidade de campo física:** para cada pixel, converter profundidade de cena → distância física (inverso do mapa de §6.2) → `b(d)` em mm → raio em pixels (`b / 36 mm × largura do RT`). Desfoque por gather com kernel em disco, amostragem em espiral de Vogel, formato da abertura com 9 lâminas (bokeh poligonal suave), tratamento correto de primeiro plano desfocado sobre fundo nítido (separar camadas near/far ou usar scatter-as-gather). Opcional: aberração cromática lateral leve no modo real.
- O resultado é mostrado **invertido** (girado 180°) na placa de vidro atrás da lente, como na física, e **na orientação correta** nas telas do console, com uma legenda "a câmera desvira a imagem".
- **Tira de miniaturas:** 5 renders em focos fixos (ex.: 30 cm, 37 cm, 60 cm, 1,2 m, 2 m) recalculados só quando a abertura muda, com cache. A miniatura cujo foco está mais próximo do atual fica destacada.

### 6.7 Textos didáticos (pt-BR, voz direta e curta)

HUD:

- Título: "O plano de foco"
- Subtítulo: "Todo mundo percebe quando uma foto sai tremida. Quase ninguém viu o plano exato onde ela fica nítida. Gire o anel de foco e veja o plano se mover."
- Frase dinâmica, gerada a partir do estado. Exemplos:
  - "Só o pinheiro está no plano: seus raios se encontram num ponto sobre o vidro. A cabana e o pico chegam como discos e ficam borrados. Zona nítida: 0,7 cm."
  - "Em f/16 o cone de luz afina, todos os discos encolhem e a zona nítida cresce para 15,5 cm."
  - "Foco no infinito: o pico fica nítido e o pinheiro vira um disco de 3,4 mm no sensor."

Modal "?" com seções: Onde a foto fica nítida · Por que o resto desfoca · O anel de foco · A abertura · De cabeça para baixo? · Sobre as escalas · Atalhos. Todas as frases com números devem ler o estado real.

Os valores numéricos na interface usam vírgula decimal e unidades brasileiras (`cm`, `mm`, `m`), com 1 casa para cm e 2–3 para mm.

---

## 7. Arquitetura

```
src/
  main.ts                 bootstrap, registro de experimentos, roteamento por hash (#/lens-focus)
  core/
    renderer.ts           WebGLRenderer, cor, tone mapping, sombras
    loop.ts               loop com delta, pausa quando aba oculta, render sob demanda quando ocioso
    camera.ts             camera-controls + câmeras cinematográficas + WASD/QE
    post.ts               composer (bloom seletivo, AO, SMAA, vinheta, grão)
    quality.ts            níveis de qualidade adaptativos (DPR, sombras, AO, resolução dos RTs)
    store.ts              estado reativo
    input.ts              teclado, arraste de objetos 3D por raycast
    experiment.ts         interface Experiment e registro
    loader.ts             carregamento com progresso ("Polindo o vidro…")
  optics/                 §5 (sem three.js)
  scene/
    lab-room.ts           sala, prateleiras, painéis de parede
    bench.ts              console, trilho, régua, carrinhos
    materials.ts          biblioteca de materiais PBR
    textures/             geradores procedurais (serrilhado, latão escovado, madeira, concreto, gravação)
    scale.ts              mapas física ↔ cena (§6.2)
    labels.ts             etiquetas 3D
    rays.ts               renderizador de raios e partículas, reutilizável
  experiments/
    lens-focus/
      index.ts            implementa Experiment
      lens-model.ts       geometria a partir da prescrição
      diorama.ts
      focus-plane.ts
      sensor-render.ts    §6.6
      console-screens.ts
      copy.pt-BR.ts / copy.en.ts
  ui/
    hud.ts  panel.ts  modal.ts  drawer.ts  i18n.ts  styles.css
tests/
  optics/*.test.ts
e2e/
  shots.spec.ts          capturas: vista padrão, explodida, f/16, foco no fundo, celular
docs/
  SPEC.md  optics-sources.md  adr/
```

Interface de experimento:

```ts
interface Experiment {
  id: string;
  title: Record<Locale, string>;
  setup(ctx: LabContext): Promise<void>;     // cria objetos, assina o store
  update(dt: number, t: number): void;
  ui(): PanelSchema;                          // controles declarativos renderizados por src/ui
  copy(): ExperimentCopy;                     // textos do HUD e do modal
  cameras(): CinematicShot[];
  dispose(): void;                            // libera geometrias, materiais, texturas, RTs
}
```

`LabContext` fornece renderer, cena, sala, bancada, trilho (com API para montar carrinhos em posições), store, biblioteca de materiais, renderizador de raios, etiquetas e o motor óptico. A troca de experimento não recarrega a página nem a sala.

---

## 8. Desempenho e qualidade adaptativa

- Níveis Alto / Médio / Baixo escolhidos por heurística inicial (GPU via `WEBGL_debug_renderer_info` quando disponível, largura de tela, `deviceMemory`) e ajustados em tempo real pelo tempo de quadro médio.
- Orçamento: < 250 draw calls (use `InstancedMesh` para grama, árvores e marcações da régua; mescle geometrias estáticas), < 1,5 M triângulos no Alto.
- Render sob demanda: quando nada muda e a câmera está parada, reduzir a taxa de quadros e manter só as animações de partículas.
- Render targets do sensor e das miniaturas com resolução por nível; miniaturas só se recalculam quando necessário.
- Tempo até o primeiro quadro interativo < 3 s em banda larga; tela de carregamento com progresso real.
- Liberação correta de memória no `dispose` (verificar com `renderer.info`).

---

## 9. Acessibilidade e responsividade

- Todos os controles acessíveis por teclado, com foco visível; `aria-label` nos botões; os valores do HUD numa região `aria-live="polite"`.
- `prefers-reduced-motion`: desliga partículas, câmera cinematográfica e animações de scan; transições viram cortes.
- Contraste AA nos textos sobre os painéis.
- Toque: arrastar com um dedo orbita, pinça dá zoom, arrastar o anel funciona com toque; alvos de toque ≥ 44 px.
- Layout testado em 390 × 844, 768 × 1024, 1440 × 900 e 1920 × 1080.

---

## 10. Critérios de aceite do experimento 1

1. Todos os testes de §5.6 passam.
2. Com foco em 60 cm e f/2 (c = 0,036), o HUD mostra **Zona nítida 1,9 cm**; em 37 cm, **0,7 cm**.
3. Girar o anel move o plano de foco de forma contínua, os vidros deslizam no barril e a linha de interseção acende exatamente nos objetos cuja distância física está dentro da zona nítida.
4. A imagem no sensor está invertida, e o desfoque de cada objeto corresponde visualmente ao anel de CoC desenhado para ele.
5. Em f/16 todos os discos encolhem e a zona nítida cresce, com valores coerentes com a física.
6. Os raios do objeto em foco convergem num ponto sobre o plano de imagem; os demais convergem à frente ou atrás, conforme `convergence()`.
7. Montada/explodida anima sem saltos; todos os atalhos funcionam.
8. 60 fps no nível Alto em GPU de notebook intermediária; ≥ 30 fps no celular no nível Baixo.
9. As capturas do Playwright nas 5 configurações de `e2e/shots.spec.ts` estão sem artefatos visíveis (z-fighting, sombras serrilhadas, halos de bloom estourados, texto sobreposto).
10. O modal "Sobre as escalas" declara os fatores de exagero reais usados.

---

## 11. Roadmap de experimentos (a arquitetura deve prever)

Não implementar agora. Serve para validar que as abstrações de §7 são suficientes.

Óptica geométrica:

- Refração e lei de Snell (tanque de água, laser, transferidor gravado) · Reflexão interna total e fibra óptica · Prisma e dispersão (espectro projetado, Sellmeier) · Lentes espessas e planos principais · Aberrações (esférica, coma, astigmatismo, cromática) com diagramas de spot · Telescópio kepleriano e microscópio composto.

Óptica ondulatória (exigirá shaders de intensidade calculada na GPU):

- Fenda dupla de Young · Rede de difração · Difração de Fraunhofer (fenda, abertura circular, disco de Airy) e critério de Rayleigh · Anéis de Newton · Interferômetro de Michelson · Filmes finos.

Polarização:

- Lei de Malus · Placas de meia onda e quarto de onda (cálculo de Jones, esfera de Poincaré) · Ângulo de Brewster.

Para esses, o motor em `src/optics/` ganhará submódulos `waves/` (fasores, integrais de difração, FFT se necessário) e `polarization/` (matrizes de Jones e Mueller), sempre com testes contra resultados analíticos conhecidos.

---

## 12. Fases de execução

Cada fase termina com: testes passando, typecheck limpo, capturas de tela revisadas, resumo com o que foi feito, pendências e próximos passos, e **pausa para aprovação**.

| Fase | Entrega | Aceite |
|---|---|---|
| **F0 · Esqueleto** | Vite + TS + three.js + postprocessing + camera-controls + Vitest + Playwright + ESLint; `CLAUDE.md` e `docs/` no repositório; cena vazia com cubo e órbita; script de capturas | `npm run dev`, `test`, `shots`, `build` funcionam |
| **F1 · Motor óptico** | §5 completo: lente fina, DOF, CoC, Sellmeier, traçador sequencial, ABCD, prescrição de Gauss duplo documentada | Todos os testes de §5.6; `docs/optics-sources.md` com fontes |
| **F2 · Laboratório** | Sala, bancada, trilho com régua, carrinhos, HDRI, luzes, materiais PBR, texturas procedurais, pós-processamento, qualidade adaptativa | Capturas mostram a atmosfera de §3.1; fps dentro da meta |
| **F3 · Lente** | Modelo gerado da prescrição, materiais de vidro e metal, anel com escala gravada, diafragma animado, montada/explodida com cutaway, arraste do anel | Anel controla o estado; escala gravada coincide com o valor |
| **F4 · Diorama** | Terreno, pinheiros instanciados, cabana com janelas emissivas, montanha, bandeja de madeira, mapa de escala §6.2 | Objetos nas posições mapeadas das distâncias físicas |
| **F5 · Plano de foco e raios** | Lâmina de foco com zona nítida, linha de interseção por shader, leques de raios pelo traçador, partículas, anéis de CoC no vidro, etiquetas 3D | Critérios 3 e 6 de §10 |
| **F6 · Imagem no sensor** | Câmera virtual, passe de DOF físico com bokeh de 9 lâminas, imagem invertida no vidro, telas do console, miniaturas com cache | Critério 4 de §10 |
| **F7 · Interface** | HUD, painel, gaveta mobile, modal com textos, painel "Números", i18n, atalhos, câmeras cinematográficas | Critérios 2, 5, 7 e §9 |
| **F8 · Polimento** | Ajuste fino de luz e materiais, orçamento de desempenho, acessibilidade, reduced motion, tela de carregamento, meta tags e imagem OG | Todos os critérios de §10 |
| **F9 · Publicação** | Build estático, opcional build de arquivo único, deploy (GitHub Pages, Netlify ou Cloudflare Pages), `README.md` e `CREDITS.md` | URL pública funcionando em desktop e celular |

---

## 13. O que não fazer

- Não usar desfoque "de efeito" desacoplado do CoC físico.
- Não inventar coeficientes de vidro ou prescrições; toda constante física tem fonte registrada.
- Não usar modelos ou texturas de terceiros sem licença CC0 registrada.
- Não colocar lógica de física em arquivos de cena ou UI.
- Não usar `localStorage` para estado essencial; no máximo para lembrar preferências (idioma, nível de qualidade), com `try/catch`.
- Não declarar uma fase visual concluída sem abrir e revisar as capturas de tela.

---

## 14. Prompt inicial para o Claude Code

Cole isto na primeira sessão, com `CLAUDE.md` na raiz e este arquivo em `docs/SPEC.md`:

> Leia `CLAUDE.md` e `docs/SPEC.md` por completo. Depois, antes de escrever código, me apresente: (1) um resumo de uma página do que você entendeu do projeto; (2) dúvidas ou pontos da especificação que considere ambíguos ou inviáveis, com sua proposta para cada um; (3) o plano detalhado da Fase F0. Aguarde minha aprovação antes de implementar.
