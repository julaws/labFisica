# ADR 0002 — Prescrição da objetiva do experimento 1

- **Status:** substituído pelo [ADR 0005](0005-gauss-duplo-da-patente-e-escala-12x.md) em 01/10/2026
- **Data:** 2026-09-26
- **Fase:** F1

## Contexto

A SPEC §5.3 pede que o modo "Aberrações" trace raios por um **Gauss duplo clássico
~50 mm f/2 obtido de fonte pública documentada**, escalonado para EFL = 50 mm, e a §13
proíbe inventar prescrições. A busca por uma tabela citável não deu resultado utilizável:

- o OCR das patentes antigas no Google Patents sai corrompido, com índices impossíveis
  (`n = 1,010`) e **sinais de curvatura perdidos**;
- as transcrições organizadas que existem (photonstophotos.net) são de um site com
  direitos reservados, o que colide com a CLAUDE.md §10;
- a única tabela encontrada em artigo acadêmico aparece sem citação de origem.

O detalhamento da busca está em `docs/optics-sources.md` §6.

## Decisão

Usar a alternativa que a própria SPEC §5.3 prevê: **dois dubletos acromáticos cimentados,
simétricos em torno do stop**, com a geometria **derivada em código** a partir de:

- dados físicos de fonte CC0 (índices e dispersão do catálogo SCHOTT via refractiveindex.info);
- condição acromática e equação do fabricante de lentes;
- bissecção sobre `f_d` para fixar a EFL em 50 mm;
- bissecção sobre um fator `κ` do flint para zerar a aberração cromática medida no
  traçador real;
- bending `R1/f_d = 1,30`, escolhido por varredura que minimiza a aberração esférica
  marginal em f/2 e verificado por teste.

A interface deve declarar que a lente é um modelo didático, não a cópia de uma objetiva
comercial (item no modal "?" da F7, junto com "Sobre as escalas").

## Consequências

- Nenhuma constante sem fonte entra no repositório, e o caminho do número até a origem é
  auditável por qualquer pessoa que leia o módulo.
- A aberração esférica residual em f/2 é de −1,9 mm, contra ~−0,1 mm de uma objetiva
  comercial de 6 elementos. O modo "Aberrações" fica mais dramático que a realidade — o que
  ajuda na didática, desde que esteja dito.
- A lente desenhada na cena (SPEC §6.4) terá 4 elementos, não 6. O visual se afasta um
  pouco do site de referência.
- A troca por uma prescrição real, se aparecer fonte citável, é substituir uma tabela:
  `Prescription` é só uma lista de superfícies, e motor, geometria 3D e raios a consomem
  por interface.

## Alternativas consideradas

- **Usar o OCR corrompido da patente.** Descartada: números com procedência aparente e
  valores errados são piores que uma aproximação declarada.
- **Copiar a tabela de um site com direitos reservados.** Descartada por licença.
- **Usar a tabela sem citação do artigo do arXiv.** Descartada: não atende à exigência de
  fonte rastreável, e a escala declarada (EFL 4 mm em f/1,0) é incoerente com o uso.
- **Desenhar seis elementos e ajustar "no olho" até parecer um Gauss duplo.** Descartada:
  é exatamente o que a SPEC §13 proíbe.
