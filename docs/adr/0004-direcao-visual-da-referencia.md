# ADR 0004 — Direção visual alinhada à referência

- **Status:** aceito
- **Data:** 2026-09-30
- **Fase:** pós-F9 (redesenho visual)

## Contexto

Com o laboratório publicado, o responsável pediu que o experimento ficasse
"mais bonito e visualmente parecido" com a referência
(https://sael.net/plane-of-focus/), **sem mexer na lógica, na física nem nas
opções de configuração**.

Comparando as duas lado a lado, na mesma resolução e com GPU, as diferenças eram
de direção de arte, não de conteúdo:

- a referência tem luz quente e contrastada, latão alaranjado, vidro com borda
  ciano brilhante, um vale de cores vivas com céu pintado ao fundo e a sala
  desfocada pela câmera;
- a interface dela é mais leve: título solto sobre a cena, valores em fonte
  mono, rótulos pequenos em caixa alta, um cartão de controles compacto;
- o enquadramento inicial é lateral, com a bancada inteira e o console na face
  frontal dela.

Três pontos dessa direção contrariam a letra da SPEC §3.2 e §3.3.

## Decisão

Adotar a direção visual da referência. As divergências da SPEC ficam
registradas aqui:

1. **Tipografia.** A SPEC sugere Manrope ou Sora. Passam a valer **Outfit**
   (títulos e texto) e **DM Mono** (valores e rótulos técnicos), as famílias da
   referência, ambas OFL e auto-hospedadas (CREDITS.md). O requisito de fundo da
   SPEC — numerais que não tremem durante o arraste — continua atendido, agora
   pela largura fixa da DM Mono.
2. **Rótulos em caixa alta.** A SPEC pede "sem rótulos em caixa alta espaçada".
   Os rótulos de grupo do painel e dos valores ("FOCO", "ZONA NÍTIDA") passam a
   ser em caixa alta pequena, como na referência. Títulos e frases continuam em
   caixa normal.
3. **Estado ativo dos botões.** A SPEC usa `--brass` para o estado ativo. Passa
   a ser branco com texto escuro, como na referência; o latão fica para a cena.

O resto da SPEC continua valendo, inclusive o que ela já previa e ainda não
estava feito: a **profundidade de campo da câmera principal** (SPEC §3.1), que
desfoca a sala e mantém a bancada nítida. Ela é um efeito de câmera, separado do
desfoque físico da imagem no sensor (SPEC §6.6), que continua saindo do círculo
de confusão.

Mudanças de cena que são só de aparência, sem efeito na física:

- luz principal mais quente, luz de recorte fria por trás, ambiente mais forte;
- latão mais escuro e fosco, com menos reflexo do HDRI (lava para bege sob as
  caixas de luz do estúdio);
- brilho de Fresnel ciano na borda dos elementos de vidro, no próprio material;
- cores do vale mais vivas e um céu pintado no fundo da bandeja. O céu fica além
  da marca de 10 m do mapa de profundidade, então a câmera virtual o desfoca
  pelo círculo de confusão dessa distância, como qualquer outro objeto;
- telas do console numa faixa horizontal na face frontal da bancada;
- vista inicial lateral, com variante em diagonal para telas em retrato.

## Consequências

- O orçamento de draw calls (SPEC §8) ficou apertado com o céu, o painel do
  console e os passes da profundidade de campo. Malhas estáticas de mesmo
  material foram mescladas (moldura da placa, trilho, carrinho, pedestal,
  janelas, montanha e neve, cabana, cartazes, luminárias) e a legenda do console
  foi gravada na textura do painel: no nível Alto, a vista inicial caiu de 305
  para cerca de 240 draw calls.
- A profundidade de campo da câmera só roda nos níveis Alto e Médio.
- Os rótulos e o estado ativo divergem da SPEC §3.2 por decisão registrada; se a
  SPEC for revisada, este ADR é a fonte.
