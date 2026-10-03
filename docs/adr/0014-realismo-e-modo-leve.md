# ADR 0014 — Realismo da bancada, retratos nítidos e modo leve

- **Status:** aceito
- **Data:** 2026-10-03

## Contexto

Três pedidos: os retratos da parede estavam muito desfocados vistos da sala; a
bancada e os objetos dos experimentos deviam parecer mais realistas (rugosidade,
contraste, reflexos, sombras); e um botão no canto inferior esquerdo devia desligar a
alta qualidade, para computadores e celulares fracos.

## Decisão

### Retratos nítidos

O desfoque vinha da profundidade de campo da câmera: o foco fica na bancada, a parede
está ~2 m atrás e o desfoque chegava ao máximo em 2,2 m (`focusRange`), com
`bokehScale` 3,2. Agora o desfoque cresce até 7 m e tem teto de 1,6: a parede fica só
levemente suave, com os retratos e as placas legíveis, e o fundo distante ainda
ganha o ar de estúdio.

### Bancada e objetos

- **Mesa óptica** sobre o tampo de cada bancada: uma placa de alumínio anodizado com
  furação roscada em grade, como nos laboratórios de óptica (passo de 25 mm na escala
  do trilho), recuada 5 cm da borda. As texturas são procedurais
  (`breadboardMaps`): cor com manchas de uso, rugosidade com marcas de pano e fundo
  dos furos fosco, normal map com o chanfro dos furos e um grão fino. A face de cima é
  a altura de trabalho (`topY`); o tampo da bancada desceu a espessura da placa.
- **Corpo da bancada** em pintura eletrostática: casca de laranja no normal map e
  rugosidade manchada (`powderCoatMaps`), com verniz; o tampo em volta da mesa é um
  laminado fenólico mais escuro (`benchTop`).
- **Alumínio anodizado e aço** com microrrelevo de jateamento (`beadBlastNormal`,
  repetido 8 vezes por face), verniz e mais reflexo do ambiente: acabamento acetinado
  em vez de plástico liso.
- **Luz principal** mais alta e à direita (x + 1,6; 3,4; 1,7 m): as sombras das peças
  caem sobre a mesa óptica à vista da câmera e assentam os objetos. Sombra VSM um
  pouco mais firme (raio 4).
- **Oclusão ambiente (SSAO)** mais forte e de raio curto, para a sombra de contato sob
  as peças, e um pouco de **contraste** depois do tone mapping AgX, que achata os
  pretos.

### Modo leve

- Botão "Alta qualidade" no canto inferior esquerdo, com uma chave liga/desliga (no
  celular, só o ícone e a chave). Desligado, entra o modo leve
  (`LIGHTWEIGHT_SETTINGS`): o nível Baixo sem sombras, bloom, SSAO e profundidade de
  campo, sem a luz de área do teto (com o preenchimento reforçado) e sem os detalhes
  de superfície dos materiais (normal maps, mapas de rugosidade, verniz, anisotropia).
  O ajuste automático de qualidade não sai do modo leve sozinho. A escolha fica no
  `localStorage` e vale já na próxima visita.
- Medido na bancada da força magnética (RTX 3050): 2,8 ms → 0,9 ms por quadro e 203 →
  57 chamadas de desenho.
- A troca recompila os shaders. Feita no quadro seguinte, travava a tela por ~2,7 s.
  Agora o loop para (fica o último quadro na tela) e os shaders compilam em paralelo
  com `compileAsync` — **com o render target do pós-processamento ativo**, porque a
  cena é desenhada nele (saída linear, sem tone mapping) e essas variantes de shader
  são outras. A primeira troca leva no máximo ~0,3 s; as seguintes, um quadro.

## Consequências

- A mesa óptica e os mapas novos custam pouco no modo normal (texturas de 512 px,
  cacheadas e compartilhadas).
- `MaterialLibrary.setDetail` só alcança os materiais da biblioteca; materiais
  próprios de um experimento ficam como estão no modo leve.
