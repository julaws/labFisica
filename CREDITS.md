# Créditos e licenças

O projeto prefere **texturas procedurais geradas em código** (CLAUDE.md §10).
Todo asset externo precisa ser **CC0** e aparecer nesta tabela, com fonte e data
de obtenção, antes de entrar no repositório.

## Inspiração

O experimento da lente segue o desenho, a iluminação e o console de **The Plane of
Focus** ([sael.net/plane-of-focus](https://sael.net/plane-of-focus/), @ryansael). Nenhum
arquivo de lá foi copiado: a geometria, as texturas e o código são próprios. O crédito
aparece gravado no console da bancada e no "?" da lente.

## Assets externos

| Asset | Tipo | Fonte | Licença | Obtido em | Onde é usado |
|---|---|---|---|---|---|
| `studio_small_09_1k.hdr` (Studio Small 09, 1k) | HDRI de estúdio | [Poly Haven](https://polyhaven.com/a/studio_small_09) — autoria de Sergej Majboroda | **CC0 1.0** | 27/09/2026 | `src/assets/env/`, carregado por `src/core/environment.ts` como ambiente e reflexo |

A licença CC0 do Poly Haven permite uso comercial, redistribuição e inclusão em
produto pago, sem exigência de atribuição — o crédito acima é por cortesia.
Todo o resto da aparência é procedural, gerado em código em `src/scene/textures/`.

## Retratos da galeria (domínio público)

`src/assets/portraits/physicists.jpg`, usado por `src/scene/portrait-wall.ts`: onze
retratos num atlas 4 × 3, recortados, convertidos para tons de cinza e com o
passe-partout desenhado por cima (2080 × 2100 px, JPEG). Em `src/assets/portraits/hd/`,
a mesma foto de cada um ampliada (660 × 880 px), que o visualizador baixa só quando
o quadro é clicado. As fotos são de **domínio
público**: sem direito autoral nenhum, o que cumpre a mesma exigência do CC0
(CLAUDE.md §10). Fonte: Wikimedia Commons, obtidas em 03/10/2026.

| Retrato | Autor e data | Arquivo de origem |
|---|---|---|
| Isaac Newton | Godfrey Kneller, 1689 (pintura a óleo: Newton morreu antes da fotografia) | [GodfreyKneller-IsaacNewton-1689.jpg](https://commons.wikimedia.org/wiki/File:GodfreyKneller-IsaacNewton-1689.jpg) |
| Albert Einstein | Ferdinand Schmutzer, 1921 | [Einstein 1921 by F Schmutzer - restoration.jpg](https://commons.wikimedia.org/wiki/File:Einstein_1921_by_F_Schmutzer_-_restoration.jpg) |
| Erwin Schrödinger | autor desconhecido, 1933 (Narodowe Archiwum Cyfrowe) | [Erwin Schrödinger - Narodowe Archiwum Cyfrowe (1-E-939).jpg](https://commons.wikimedia.org/wiki/File:Erwin_Schr%C3%B6dinger_-_Narodowe_Archiwum_Cyfrowe_(1-E-939).jpg) |
| Werner Heisenberg | autor desconhecido, c. 1927 | [Heisenberg 10.jpg](https://commons.wikimedia.org/wiki/File:Heisenberg_10.jpg) |
| Max Planck | autor desconhecido, Berlim, 1933 | [Max Planck 1933.jpg](https://commons.wikimedia.org/wiki/File:Max_Planck_1933.jpg) |
| Paul Dirac | Fundação Nobel, 1933 | [Paul Dirac, 1933.jpg](https://commons.wikimedia.org/wiki/File:Paul_Dirac,_1933.jpg) |
| Marie Curie | Henri Manuel, c. 1920 | [Marie Curie c1920.jpg](https://commons.wikimedia.org/wiki/File:Marie_Curie_c1920.jpg) |
| Emmy Noether | autor desconhecido, c. 1900 | [Noether.jpg](https://commons.wikimedia.org/wiki/File:Noether.jpg) |
| Lise Meitner | autor desconhecido, 1916 | [Lise Meitner signed.jpg](https://commons.wikimedia.org/wiki/File:Lise_Meitner_signed.jpg) |

**Duas exceções à regra do CC0**, para atender ao pedido de fotos reais das cientistas
(não há foto de domínio público delas no Wikimedia Commons):

| Retrato | Autor e data | Licença | Arquivo de origem |
|---|---|---|---|
| Chien-Shiung Wu | Smithsonian Institution Archives, 1958 (SIA2010-1511) | **sem restrições de direitos autorais conhecidas** (Flickr Commons: o Smithsonian não conhece direitos sobre a foto, mas não a declara domínio público) | [Chien-Shiung Wu (1912-1997) in 1958.jpg](https://commons.wikimedia.org/wiki/File:Chien-Shiung_Wu_(1912-1997)_in_1958.jpg) |
| Rosalind Franklin | MRC Laboratory of Molecular Biology, 1955 (acervo de Jenifer Glynn) | **CC BY-SA 4.0**: exige o crédito, e o recorte em tons de cinza segue sob a mesma licença | [Rosalind Franklin.jpg](https://commons.wikimedia.org/wiki/File:Rosalind_Franklin.jpg) |

O crédito de cada foto aparece no visualizador, embaixo da biografia. O recorte de
Rosalind Franklin no atlas e em `hd/franklin.jpg` é obra derivada sob CC BY-SA 4.0.

## Música de fundo (domínio público)

`public/music/`, tocadas por `src/ui/music-player.ts`, em sequência e em laço. São as
versões MP3 que o próprio Wikimedia Commons gera dos arquivos originais, obtidas em
03/10/2026. Interpretações instrumentais, sem metais (piano solo, e cordas no Bach).

| Faixa | Intérprete | Licença | Arquivo de origem |
|---|---|---|---|
| Bach, Ária da Suíte Orquestral nº 3, BWV 1068 ("Ária na Corda Sol") | The Air Force Strings (Banda da Força Aérea dos EUA), 2000 | domínio público (obra do governo dos EUA) | [Air.ogg](https://commons.wikimedia.org/wiki/File:Air.ogg) |
| Beethoven, Sonata nº 14 "ao Luar", op. 27 nº 2, I. Adagio sostenuto | Paul Pitman (Musopen) | domínio público | [arquivo no Commons](https://commons.wikimedia.org/wiki/File:Ludwig_van_Beethoven_-_sonata_no._14_in_c_sharp_minor_%27moonlight%27,_op._27_no._2_-_i._adagio_sostenuto.ogg) |
| Debussy, Clair de Lune (Suite bergamasque) | Laurens Goedhart, 2011 | domínio público | [arquivo no Commons](https://commons.wikimedia.org/wiki/File:Clair_de_lune_(Claude_Debussy)_Suite_bergamasque.ogg) |
| Satie, Gymnopédie nº 1 | Robin Alciatore (Musopen) | domínio público | [arquivo no Commons](https://commons.wikimedia.org/wiki/File:Erik_Satie_-_gymnopedies_-_la_1_ere._lent_et_douloureux.ogg) |
| Mozart, Sonata nº 13, K. 333, II. Andante cantabile | Musopen | domínio público | [arquivo no Commons](https://commons.wikimedia.org/wiki/File:Wolfgang_Amadeus_Mozart_-_sonata_no._13_in_b_flat_major,_k.333_-_ii._andante_cantabile.ogg) |

No lugar de um concerto para piano de Mozart, entrou um movimento de sonata para
piano solo: os concertos têm trompas na orquestra, e o pedido era evitar metais.

## Vídeo explicativo "Planka e as Lentes"

`public/video/planka-lentes.mp4` (1080p, 30 fps, 8 min 06 s) e a capa
`src/assets/video-poster.jpg`, abertos pela TV da bancada da lente
(`src/experiments/lens-focus/video-tv.ts`). São **obra própria do projeto**:

- **Animação:** feita em Manim Community Edition (licença MIT) a partir do código em
  `planka_lentes/` (cenas, física em `optics.py`, mascote Planka desenhada em código).
- **Narração:** voz sintética gerada na ElevenLabs (modelo `eleven_multilingual_v2`,
  voz "Fernanda - Natural Conversations") pela conta do autor, a partir do roteiro
  de `planka_lentes/roteiro.py`. O uso segue os termos do plano dessa conta.
- **Música de fundo do vídeo:** sintetizada do zero em Python
  (`planka_lentes/musica/gerar_trilha_animada.py`), sem amostras nem gravações de
  terceiros.

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
