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

- A sala tem uma **estação** por experimento (`STATION_X` em `src/scene/lab-room.ts`; três
  desde a ADR 0010), cada uma com sua
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

### Transição entre bancadas (revisão de 02/10/2026)

A primeira versão desmontava a bancada atual, montava a outra e soltava o
`setLookAt` suave do camera-controls: a mola dispara a toda velocidade e cobre os ~6 m
num tranco, e a tela parava antes do voo. Medido com GPU (RTX 3050, Direct3D 11), ida da
lente para a dupla fenda: **1,8 s** de tela parada compilando shaders e mais **3,6 s**
depois do pouso. O segundo travamento vinha da lâmpada da cabana: tirar uma `PointLight` da
cena muda o número de luzes e o three recompila **todos** os materiais.

Agora a troca é em etapas (`mount` em `src/main.ts`):

1. **Pré-carregamento**: o experimento novo é montado na bancada dele com o atual ainda
   na tela. Um quadro antes do trabalho deixa a aba marcada aparecer.
2. **Voo** (`src/core/station-flight.ts`): curva com aceleração e desaceleração em seno,
   2,6 s, num arco que recua e sobe no meio do caminho (as duas mesas aparecem juntas). O
   relógio é o de parede, então o voo dura o mesmo numa máquina lenta. As luzes de destaque
   acompanham; HUD e painel trocam com um esmaecimento; as etiquetas somem durante o voo.
   Arrastar a câmera interrompe o voo.
3. **Saída**: o experimento antigo continua animado até o pouso e só então é desmontado.
   Um pedido de troca no meio do voo é atendido quando ele termina.

Para nada compilar na hora:

- **Guardião de programas** (`src/core/program-keeper.ts`): para cada material, uma cópia
  leve (texturas e geometria trocadas por vazias com os mesmos parâmetros da chave) presa
  a um objeto mínimo, numa cena nunca desenhada. Compiladas num render target, como o
  pós-processamento desenha a cena, e com uma variante do material de profundidade por
  tipo de objeto, as cópias têm a mesma chave que os originais e o programa sobrevive à
  saída do experimento.
- **Pré-aquecimento** na tela de carregamento ("Preparando as outras bancadas…"): cada
  outro experimento é montado, compilado, guardado e desmontado. O tempo até a página
  ficar pronta não mudou de forma mensurável (~6 s localmente): os shaders do experimento
  inicial, que antes compilavam nos primeiros quadros, agora compilam ali também.
- **Luzes práticas da sala** (`LabRoom.borrowPointLight`): luzes pontuais fixas, apagadas
  quando livres. A lâmpada da cabana é emprestada, e o número de luzes da cena nunca muda.

- **Desenho prévio da bancada de destino** (com três bancadas, ADR 0010): antes do voo, a
  cena é desenhada uma vez pela cadeia inteira de pós-processamento, com a câmera no
  enquadramento de destino, e a câmera volta na mesma tarefa — o navegador só apresenta o
  último desenho. Compila as variantes das passagens de profundidade e normais e envia as
  texturas grandes (placas de equações) antes do movimento, e não quando a bancada entra
  no quadro no meio do voo.

Resultado medido (GPU, três bancadas): nenhum quadro acima de 17 ms durante os voos; o
único quadro longo, de 100 ms, é a montagem do vale, parada, antes de a câmera se mexer. Com
`prefers-reduced-motion`, a troca é um corte seco.

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
