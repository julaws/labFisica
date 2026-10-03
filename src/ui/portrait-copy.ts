import type { Locale } from './i18n';

/**
 * Textos do visualizador de retratos: uma biografia curta de cada cientista,
 * com o campo em que mudou a física e os avanços mais importantes. Curtos de
 * propósito: cabem embaixo da foto sem rolar a tela.
 */

export interface PortraitCopy {
  /** Uma linha: o campo em que o cientista mudou a física. */
  readonly field: string;
  /** A biografia resumida. */
  readonly bio: string;
}

type CopyTable = Readonly<Record<string, Readonly<Record<Locale, PortraitCopy>>>>;

export const PORTRAIT_COPY: CopyTable = {
  newton: {
    'pt-BR': {
      field: 'Óptica, movimento e gravitação',
      bio: 'Mostrou com um prisma que a luz branca é uma mistura de cores e construiu o primeiro telescópio refletor. Nos Principia (1687), escreveu as três leis do movimento e a lei da gravitação universal, e criou, ao mesmo tempo que Leibniz, o cálculo diferencial e integral.',
    },
    en: {
      field: 'Optics, motion and gravitation',
      bio: 'He showed with a prism that white light is a mixture of colours and built the first reflecting telescope. In the Principia (1687) he wrote down the three laws of motion and the law of universal gravitation, and he created calculus at the same time as Leibniz.',
    },
  },
  einstein: {
    'pt-BR': {
      field: 'Quanta de luz e relatividade',
      bio: 'Em 1905, seu "ano milagroso", explicou o efeito fotoelétrico com quanta de luz, o movimento browniano e criou a relatividade restrita, com E = mc². Dez anos depois, a relatividade geral descreveu a gravidade como curvatura do espaço-tempo. Nobel de Física de 1921.',
    },
    en: {
      field: 'Light quanta and relativity',
      bio: 'In 1905, his "miracle year", he explained the photoelectric effect with light quanta and Brownian motion, and created special relativity, with E = mc². Ten years later, general relativity described gravity as the curvature of spacetime. Nobel Prize in Physics 1921.',
    },
  },
  schrodinger: {
    'pt-BR': {
      field: 'A equação da onda quântica',
      bio: 'Em 1926 escreveu a equação que governa a onda de cada partícula, o coração da mecânica quântica, e dividiu o Nobel de 1933 com Dirac. O famoso gato, vivo e morto ao mesmo tempo, é dele. Em "O que é a vida?" (1944), inspirou a busca pela molécula da hereditariedade.',
    },
    en: {
      field: 'The quantum wave equation',
      bio: 'In 1926 he wrote the equation that governs the wave of every particle, the heart of quantum mechanics, and shared the 1933 Nobel Prize with Dirac. The famous cat, alive and dead at once, is his. In "What Is Life?" (1944) he inspired the search for the molecule of heredity.',
    },
  },
  heisenberg: {
    'pt-BR': {
      field: 'Mecânica de matrizes e incerteza',
      bio: 'Aos 23 anos criou a mecânica de matrizes (1925), a primeira forma completa da mecânica quântica. Em 1927 formulou o princípio da incerteza: posição e momento de uma partícula não podem ser conhecidos juntos com precisão arbitrária. Nobel de Física de 1932.',
    },
    en: {
      field: 'Matrix mechanics and uncertainty',
      bio: 'At 23 he created matrix mechanics (1925), the first complete form of quantum mechanics. In 1927 he formulated the uncertainty principle: the position and momentum of a particle cannot both be known to arbitrary precision. Nobel Prize in Physics 1932.',
    },
  },
  planck: {
    'pt-BR': {
      field: 'O quantum de energia',
      bio: 'Em 1900, para explicar a luz emitida pelos corpos quentes, propôs que a energia é trocada em pacotes, E = hf. Nascia a física quântica, com a constante h que leva o seu nome. Nobel de Física de 1918.',
    },
    en: {
      field: 'The quantum of energy',
      bio: 'In 1900, to explain the light given off by hot bodies, he proposed that energy is exchanged in packets, E = hf. Quantum physics was born, with the constant h that bears his name. Nobel Prize in Physics 1918.',
    },
  },
  dirac: {
    'pt-BR': {
      field: 'O elétron relativístico e a antimatéria',
      bio: 'Em 1928 uniu a mecânica quântica à relatividade numa equação para o elétron que explicou o spin e previu a antimatéria: o pósitron, encontrado em 1932. Lançou as bases da eletrodinâmica quântica. Nobel de Física de 1933, com Schrödinger.',
    },
    en: {
      field: 'The relativistic electron and antimatter',
      bio: 'In 1928 he joined quantum mechanics and relativity in an equation for the electron that explained spin and predicted antimatter: the positron, found in 1932. He laid the foundations of quantum electrodynamics. Nobel Prize in Physics 1933, with Schrödinger.',
    },
  },
  curie: {
    'pt-BR': {
      field: 'Radioatividade',
      bio: 'Pioneira da radioatividade, palavra criada por ela, descobriu o polônio e o rádio com Pierre Curie. Foi a primeira mulher a ganhar um Nobel (Física, 1903) e é a única pessoa premiada em duas ciências (Química, 1911).',
    },
    en: {
      field: 'Radioactivity',
      bio: 'A pioneer of radioactivity, a word she coined, she discovered polonium and radium with Pierre Curie. She was the first woman to win a Nobel Prize (Physics, 1903) and is the only person awarded in two sciences (Chemistry, 1911).',
    },
  },
  noether: {
    'pt-BR': {
      field: 'Simetrias e leis de conservação',
      bio: 'Considerada por Albert Einstein como a mulher mais importante da história da matemática, Noether formulou o Teorema de Noether, que estabelece uma conexão matemática fundamental entre as leis de conservação (como conservação de energia e momento linear) e as simetrias da natureza. É um dos pilares absolutos da mecânica analítica, da relatividade e da física de partículas.',
    },
    en: {
      field: 'Symmetries and conservation laws',
      bio: "Regarded by Albert Einstein as the most important woman in the history of mathematics, Noether formulated Noether's theorem, which sets up a fundamental mathematical link between conservation laws (such as the conservation of energy and linear momentum) and the symmetries of nature. It is one of the absolute pillars of analytical mechanics, relativity and particle physics.",
    },
  },
  meitner: {
    'pt-BR': {
      field: 'Fissão nuclear',
      bio: 'Liderou a equipe conceitual que descobriu e explicou teoricamente a fissão nuclear, demonstrando pela primeira vez que o núcleo de um átomo pesado (como o urânio) pode se dividir e liberar uma quantidade colossal de energia. Apesar de ter sido injustamente excluída do Prêmio Nobel de Química concedido ao seu colega Otto Hahn, seu papel é reverenciado como um dos maiores marcos da física do século XX.',
    },
    en: {
      field: 'Nuclear fission',
      bio: 'She led the conceptual team that discovered and theoretically explained nuclear fission, showing for the first time that the nucleus of a heavy atom (such as uranium) can split and release a colossal amount of energy. Although she was unjustly left out of the Nobel Prize in Chemistry awarded to her colleague Otto Hahn, her role is revered as one of the great milestones of 20th-century physics.',
    },
  },
  wu: {
    'pt-BR': {
      field: 'Violação da paridade',
      bio: 'Conhecida como a "Madame Curie chinesa" ou a "Rainha da Pesquisa Nuclear", Wu conduziu o famoso Experimento de Wu, que comprovou experimentalmente a violação da conservação da paridade na interação fraca (uma revolução que derrubou uma lei até então intocada da física quântica). Ela também teve papel crítico na separação de isótopos de urânio no Projeto Manhattan.',
    },
    en: {
      field: 'Parity violation',
      bio: 'Known as the "Chinese Madame Curie" or the "Queen of Nuclear Research", Wu led the famous Wu experiment, which proved that parity is not conserved in the weak interaction (a revolution that overturned a law of quantum physics until then untouched). She also played a critical part in separating uranium isotopes in the Manhattan Project.',
    },
  },
  franklin: {
    'pt-BR': {
      field: 'Difração de raios X e o DNA',
      bio: 'Através da técnica de difração de raios X, Franklin produziu a célebre "Foto 51", que revelou de forma cristalina a estrutura helicoidal do DNA. Embora seu trabalho experimental tenha sido fundamental para decifrar a molécula da vida e compreender as propriedades físicas das macromoléculas, sua contribuição pioneira em biofísica transcende a genética, impactando profundamente a física da matéria condensada mole.',
    },
    en: {
      field: 'X-ray diffraction and DNA',
      bio: 'Using X-ray diffraction, Franklin produced the celebrated "Photo 51", which revealed with crystal clarity the helical structure of DNA. Although her experimental work was key to deciphering the molecule of life and understanding the physical properties of macromolecules, her pioneering contribution to biophysics goes beyond genetics, with a deep impact on soft condensed matter physics.',
    },
  },
};
