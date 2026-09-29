# Créditos e licenças

O projeto prefere **texturas procedurais geradas em código** (CLAUDE.md §10).
Todo asset externo precisa ser **CC0** e aparecer nesta tabela, com fonte e data
de obtenção, antes de entrar no repositório.

## Assets externos

| Asset | Tipo | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|---|
| `studio_small_09_1k.hdr` (Studio Small 09, 1k) | HDRI de estúdio | [Poly Haven](https://polyhaven.com/a/studio_small_09) — autoria de Sergej Majboroda | **CC0 1.0** | 27/09/2026 | `src/assets/env/`, carregado por `src/core/environment.ts` como ambiente e reflexo |

A licença CC0 do Poly Haven permite uso comercial, redistribuição e inclusão em
produto pago, sem exigência de atribuição — o crédito acima é por cortesia.
Todo o resto da aparência é procedural, gerado em código em `src/scene/textures/`.

## Fontes tipográficas

| Família | Arquivo | Fonte | Licença | Obtido em |
|---|---|---|---|---|
| Manrope (variável, peso 200–800) | `src/assets/fonts/manrope-latin.woff2` | [google/fonts, ofl/manrope](https://github.com/google/fonts/tree/main/ofl/manrope) — The Manrope Project Authors | **SIL Open Font License 1.1** | 28/09/2026 |

O arquivo distribuído é um **subconjunto** (latino, pontuação e símbolos da
interface, como `∞`, `·`, `—` e `×`) convertido para WOFF2 com `fonttools`, de
165 KB para 23 KB. A OFL permite subconjuntos e redistribuição, inclusive em
produto pago, desde que o texto da licença acompanhe a fonte: ele está em
`public/fonts/OFL-Manrope.txt`. A OFL só proíbe vender a fonte **sozinha**.

**Exceção à CLAUDE.md §10.** A regra do projeto pede assets CC0; a Manrope é
OFL. A exceção foi aprovada pelo responsável do projeto em 28/09/2026, e a OFL
é compatível com publicar o laboratório gratuitamente ou com cobrança.

## Dados físicos

| Dado | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|
| Coeficientes de Sellmeier dos vidros SCHOTT (N-BK7, N-SK16, N-LAK22, N-SF2, N-SF5) | [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), a partir do SCHOTT Zemax catalog 2017-01-20b | CC0 1.0 | 26/09/2026 | `src/optics/glass.ts` |

Coeficientes de vidros, prescrições e fórmulas têm as referências completas em
[`docs/optics-sources.md`](docs/optics-sources.md). A prescrição da objetiva **não** é
copiada de terceiros: é derivada em código a partir desses dados de vidro, conforme
[ADR 0002](docs/adr/0002-prescricao-da-objetiva.md).
