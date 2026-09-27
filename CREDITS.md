# Créditos e licenças

O projeto prefere **texturas procedurais geradas em código** (CLAUDE.md §10).
Todo asset externo precisa ser **CC0** e aparecer nesta tabela, com fonte e data
de obtenção, antes de entrar no repositório.

## Assets externos

| Asset | Tipo | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|---|
| _(nenhum até agora)_ | | | | | |

## Fontes tipográficas

| Família | Fonte | Licença | Situação |
|---|---|---|---|
| Manrope | Google Fonts / GitHub | SIL Open Font License 1.1 | a auto-hospedar na F7 |

## Dados físicos

| Dado | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|
| Coeficientes de Sellmeier dos vidros SCHOTT (N-BK7, N-SK16, N-LAK22, N-SF2, N-SF5) | [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), a partir do SCHOTT Zemax catalog 2017-01-20b | CC0 1.0 | 26/09/2026 | `src/optics/glass.ts` |

Coeficientes de vidros, prescrições e fórmulas têm as referências completas em
[`docs/optics-sources.md`](docs/optics-sources.md). A prescrição da objetiva **não** é
copiada de terceiros: é derivada em código a partir desses dados de vidro, conforme
[ADR 0002](docs/adr/0002-prescricao-da-objetiva.md).
