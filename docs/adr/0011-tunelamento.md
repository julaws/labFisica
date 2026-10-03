# ADR 0011 — Tunelamento: o muro de energia

- **Status:** aceito
- **Data:** 2026-10-03

## Contexto

O pedido: um quarto experimento, sobre corrente de tunelamento, "lúdico, criativo e bastante
didático". Controles obrigatórios: a quantidade de elétrons do feixe (intensidade) e a
altura e a largura da barreira. Ver os elétrons tunelando. Na lateral da bancada, uma placa
prateada com a equação principal da corrente de tunelamento. O resto ficou livre.

## Decisão

### A metáfora: altura é energia

A bancada é um **diagrama de energia em 3D**, como o dos livros: o feixe corre na altura da
energia do elétron (E = 1 eV), e a barreira é um muro de altura V₀ e espessura *a*. Uma
bolinha clássica rolando mais baixo que o muro sempre volta. Escalas declaradas no modal:
12 cm por eV na vertical; 1 nm desenhado como 40 cm na horizontal (4 × 10⁸).

### Física (`src/optics/quantum/tunneling.ts`)

- Barreira retangular, solução exata da equação de Schrödinger estacionária por trechos
  (onda incidente + refletida, C·e^{iKx} + D·e^{−iKx} dentro, transmitida), com ψ e ψ′
  contínuas nas duas paredes. Abaixo da barreira K = iκ, κ = √(2m(V₀ − E))/ħ.
- Transmissão exata T = [1 + V₀² senh²(κa)/(4E(V₀ − E))]⁻¹ (e as formas para E = V₀ e
  E > V₀, com as ressonâncias T = 1); aproximação de barreira larga
  T ≈ 16E(V₀ − E)/V₀² · e^{−2κa}; corrente de tunelamento I = I₀·T.
- Testes: valores de κ e λ, T = 6,42% no padrão, queda exponencial com a largura,
  convergência da aproximação, ressonância acima da barreira, |r|² + |τ|² = 1 e
  continuidade de ψ e ψ′ nas paredes.

### O que se vê

- **O muro**: bloco violeta translúcido com bordas acesas e linhas de varredura; altura e
  espessura acompanham V₀ e *a*. Ao lado, uma régua em eV; uma linha tracejada marca a
  energia do elétron; o pedestal tem a linha de 0 eV.
- **A onda**: o envelope |ψ| (cortina translúcida) e Re ψ (uma corda que ondula no tempo),
  calculados **na placa de vídeo** a partir dos coeficientes do motor. Antes do muro a onda
  oscila e mistura com a refletida; dentro, decai; depois, segue menor. Desenha-se a
  amplitude |ψ|, não |ψ|²: com |ψ|² a parte que tunela some de vista (declarado).
- **Os elétrons**, um a um: cada um sorteia o destino com a probabilidade exata. A maioria
  volta e se apaga; alguns atravessam como um **fantasma** que se apaga dentro do muro (a
  imagem da onda decaindo, não de energia gasta) e reaparecem com um clarão dourado.
- **O coletor**: copo de Faraday com anel que pisca a cada chegada e um painel que conta os
  que tunelaram e os que refletiram. A fração medida converge para a calculada; a contagem
  recomeça quando o muro muda.
- **Placa prateada** na lateral da bancada: I = I₀T ≈ I₀ · 16E(V₀ − E)/V₀² · e^{−2κa} e
  κ = √(2m(V₀ − E))/ħ (o diagramador ganhou raiz quadrada), com a legenda dos símbolos
  embaixo: *a* é a largura da barreira, V₀ a altura, E a energia do elétron.
- **Placa dourada** "@juliophisico" no canhão, como nas outras bancadas.

### Controles

Intensidade do feixe (1 a 100 nA, escala logarítmica; elétrons desenhados por segundo
crescem com o logaritmo, cada ponto vale muitos elétrons), altura do muro (0,5 a 4 eV,
inclusive abaixo da energia do elétron) e largura (0,1 a 1,2 nm). Mostrar ou esconder a
onda, em "Mais ajustes" no celular. Atalhos: `[` `]` largura, `,` `.` altura, `-` `=`
intensidade, `O` onda.

### Desempenho

Geometria fixa para a onda (avaliada no shader, `position` zerado), pontos dos elétrons
atualizados na CPU (no máximo 160). 94 draw calls, 60 fps.

## Consequências

- Quarta estação na sala (`STATION_X = [−6,3; −2,1; 2,1; 6,3]`, sala de 18 m). Com quatro
  bancadas, a sala passa a ter **uma luz de área só**, que acompanha a bancada ativa
  (antes, uma por bancada, e cada uma custa em cada pixel de cada material); a reserva de
  luzes práticas fica em duas.
- No celular, o seletor de bancadas mostra só a atual entre as setas: quatro nomes não
  cabem na largura.
