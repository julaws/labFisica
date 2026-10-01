# ADR 0003 — Limite de abertura da objetiva e escala de desenho

- **Status:** substituído pelo [ADR 0005](0005-gauss-duplo-da-patente-e-escala-12x.md) em 01/10/2026
- **Data:** 2026-09-27
- **Fase:** F3

## Contexto

Duas coisas se chocaram com a SPEC quando a objetiva virou geometria.

### 1. A SPEC pede f/1.4; esta objetiva não abre tanto

A SPEC §5.1 define "aberturas f/1.4 a f/22 em stops completos". Um teste da F3
mostrou que, com a prescrição adotada na F1, f/1.4 exigiria uma pupila de entrada
de 35,7 mm num conjunto cujos elementos têm 30 mm de diâmetro livre. O número f
mínimo não é escolha de interface: é consequência da mecânica. Esta objetiva
chega a **f/1,76**.

### 2. Uma 50 mm de verdade é pequena demais para ser vista

O grupo óptico tem 37,2 mm de comprimento e 30 mm de diâmetro. Sobre uma bancada
de 3,2 m, isso é um grão. A SPEC §6.2 já previa o problema e autoriza ampliar a
lente por um "fator constante declarado".

## Decisão

**Abertura.** `widestFNumber(prescription)` calcula o limite a partir da própria
prescrição, e `withFNumber` limita pedidos abaixo dele em vez de produzir uma
íris impossível. A escala de stops oferecida na interface começa em f/2. O valor
f/1,76 aparece no painel "Números" como a abertura máxima real da objetiva.

**Escala.** `LENS_EXAGGERATION = 8` em `src/scene/scale.ts`, o único lugar do
projeto onde um exagero pode existir. O fator é único e aplicado ao conjunto
inteiro, então curvaturas, espessuras e curso de foco guardam as proporções
corretas entre si. Nenhuma distância óptica é calculada nessa escala.

## Consequências

- O item "Sobre as escalas" do modal "?" lê `LENS_EXAGGERATION` em vez de repetir
  um número à mão, então ele não pode ficar desatualizado.
- Quem conhece óptica vai reparar que f/1.4 não está lá. A explicação precisa
  estar visível, não escondida: é uma propriedade da lente, não uma limitação do
  simulador.
- Se uma prescrição mais rápida entrar no lugar (ver ADR 0002), o limite se ajusta
  sozinho, porque sai do cálculo e não de uma constante.

## Alternativas consideradas

- **Aumentar o semidiâmetro dos elementos até caber f/1.4.** Descartada: mudaria a
  prescrição para acomodar a interface, que é o avesso da regra 3 da CLAUDE.md.
- **Deixar a íris abrir além do que a lente permite.** Descartada: o desenho
  passaria a mentir sobre a física.
- **Desenhar a lente em tamanho real.** Descartada: o vidro e o diafragma ficariam
  invisíveis, e o experimento existe para mostrar exatamente isso.
