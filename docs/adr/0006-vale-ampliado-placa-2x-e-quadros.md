# ADR 0006 — Vale ampliado, plano da imagem 2× e quadros na sala

- **Status:** aceito
- **Data:** 2026-10-02

## Contexto

O responsável pediu:

1. montanha, cabana e árvores **3× maiores**, com mais detalhe;
2. o céu mais perto da montanha, e a montanha mais perto das árvores;
3. o plano de projeção **2× maior** (largura e altura);
4. um quadro de **átomo** na parede direita e um de **galáxia** na esquerda;
5. as miniaturas do console **3× maiores**.

Os itens 1 e 3 encostam na física e precisaram de decisões.

## Decisão

### Objetos 3× maiores, no mesmo lugar

Os objetos crescem (`OBJECT_SCALE = 3` em `diorama.ts`), mas **cada um continua na
posição mapeada da sua distância física** (37 cm, 60 cm, 2 m): o tamanho é de maquete, a
posição é física. A bandeja ficou mais larga (0,52 → 0,80) para caber o bosque.

Os modelos foram refeitos com mais detalhe, todos como malhas de facetas com cor por
vértice (uma malha por objeto, sem draw call a mais):

- **montanha:** cone de 16 × 40 facetas com cristas, dois ombros secundários, rocha em
  tons variados, linha de neve irregular e grama na base;
- **pinheiro:** tronco e cinco camadas de galhos de borda recortada, mais escuras por
  baixo;
- **cabana:** fundação de pedra, paredes de toras alternadas, cantos reforçados, telhado de
  duas águas com beiral, cumeeira, chaminé, porta, degrau e quatro janelas acesas;
- **pedras** espalhadas, numa malha instanciada.

### Vale mais curto: céu e montanha mais perto

O céu já fica na marca de 10 m, e não dava para trazê-lo mais perto sem ele mentir sobre a
distância. O que encurta todas as distâncias de uma vez é **o próprio mapa**: a bandeja
passou de 1,15 para 0,85 unidade de cena (`DIORAMA_DEPTH.spanScene`). O mapa só fica mais
comprimido; a ordem e "quem está em foco" continuam exatamente os mesmos, porque o plano
de foco usa o mesmo mapa. A declaração do modal "Sobre as escalas" é gerada do valor e se
atualizou sozinha. O bosque passou a se concentrar do meio para o fundo, em volta da
montanha.

### Plano da imagem 2× maior

Dobrar a lente outra vez (24×) faria o barril passar de um metro. Em vez disso, a placa e
tudo o que se desenha nela ficam **2× maiores que a escala da lente**
(`IMAGE_PLANE_MAGNIFICATION` em `scale.ts`, declarado no modal):

- a placa, a imagem projetada e os anéis de círculo de confusão;
- a chegada dos cones: cada raio sai da lente no lugar de sempre e mira o ponto da placa
  com altura 2× a original. Os raios de um objeto continuam se encontrando num ponto só,
  do mesmo lado da placa, e o cone cruza a placa com exatamente 2× o `b(d)` do motor —
  o anel e o cone continuam concordando (critério 4). O que fica ampliado é a distância
  entre a placa e o ponto onde o cone se fecha, o exagero de `v_d − v_s` que a SPEC §6.2
  prevê, desde que declarado. Testado em `tests/optics/lens-model.test.ts`.

### Correções que apareceram no caminho

- **Saída dos leques de raios:** os raios saíam pela pupila de saída, que no Gauss duplo
  fica 9 mm à frente do plano principal traseiro, e o cone chegava ~13% mais estreito que o
  anel. Agora eles saem pelo plano principal traseiro, de onde a lente fina mede `v`.
- **Altura da imagem:** era a do raio principal pela lente desenhada, que não é o centro de
  projeção da câmera virtual; o ponto de convergência do cone caía longe do objeto na
  imagem projetada. Agora ela usa a magnificação `−v/u` com `u` medido da câmera virtual: o
  cone de cada objeto se fecha em cima do próprio objeto na placa.
- **Orientação da imagem na placa:** a textura era invertida nos dois eixos depois de um
  giro que já trocava um deles; a imagem saía espelhada em relação aos cones. Agora sai
  girada 180°, como num vidro fosco real, do mesmo lado dos raios.

### Câmera virtual do sensor

Com a montanha 3× mais alta, a câmera virtual se afastou do vale (`SENSOR_STANDOFF`
0,24 → 0,74) para o quadro do sensor pegar do pé da cabana ao pico. Como antes, a posição
só decide o enquadramento; o desfoque sai da distância física pelo mapa.

### Console e quadros

As miniaturas foram de 0,15 × 0,10 para 0,45 × 0,30 (3×), e a tela principal acompanha.
A faixa ocupa a frente da bancada, centrada nela. As miniaturas passaram a usar metade da
resolução do sensor, para não ficarem borradas no tamanho novo; continuam no cache por
abertura.

Os quadros do átomo e da galáxia são desenhados em canvas (nada de imagem externa), com a
mesma moldura e o mesmo filete ciano dos cartazes. As duas artes ficam lado a lado numa
textura só e os dois quadros são uma malha só.

## Consequências

- No nível Alto, a vista inicial fica em ~243 draw calls e ~390 mil triângulos, dentro do
  orçamento (250 e 1,5 milhão).
- Os enquadramentos cinematográficos e a vista inicial foram reajustados para o vale e o
  console maiores.
