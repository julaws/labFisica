# Fontes das fórmulas e das constantes ópticas

Toda constante física do projeto tem origem registrada aqui (CLAUDE.md §3, SPEC §13).
Nada de número inventado: quando não há fonte confiável, este documento diz isso
explicitamente e descreve a aproximação adotada.

---

## 1. Convenções de sinal

Implementadas em `src/optics/thin-lens.ts` e `src/optics/trace.ts`.

- O objeto fica **à esquerda** e a luz se propaga no sentido **+z**.
- `u` (distância do objeto) e `v` (distância da imagem) são **positivas no caso real**,
  medidas a partir da lente. É a convenção "gaussiana" usada em fotografia, e é a que
  reproduz os números do site de referência.
- Raio de curvatura `R` **positivo** quando o centro de curvatura está à direita do
  vértice (superfície convexa vista pela luz que chega). `Infinity` é uma superfície plana.
- Distâncias focais traseira (BFL) e dianteira (FFL) são medidas a partir do último e do
  primeiro vértice, com sinal no eixo z: a FFL de uma lente positiva é negativa.
- Magnificação `m = −v/u`: negativa significa imagem invertida.
- Aberração esférica longitudinal **negativa** = subcorrigida (o raio marginal foca antes
  do paraxial), que é o comportamento normal de elementos positivos de faces esféricas.

## 2. Lente fina, profundidade de campo e círculo de confusão

Fórmulas de `src/optics/thin-lens.ts`, todas na SPEC §5.2:

```
1/f = 1/u + 1/v                    v = f·u / (u − f)
extensão do foco                   e = v − f
magnificação                       m = −v / u
diâmetro da pupila                 D = f / N
hiperfocal                         H = f² / (N·c) + f
limite próximo                     Dn = s·(H − f) / (H + s − 2f)
limite distante                    Df = s·(H − f) / (H − s)        (∞ se s ≥ H)
círculo de confusão                b(d) = f² / (N·(s − f)) · |d − s| / d
convergência do objeto d           v_d = f·d / (d − f)
```

São as relações clássicas de óptica geométrica para lente fina; não dependem de nenhuma
constante empírica. A **validação** é numérica: `tests/optics/thin-lens.test.ts` confere
as 12 linhas de referência da SPEC §5.6, incluindo as duas que cruzam com o site de
referência (zona nítida de 1,9 cm a 60 cm e 0,7 cm a 37 cm, ambas em f/2 com c = 0,036 mm).

Os dois valores de círculo de confusão admissível estão em `src/optics/constants.ts`:

| Valor | Uso | Origem |
|---|---|---|
| 0,036 mm | padrão do experimento | reproduz os números do site de referência (SPEC §5.1) |
| 0,030 mm | opção no painel "Números" | valor clássico para sensor full-frame (SPEC §5.1) |

## 3. Vidros: equação de Sellmeier

Implementada em `src/optics/glass.ts`:

```
n²(λ) − 1 = Σᵢ Bᵢ λ² / (λ² − Cᵢ)      com λ em µm e Cᵢ em µm²
```

