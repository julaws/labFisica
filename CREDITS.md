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

## Serviços externos

| Serviço | Para quê | O que recebe |
|---|---|---|
| [Abacus](https://jasoncameron.dev/abacus/) (`abacus.jasoncameron.dev`), gratuito, sem conta nem chave | contador de visualizações da página (`src/ui/site-badge.ts`) | uma requisição por aba aberta no endereço publicado (`hit`), ou só leitura (`get`) em outros endereços; nenhum dado do visitante além do que qualquer requisição HTTP carrega |

Se o serviço sair do ar, o número some do selo e o link do Instagram fica.

## Fontes tipográficas

| Família | Arquivo | Fonte | Licença | Obtido em |
|---|---|---|---|---|
| Outfit (variável, peso 300–800) | `src/assets/fonts/outfit-latin.woff2` | [google/fonts, ofl/outfit](https://github.com/google/fonts/tree/main/ofl/outfit) — The Outfit Project Authors | **SIL Open Font License 1.1** | 30/09/2026 |
| DM Mono (pesos 400 e 500) | `src/assets/fonts/dm-mono-400-latin.woff2`, `dm-mono-500-latin.woff2` | [google/fonts, ofl/dmmono](https://github.com/google/fonts/tree/main/ofl/dmmono) — The DM Mono Project Authors | **SIL Open Font License 1.1** | 30/09/2026 |

São as mesmas famílias da referência visual (ADR 0004): Outfit para títulos e
texto, DM Mono para valores, rótulos técnicos e leituras. Os arquivos são os
**subconjuntos latinos em WOFF2** servidos pelo Google Fonts (32 KB e 15 KB
cada). A OFL permite subconjuntos e redistribuição, inclusive em produto pago,
desde que o texto da licença acompanhe a fonte: eles estão em
`public/fonts/OFL-Outfit.txt` e `public/fonts/OFL-DMMono.txt`. A OFL só proíbe
vender a fonte **sozinha**.

A Manrope, usada até 29/09/2026, saiu do projeto junto com o arquivo e a
licença dela.

**Exceção à CLAUDE.md §10.** A regra do projeto pede assets CC0; estas fontes
são OFL. A exceção para fontes OFL foi aprovada pelo responsável do projeto em
28/09/2026, e a OFL é compatível com publicar o laboratório gratuitamente ou
com cobrança.

## Dados físicos

| Dado | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|
| Coeficientes de Sellmeier dos vidros SCHOTT (N-BK7, N-SK16, N-LAK22, N-SF2, N-SF5; N-SSK2, N-SK4 e F5 em 30/09/2026) | [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), a partir do SCHOTT Zemax catalog 2017-01-20b | CC0 1.0 | 26/09/2026 | `src/optics/glass.ts` |
| Prescrição do Gauss duplo 50 mm f/2 (raios, espessuras, n_D e ν do Exemplo 1) | Patente US 2.532.751, J. G. Baker / Perkin-Elmer, 1950 | Domínio público (patente expirada) | 30/09/2026 | `src/optics/prescriptions/baker-double-gauss.ts` |

Coeficientes de vidros, prescrições e fórmulas têm as referências completas em
[`docs/optics-sources.md`](docs/optics-sources.md). A prescrição da objetiva vem da
patente acima, lida na imagem do documento; o que a patente não dá (vidros de catálogo,
posição do diafragma, diâmetros livres) é derivado em código, conforme
[ADR 0005](docs/adr/0005-gauss-duplo-da-patente-e-escala-12x.md).
