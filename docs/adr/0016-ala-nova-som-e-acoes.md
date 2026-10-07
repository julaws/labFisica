# ADR 0016 — A ala nova: oito bancadas, som dos experimentos e botões de ação

- **Status:** aceito
- **Data:** 2026-10-07

## Contexto

O responsável pediu quatro experimentos novos: buraco negro com lente gravitacional, figuras
de Chladni, batimentos com sintetizador e foguete (Tsiolkovsky e conservação do momento).
Eles devem ser indistinguíveis dos atuais na arquitetura e no acabamento. Três necessidades
não tinham onde morar:

1. **Lugar na sala.** A sala de 18 m comporta quatro bancadas (ADR 0011).
2. **Som.** Chladni e os batimentos tocam a frequência escolhida. Só a música de fundo usava
   áudio (`HTMLAudioElement` com um `GainNode`).
3. **Presets.** Cada experimento ganha botões "mostre-me algo bonito", "espalhar a areia",
   "lançar". O painel declarativo só tinha controles com estado (slider, segmentado, chave).

## Decisão

### A ala nova

- `STATION_X` passa a ter oito estações, a 4,2 m de passo: as quatro antigas no mesmo lugar e
  quatro novas à direita (10,5 a 23,1 m). A sala vai de −9 a 25,8 m.
- A estante e a galeria de retratos continuam atrás das quatro primeiras bancadas, nas mesmas
  posições. Atrás de cada bancada nova, um **cartaz retroiluminado** desenhado em canvas
  (`src/scene/textures/wing-posters.ts`): o buraco negro com o disco, uma figura de Chladni
  calculada pixel a pixel, um osciloscópio com batimentos e um foguete sobre a Terra. Uma
  textura e uma malha para os quatro.
- O concreto do piso mantém o tamanho do desenho: o u da textura cresce com a largura.
- O seletor no alto rola quando as abas não cabem entre o HUD e o painel, com as pontas
  esmaecidas, e a aba ativa vai para o centro. No celular nada muda (só a atual entre as
  setas).

### Som dos experimentos (`src/core/audio.ts`)

- `LabContext.audio` (opcional, como os outros campos novos): um barramento Web Audio com
  limitador (`DynamicsCompressor` a −12 dBFS, 20:1, 3 ms) e teto de ganho 0,5.
- O `AudioContext` só é criado em `ensure()`, chamado no clique do botão de som: nada soa
  antes de um gesto, e todo experimento com som começa **mudo**.
- `setActive(dono, sim)`: enquanto um experimento soa, a música de fundo se cala (o mesmo
  `setSuspended` do vídeo). O vídeo explicativo, ao abrir, também cala o barramento.

### Botões de ação no painel

Novo tipo de controle `actions`: uma fileira de botões, cada um chama `set(id, valor)` uma
vez. `accent` destaca o preset-surpresa em latão. É extensão da interface (regra 11): os
experimentos antigos não mudam.

## Consequências

- O voo entre a primeira e a última bancada cobre 29 m nos mesmos 2,6 s.
- O pré-aquecimento da tela de carregamento passa a montar sete bancadas.
- Os experimentos novos ficam em `src/experiments/{black-hole,chladni,beats,rocket}/` e a
  física em `src/optics/{gravity,acoustics,mechanics}/`, com testes.