**Fonte dos coeficientes:** base de dados do
[refractiveindex.info](https://github.com/polyanskiy/refractiveindex.info-database),
licença **CC0 1.0** (domínio público), arquivos
`database/data/specs/schott/optical/<vidro>.yml`, que por sua vez citam o
*SCHOTT Zemax catalog 2017-01-20b* obtido em schott.com. Obtidos em 26/09/2026.

| Vidro | n_d calculado | V_d calculado | Faixa válida (µm) |
|---|---|---|---|
| N-BK7 | 1,51680 | 64,17 | 0,30 – 2,50 |
| N-SK16 | 1,62041 | 60,32 | 0,31 – 2,50 |
| N-LAK22 | 1,65113 | 55,89 | 0,31 – 2,50 |
| N-SF2 | 1,64769 | 33,82 | 0,365 – 2,50 |
| N-SF5 | 1,67271 | 32,25 | 0,37 – 2,50 |
| N-SSK2 | 1,62229 | 53,27 | 0,35 – 2,50 |
| N-SK4 | 1,61272 | 58,63 | 0,334 – 2,50 |
| F5 | 1,60342 | 38,03 | 0,32 – 2,50 |

N-SSK2, N-SK4 e F5 entraram em 30/09/2026, com o Gauss duplo da §6, da mesma base e do
mesmo catálogo.

**Validação cruzada:** os coeficientes do N-BK7 obtidos dessa base são idênticos, dígito a
dígito, aos que a SPEC §5.4 traz de forma independente, e o índice calculado na linha d
(587,56 nm) dá 1,51680, o valor exigido pela SPEC §5.6 com tolerância de 1e-4.

Comprimentos de onda de trabalho (SPEC §5.4): F = 486,13 nm · d = 587,56 nm · C = 656,27 nm.

## 4. Análise paraxial (ABCD)

`src/optics/paraxial.ts`. Trabalha com o par (altura `y`, ângulo reduzido `ω = n·u`):

```
refração numa superfície de potência P = (n′ − n)/R    [[1, 0], [−P, 1]]
translação de t num meio de índice n                   [[1, t/n], [0, 1]]
```

Com M = [[A, B], [C, D]] e o sistema em ar dos dois lados: `f = −1/C`, `BFD = −A/C`,
plano principal traseiro em `(1 − A)/C` a partir do último vértice, dianteiro em
`(D − 1)/C` a partir do primeiro. Pupilas de entrada e saída são as imagens do stop pelos
subsistemas que o precedem (traçado revertido) e que o seguem.

Relações-padrão de óptica matricial, sem constante empírica. **Validação:** o determinante
da matriz vale 1; a EFL concorda com o traçador real; e um raio real mirado no centro da
pupila de entrada cruza o stop no eixo — verificações independentes em
`tests/optics/prescription.test.ts`.

**Correção de 01/10/2026.** A imagem do stop é achada impondo `B = 0` em `T(d)·M`, o que dá
`d = −B·n′/D`. O código usava `A` no lugar de `D`, e as duas pupilas saíam fora do lugar e do
tamanho (no par de dubletos, a de entrada caía em 15,0 mm em vez de 16,8 mm). O erro passou
porque o teste antigo só checava que a pupila ficava à frente do stop. O teste novo traça
um raio real pela pupila calculada, que é o que a definição exige.

## 5. Traçado de raios real

`src/optics/trace.ts`. Refração vetorial de Snell:

```
t = η·i + (η·cosθi − cosθt)·n        η = n/n′,  cosθi = −i·n,  cosθt = √(1 − η²(1 − cos²θi))
```

Reflexão interna total quando `η²(1 − cos²θi) > 1`. Vinhetagem quando o ponto de interseção
cai além do semidiâmetro livre da superfície. Interseção com esfera de vértice em `z₀` e
centro em `z₀ + R`, escolhendo a raiz do lado do vértice (`t = −b − sign(R)·√Δ`).

## 6. Prescrição da objetiva: Gauss duplo da patente US 2.532.751

**Fonte:** patente americana **US 2.532.751**, *Highly corrected objective having two inner
divergent meniscus components between collective components*, James G. Baker, cedida à
Perkin-Elmer, depositada em 29/09/1949 e concedida em 05/12/1950. Exemplo 1 / Fig. 1.
Patente expirada: os números são de domínio público. Documento obtido em 30/09/2026 em
`patentimages.storage.googleapis.com/5c/6b/cb/66551697e1960a/US2532751.pdf`.

### Por que esta fonte agora serve

A busca de 26/09/2026 (ADR 0002) descartou esta mesma patente porque o **texto extraído
por OCR** saía corrompido (índices como `n = 1,010`, sinais perdidos). Desta vez a tabela
foi lida na **imagem escaneada** do documento, renderizada página a página, e não no OCR.
A patente traz a tabela duas vezes — no desenho (p. 1) e impressa no texto (col. 6) —, e as
duas foram conferidas uma contra a outra.

### Tabela da patente (F = 1,000, f/2)

| Elemento | n_D | ν | Raios | Espessuras e espaços |
|---|---|---|---|---|
| I | 1,617 | 55,0 | R1 = 0,578 · R2 = 1,896 | t1 = 0,088 · S1 = 0,003 |
| II | 1,611 | 57,2 | R3 = 0,351 | t2 = 0,125 |
| III | 1,605 | 38,0 | R4 = plano · R5 = 0,216 | t3 = 0,038 · S2 = 0,282 |
| IV | 1,605 | 38,0 | R6 = −0,272 | t4 = 0,038 |
| V | 1,620 | 60,3 | R7 = plano · R8 = −0,352 | t5 = 0,109 · S3 = 0,003 |
| VI | 1,620 | 60,3 | R9 = 5,902 · R10 = −0,635 | t6 = 0,069 |

II–III e IV–V são pares cimentados (R4 e R7 são as interfaces). Única divergência entre
as duas cópias da tabela: o ν do elemento III é **38,9 no desenho** e **38,0 na tabela
impressa**. Vale a impressa, que também coincide com o elemento IV (mesmo vidro).

### O que foi preciso completar, e como

| Lacuna da patente | Decisão | Por quê |
|---|---|---|
| Vidros dados por (n_D, ν), não por nome | Vidro SCHOTT 2017 mais próximo (tabela abaixo) | A SPEC §5.4 pede coeficientes de catálogo |
| Posição do diafragma | No meio de S2 (S2 partido em 0,141 + 0,141) | É onde a Fig. 1 o desenha |
| Escala | Tudo × 50,2048, o fator que leva a EFL a 50,000 mm | Com os vidros do catálogo a EFL da tabela é 0,9959 (a patente diz 1,000) |
| Diâmetros livres | Derivados (abaixo) | A patente não os dá |

**Vidros.** Busca pelo menor desvio em (n_d, ν_d) entre os 156 vidros SCHOTT da base
CC0 do refractiveindex.info (`database/data/specs/schott/optical/`):

| Patente | Vidro | n_d | ν_d |
|---|---|---|---|
| 1,617 / 55,0 (I) | N-SSK2 | 1,62229 | 53,27 |
| 1,611 / 57,2 (II) | N-SK4 | 1,61272 | 58,63 |
| 1,605 / 38,0 (III, IV) | F5 | 1,60342 | 38,03 |
| 1,620 / 60,3 (V, VI) | N-SK16 | 1,62041 | 60,32 |

**Diâmetros livres** (`clearSemiDiameters` em `baker-double-gauss.ts`):

1. cada superfície deixa passar o raio marginal de f/2 no eixo somado ao raio principal a
   **10°** (um círculo de 18 mm no centro do quadro full frame; além disso a lente vinheta,
   como toda objetiva rápida real) — essa é a única escolha de projeto;
2. cada componente (elemento solto ou par cimentado) tem um só diâmetro externo, o maior
   envelope entre as suas superfícies; a face cuja esfera não chega lá termina num
   **ressalto plano**, como os meniscos III e IV do desenho;
3. o componente é limitado ao diâmetro em que a borda de algum elemento chegaria a
   **0,5 mm**;
4. o stop fica com o raio marginal de f/2: a abertura máxima é exatamente a nominal.

## 7. Prescrição adotada: Gauss duplo de 6 elementos, 50 mm f/2

`src/optics/prescriptions/baker-double-gauss.ts`. Testes em
`tests/optics/double-gauss.test.ts`.

### Tabela resultante (mm)

| # | Raio | Espessura | Meio | Semidiâmetro | |
|---|---|---|---|---|---|
| 1 | 29,018 | 4,418 | N-SSK2 | 16,90 | I |
| 2 | 95,188 | 0,151 | ar | 16,90 | |
| 3 | 17,622 | 6,276 | N-SK4 | 13,05 | II |
| 4 | plano | 1,908 | F5 | 13,05 | III (cimentado) |
| 5 | 10,844 | 7,079 | ar | 10,63 | ressalto plano até 13,05 |
| 6 | plano | 7,079 | ar | 7,88 | **stop** |
| 7 | −13,656 | 1,908 | F5 | 11,62 | IV |
| 8 | plano | 5,472 | N-SK16 | 11,62 | V (cimentado) |
| 9 | −17,672 | 0,151 | ar | 11,62 | |
| 10 | 296,309 | 3,464 | N-SK16 | 11,92 | VI |
| 11 | −31,880 | — | ar | 11,92 | |

### Desempenho medido pelo próprio motor

| Grandeza | Valor |
|---|---|
| EFL | 50,0000 mm |
| BFL | 30,9319 mm |
| Plano principal traseiro | −19,0681 mm do último vértice |
| Pupila de entrada | z = 26,9839 mm, D = 25,0000 mm |
| Pupila de saída | z = 9,9170 mm, D = 29,4598 mm |
| Abertura máxima | **f/2** (a nominal da patente) |
| Comprimento do grupo óptico | 37,90 mm |
| Aberração esférica longitudinal | −0,038 mm (h = 3) · −0,136 (h = 6) · −0,239 (h = 9) · −0,161 mm (h = 12,5, f/2) |
| Aberração cromática longitudinal F–C | −0,020 mm (raio a 5 mm) |

A aberração esférica cresce até a zona e volta na borda: é a correção zonal típica do
Gauss duplo, que a própria patente menciona ("the zonal aberration has been permitted to
be significant"). O par de dubletos anterior tinha −1,885 mm em f/2.

### A objetiva anterior

O par simétrico de dubletos acromáticos (ADR 0002) continua em
`src/optics/prescriptions/symmetric-double-doublet.ts`, coberto pelos testes do motor, mas
não é mais a lente do experimento. Com a correção das pupilas (§4), a abertura máxima
dele é **f/1,73**, e não o f/1,76 registrado no ADR 0003.

---

## Situação por tema

| Tema | Situação | Fase |
|---|---|---|
| Convenções de sinal | documentado (§1) | F1 ✔ |
| Lente fina, DOF, hiperfocal, CoC | documentado e testado (§2) | F1 ✔ |
| Sellmeier e coeficientes dos vidros | documentado, fonte CC0 (§3) | F1 ✔ |
| Matriz paraxial (ABCD), EFL, BFL, pupilas | documentado e testado (§4) | F1 ✔ |
| Traçador sequencial, Snell, TIR, vinhetagem | documentado e testado (§5) | F1 ✔ |
| Prescrição da objetiva | Gauss duplo da patente US 2.532.751, documentado (§6 e §7), ADR 0005 | 01/10/2026 ✔ |
| Ampliação de desenho da objetiva | 12×, declarada em `src/scene/scale.ts` e no modal "?" | 01/10/2026 ✔ |
| Limite real de abertura | f/2, a nominal da patente (§7) | 01/10/2026 ✔ |
| Mapa logarítmico de profundidade do diorama | `offset(d) = folga + k·ln(d/300 mm)`, k = 0,242 un/ln (bandeja de 0,85 un desde a ADR 0006), folga 0,40 un, declarado em `src/scene/scale.ts` e no modal "?" | F4 ✔ |
| Ampliação do plano da imagem | 2× sobre a escala da lente, com a chegada dos cones ajustada para o cone seguir batendo com o anel de CoC (ADR 0006) | 02/10/2026 ✔ |
