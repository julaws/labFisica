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
da matriz vale 1; a EFL concorde com o traçador real; e as pupilas de entrada e saída de um
sistema simétrico caem simetricamente em torno do stop (3,584 mm de cada lado, no projeto
atual) — três verificações independentes em `tests/optics/prescription.test.ts`.

## 5. Traçado de raios real

`src/optics/trace.ts`. Refração vetorial de Snell:

```
t = η·i + (η·cosθi − cosθt)·n        η = n/n′,  cosθi = −i·n,  cosθt = √(1 − η²(1 − cos²θi))
```

Reflexão interna total quando `η²(1 − cos²θi) > 1`. Vinhetagem quando o ponto de interseção
cai além do semidiâmetro livre da superfície. Interseção com esfera de vértice em `z₀` e
centro em `z₀ + R`, escolhendo a raiz do lado do vértice (`t = −b − sign(R)·√Δ`).

## 6. Prescrição da objetiva: por que **não** é um Gauss duplo de patente

A SPEC §5.3 pede um Gauss duplo clássico ~50 mm f/2 "obtido de fonte pública documentada"
e a §13 proíbe inventar prescrições. A busca, em 26/09/2026, não produziu uma tabela que
pudesse ser citada com segurança:

1. **Google Patents, US 2.532.751** (Baker / Perkin-Elmer, 1950) — a transcrição por OCR do
   documento sai corrompida: índices de refração impossíveis (`n = 1,010`, `n = 1,020`),
   rótulos de raio trocados por ruído (`11F=`) e **sinais de curvatura perdidos**, o que
   torna a tabela inutilizável. Usar esses números seria pior que inventá-los, porque
   pareceriam ter procedência.
2. **US 3.552.829** (Marquardt / Ernst Leitz, 1971) — a página não expõe a tabela numérica
   no texto extraível.
3. **photonstophotos.net / Optical Bench** — tem mais de 1.280 prescrições transcritas de
   patentes, mas o site declara `Copyright 2017-2026 William J. Claff, All Rights Reserved`,
   o que impede a cópia (CLAUDE.md §10).
4. Tabelas avulsas em artigos acadêmicos — a que foi encontrada (arXiv 2409.09754, Tabela A.3)
   aparece **sem citação de origem** e com uma escala estranha (EFL 4,0 mm em f/1,0), o que
   não atende à exigência de fonte rastreável.

A própria SPEC §5.3 prevê a saída: *"Se não houver fonte confiável, usar dois dubletos
acromáticos simétricos em torno do stop e documentar isso."* É o caminho adotado.

Se você tiver acesso a uma prescrição citável (um livro de projeto óptico, por exemplo),
ela entra sem retrabalho: `Prescription` é só uma tabela de superfícies, e todo o motor,
a geometria 3D e os raios passam a usá-la.

## 7. Prescrição adotada: par simétrico de dubletos acromáticos, 50 mm f/2

`src/optics/prescriptions/symmetric-double-doublet.ts`.

### Como a geometria é obtida

Nenhum raio ou espessura é digitado à mão. O módulo resolve:

1. **Condição acromática** de duas lentes finas em contato, `Φ_a/V_a + Φ_b/V_b = 0`, que dá
   `f_a = f_d·(V_a − V_b)/V_a` e `f_b = −f_d·(V_a − V_b)/V_b`, com V vindo do catálogo CC0.
2. **Equação do fabricante de lentes** em cada superfície do dubleto cimentado, deixando
   `R1` livre como parâmetro de forma (*bending*).
3. `f_d` por bissecção até a **EFL paraxial do sistema espesso** dar exatamente 50 mm.
4. `κ`, um fator sobre a potência do flint, por bissecção até a **aberração cromática
   longitudinal medida no traçador real** (linhas F e C) zerar. A condição do passo 1 é de
   lente fina; κ absorve o efeito das espessuras.

Entradas de projeto (escolhas declaradas, não constantes físicas): crown **N-LAK22**,
flint **N-SF5**, espessuras 7,0 mm e 2,6 mm, separação total entre os dubletos 18,0 mm,
semidiâmetro livre 15,0 mm, stop totalmente aberto com semidiâmetro 12,5 mm, e
**bending R1/f_d = 1,30**, achado por varredura que minimiza a aberração esférica marginal
em f/2. A varredura é reproduzida em `tests/optics/prescription.test.ts`, que falha se 1,30
deixar de ser o mínimo.

### Tabela resultante (mm)

| # | Raio | Espessura | Meio | Semidiâmetro | |
|---|---|---|---|---|---|
| 1 | 113,4041 | 7,0000 | N-LAK22 | 15,00 | |
| 2 | −30,4830 | 2,6000 | N-SF5 | 15,00 | |
| 3 | −99,7248 | 9,0000 | ar | 15,00 | |
| 4 | plano | 9,0000 | ar | 12,50 | **stop** |
| 5 | 99,7248 | 2,6000 | N-SF5 | 15,00 | |
| 6 | 30,4830 | 7,0000 | N-LAK22 | 15,00 | |
| 7 | −113,4041 | — | ar | 15,00 | |

### Desempenho medido pelo próprio motor

| Grandeza | Valor |
|---|---|
| EFL | 50,0000 mm |
| BFL | 33,2403 mm |
| FFL | −33,2403 mm |
| Plano principal traseiro | −16,7597 mm do último vértice |
| Plano principal dianteiro | +16,7597 mm do primeiro vértice |
| Pupila de entrada | z = 15,0158 mm, D = 28,4441 mm |
| Pupila de saída | z = 22,1842 mm, D = 28,4441 mm |
| Abertura máxima | f/1,76 (o stop fecha para f/2 com semidiâmetro 10,99 mm) |
| Comprimento do grupo óptico | 37,20 mm |
| Aberração esférica longitudinal em f/2 | −1,8848 mm (marginal em 31,36 mm, paraxial em 33,24 mm) |
| Aberração cromática longitudinal F–C | < 0,01 mm (nula por construção) |

### Limitação, declarada na interface

Com 4 elementos, a aberração esférica residual em f/2 (−1,9 mm) é **muito maior** que a de
uma objetiva comercial de 6 elementos (da ordem de −0,1 mm). Isso é honesto para um projeto
simétrico simples e até didático — o modo "Aberrações" mostra o efeito com clareza —, mas
precisa estar escrito no modal "?" (F7): **esta é uma lente de laboratório, não a cópia de
uma objetiva de mercado.**

---

## Situação por tema

| Tema | Situação | Fase |
|---|---|---|
| Convenções de sinal | documentado (§1) | F1 ✔ |
| Lente fina, DOF, hiperfocal, CoC | documentado e testado (§2) | F1 ✔ |
| Sellmeier e coeficientes dos vidros | documentado, fonte CC0 (§3) | F1 ✔ |
| Matriz paraxial (ABCD), EFL, BFL, pupilas | documentado e testado (§4) | F1 ✔ |
| Traçador sequencial, Snell, TIR, vinhetagem | documentado e testado (§5) | F1 ✔ |
| Prescrição da objetiva | alternativa da SPEC §5.3, documentada (§6 e §7) | F1 ✔ |
| Fatores de exagero de escala da cena | pendente | F4 |
