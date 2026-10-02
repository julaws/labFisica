# ADR 0008 — Várias bancadas na mesma sala, um experimento ativo por vez

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O responsável quis um segundo experimento (a dupla fenda) e perguntou se ele deveria
ganhar uma página nova ou uma bancada ao lado, alternada por um comando na tela. A
recomendação aceita foi a segunda: o laboratório é um lugar, e andar até a outra
bancada é mais fiel a essa ideia do que trocar de página.

O risco é o desempenho (SPEC §8: menos de 250 draw calls). Os dois experimentos montados
ao mesmo tempo passariam do orçamento, e o celular sofreria.

## Decisão

### Estações fixas, um experimento montado

- A sala tem duas **estações** (`STATION_X` em `src/scene/lab-room.ts`), cada uma com sua
  bancada e seu trilho. As bancadas vazias custam poucos draw calls e ficam sempre na sala.
- Só **um** experimento fica montado por vez. Trocar de experimento desmonta o atual
  (`dispose`: carrinhos saem do trilho, etiquetas, atalhos, arrastes e brilhos são
  removidos) e monta o outro na bancada dele.
- As luzes de destaque (`room.focusOn`) e a câmera voam até a estação ativa.

### Registro com carregamento sob demanda

`createExperimentRegistry` (`src/core/experiment.ts`) guarda, para cada experimento, o id,
o título, a estação e um `load()` com `import()` dinâmico. Quem abre o laboratório na lente
não baixa o código da dupla fenda, e vice-versa.

### Endereço por hash

- `#/lens-focus` e `#/double-slit` abrem direto a bancada certa; o hash acompanha a troca
  (`history.replaceState`), então dá para compartilhar o link de cada experimento.
- `hashchange` (voltar e avançar do navegador) troca de bancada.
- Sem hash, abre o primeiro registrado (a lente).

### Seletor na tela

`createStationSwitcher` (`src/ui/station-switcher.ts`): abas com o nome de cada
experimento e setas, no alto e ao centro no desktop e no rodapé no celular (some quando a
gaveta de controles está aberta). `←` e `→` fazem o mesmo pelo teclado. O título da aba do
navegador acompanha o experimento.

### O que é do laboratório e o que é do experimento

Continuam do laboratório, criados uma vez: sala, bancadas, HUD, modal, cruz de navegação,
câmera cinematográfica e atalhos gerais (`LAB_SHORTCUTS`). São do experimento: o que ele
pendura no trilho, o painel (recriado a cada troca a partir de `ui()`), os chips do HUD
(o HUD remove os que o experimento novo não declara) e os atalhos próprios, que entram e
saem com ele. Um experimento lista os seus atalhos em `copy().shortcuts`.

## Consequências

- Orçamento medido: lente com 246 draw calls na vista padrão; dupla fenda com 159 (GPU) e
  101 no SwiftShader do Playwright. Trocar de bancada duas vezes devolve a contagem de
  geometrias e texturas da GPU ao mesmo valor (sem vazamento).
- Um terceiro experimento precisa só de uma estação nova em `STATION_X`, uma entrada no
  registro e o módulo em `src/experiments/<id>/`.
- Parâmetros de URL (`?focus=`, `?f=`, `?lens=`, `?shot=`) valem para o experimento aberto;
  os que ele não entende são ignorados.
