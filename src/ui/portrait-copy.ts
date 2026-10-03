import type { Locale } from './i18n';

/**
 * Textos do visualizador de retratos: o que cada cientista trouxe para a
 * física e onde isso aparece nas bancadas do laboratório. Curtos de propósito:
 * cabem embaixo da foto sem rolar a tela.
 *
 * Os números citados vêm do motor (`src/optics/`): o λ = 5,36 pm da dupla
 * fenda a 50 kV, com a correção relativística, e 5,48 pm sem ela.
 */

export interface PortraitCopy {
  /** Uma linha: o campo em que o cientista mudou a física. */
  readonly field: string;
  /** Os avanços mais importantes. */
  readonly advances: string;
  /** A ligação com os experimentos das bancadas. */
  readonly benches: string;
}

type CopyTable = Readonly<Record<string, Readonly<Record<Locale, PortraitCopy>>>>;

export const PORTRAIT_COPY: CopyTable = {
  newton: {
    'pt-BR': {
      field: 'Óptica, movimento e gravitação',
      advances:
        'Mostrou com um prisma que a luz branca é uma mistura de cores, construiu o primeiro telescópio refletor e, nos Principia (1687), escreveu as leis do movimento e a da gravitação universal.',
      benches:
        'Nas bancadas: a forma newtoniana da equação das lentes, x·x′ = f², leva o nome dele. E a curva dos elétrons na força magnética é a segunda lei, F = ma, com a força de Lorentz.',
    },
    en: {
      field: 'Optics, motion and gravitation',
      advances:
        'He showed with a prism that white light is a mixture of colours, built the first reflecting telescope and, in the Principia (1687), wrote down the laws of motion and universal gravitation.',
      benches:
        'On the benches: the Newtonian form of the lens equation, x·x′ = f², bears his name. And the curve of the electrons under the magnetic force is his second law, F = ma, with the Lorentz force.',
    },
  },
  einstein: {
    'pt-BR': {
      field: 'Quanta de luz e relatividade',
      advances:
        'Em 1905 explicou o efeito fotoelétrico com quanta de luz, o que lhe deu o Nobel de 1921, e criou a relatividade restrita; dez anos depois, a relatividade geral.',
      benches:
        'Nas bancadas: a 50 kV, os elétrons da dupla fenda já andam a 41% da velocidade da luz, e o comprimento de onda de 5,36 pm leva a correção da relatividade (sem ela, seriam 5,48 pm).',
    },
    en: {
      field: 'Light quanta and relativity',
      advances:
        'In 1905 he explained the photoelectric effect with light quanta, which won him the 1921 Nobel Prize, and created special relativity; ten years later, general relativity.',
      benches:
        'On the benches: at 50 kV, the double-slit electrons already travel at 41% of the speed of light, and their 5.36 pm wavelength includes the relativistic correction (without it, 5.48 pm).',
    },
  },
  schrodinger: {
    'pt-BR': {
      field: 'A equação da onda quântica',
      advances:
        'Em 1926 escreveu a equação que governa a onda de cada partícula, o coração da mecânica quântica, e dividiu o Nobel de 1933 com Dirac. O famoso gato, vivo e morto ao mesmo tempo, também é dele.',
      benches:
        'Nas bancadas: a equação gravada na frente da dupla fenda é a dele, e a onda que decai dentro do muro do tunelamento é a solução exata dessa equação.',
    },
    en: {
      field: 'The quantum wave equation',
      advances:
        'In 1926 he wrote the equation that governs the wave of every particle, the heart of quantum mechanics, and shared the 1933 Nobel Prize with Dirac. The famous cat, alive and dead at once, is his too.',
      benches:
        'On the benches: the equation engraved on the front of the double-slit bench is his, and the wave decaying inside the tunnelling wall is an exact solution of it.',
    },
  },
  heisenberg: {
    'pt-BR': {
      field: 'Mecânica de matrizes e incerteza',
      advances:
        'Aos 23 anos criou a mecânica de matrizes (1925), a primeira forma completa da mecânica quântica, e em 1927 o princípio da incerteza: posição e momento não podem ser conhecidos juntos com precisão arbitrária. Nobel de 1932.',
      benches:
        'Nas bancadas: ligue os detectores da dupla fenda. Saber por qual fenda cada elétron passou apaga as franjas, e medir perturba o que se mede.',
    },
    en: {
      field: 'Matrix mechanics and uncertainty',
      advances:
        'At 23 he created matrix mechanics (1925), the first complete form of quantum mechanics, and in 1927 the uncertainty principle: position and momentum cannot both be known to arbitrary precision. Nobel Prize 1932.',
      benches:
        'On the benches: switch on the double-slit detectors. Knowing which slit each electron went through wipes out the fringes, because measuring disturbs what is measured.',
    },
  },
  planck: {
    'pt-BR': {
      field: 'O quantum de energia',
      advances:
        'Em 1900, para explicar a luz dos corpos quentes, propôs que a energia é trocada em pacotes, E = hf. Nascia a física quântica, com a constante h, e o Nobel de 1918.',
      benches:
        'Nas bancadas: h está em toda parte. O comprimento de onda do elétron na dupla fenda é λ = h/p, e ħ = h/2π aparece na equação de Schrödinger e no κ do tunelamento.',
    },
    en: {
      field: 'The quantum of energy',
      advances:
        'In 1900, to explain the light of hot bodies, he proposed that energy is exchanged in packets, E = hf. Quantum physics was born, with the constant h, and the 1918 Nobel Prize.',
      benches:
        'On the benches: h is everywhere. The electron wavelength in the double slit is λ = h/p, and ħ = h/2π appears in the Schrödinger equation and in the κ of tunnelling.',
    },
  },
  dirac: {
    'pt-BR': {
      field: 'O elétron relativístico e a antimatéria',
      advances:
        'Em 1928 uniu a mecânica quântica à relatividade numa equação para o elétron que explicou o spin e previu a antimatéria: o pósitron, encontrado em 1932. Nobel de 1933, com Schrödinger.',
      benches:
        'Nas bancadas: pela equação de Dirac, cada elétron dos três feixes também é um pequeno ímã, e ela acerta o tamanho desse ímã (o fator g = 2).',
    },
    en: {
      field: 'The relativistic electron and antimatter',
      advances:
        'In 1928 he joined quantum mechanics and relativity in an equation for the electron that explained spin and predicted antimatter: the positron, found in 1932. Nobel Prize 1933, with Schrödinger.',
      benches:
        'On the benches: by the Dirac equation, every electron in the three beams is also a tiny magnet, and the equation gets the strength of that magnet right (the g-factor of 2).',
    },
  },
  curie: {
    'pt-BR': {
      field: 'Radioatividade',
      advances:
        'Pioneira da radioatividade, palavra criada por ela, descobriu o polônio e o rádio com Pierre Curie. Foi a primeira mulher a ganhar um Nobel (Física, 1903) e é a única pessoa premiada em duas ciências (Química, 1911).',
      benches:
        'Nas bancadas: os raios beta, desviados por ímãs como o feixe da força magnética, são elétrons. E o decaimento alfa é tunelamento: a partícula atravessa o muro de energia do núcleo (Gamow, 1928).',
    },
    en: {
      field: 'Radioactivity',
      advances:
        'A pioneer of radioactivity, a word she coined, she discovered polonium and radium with Pierre Curie. She was the first woman to win a Nobel Prize (Physics, 1903) and is the only person awarded in two sciences (Chemistry, 1911).',
      benches:
        'On the benches: beta rays, bent by magnets like the beam on the magnetic-force bench, are electrons. And alpha decay is tunnelling: the particle crosses the energy wall of the nucleus (Gamow, 1928).',
    },
  },
};
