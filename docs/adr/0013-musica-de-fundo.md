# ADR 0013 — Música de fundo

- **Status:** aceito
- **Data:** 2026-10-03

## Contexto

O pedido: música de fundo no laboratório, faixas em sequência e em laço, com controles
no canto inferior direito, ao lado da navegação (anterior, próxima, mudo e volume).
Volume padrão de 10%, gravações sem direitos autorais, de preferência piano solo e sem
metais. Sugestões: Bach (Ária na Corda Sol), Beethoven (Sonata ao Luar, 1º movimento),
Debussy (Clair de Lune), Satie (Gymnopédie nº 1) e um concerto para piano de Mozart.

## Decisão

- **Faixas** (`public/music/`, `CREDITS.md`): cinco gravações de domínio público do
  Wikimedia Commons, nas versões MP3 que o Commons gera (tocam em todo navegador,
  inclusive Safari). Bach pelas cordas da Banda da Força Aérea dos EUA; Beethoven,
  Satie e Mozart do Musopen; Debussy de Laurens Goedhart. No lugar do concerto de
  Mozart, um movimento de sonata para piano solo (K. 333, Andante cantabile): os
  concertos têm trompas, e o pedido era evitar metais. São ~30 MB no total, mas só a
  faixa atual é baixada, aos poucos, quando toca.
- **Nivelamento**: as gravações chegam com médias de −15 a −35 dBFS. Cada faixa leva um
  ganho fixo (medido uma vez, decodificando os arquivos) que a traz para −26 dBFS, sem
  passar de −4 dBFS de pico. Assim os 10% soam parecidos em todas.
- **Volume por Web Audio**: `<audio>` → `MediaElementAudioSourceNode` → `GainNode`. No
  iPhone, `audio.volume` é só leitura; o ganho funciona em toda parte. Sem Web Audio,
  cai para `audio.volume`.
- **Começo**: os navegadores só deixam tocar som depois de um gesto. A música começa
  no primeiro clique, toque ou tecla na página, a 10% (ganho linear 0,1).
- **Controles** (`src/ui/music-player.ts`): no desktop, um cartão de vidro com o nome da
  faixa em cima e, embaixo, anterior, mudo, próxima e o volume (0 a 100%). No celular,
  uma linha só, sem o nome. Volume, mudo e faixa ficam no `localStorage` de quem visita.

## Consequências

- O canto inferior direito tem, da esquerda para a direita: música, visualizações,
  Instagram e a cruz de navegação.
- O repositório cresce ~30 MB com as faixas.
