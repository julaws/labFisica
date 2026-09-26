# Fontes das fórmulas e das constantes ópticas

Toda constante física do projeto tem origem registrada aqui (CLAUDE.md §3, SPEC §13).
Nada de número inventado: se não houver fonte confiável, o documento diz isso
explicitamente e descreve a aproximação adotada.

## Situação por tema

| Tema | Situação | Fase |
|---|---|---|
| Convenções de sinal (objeto à esquerda, luz em +z) | a documentar | F1 |
| Lente fina, DOF, hiperfocal, círculo de confusão | a documentar | F1 |
| Equação de Sellmeier e coeficientes dos vidros | N-BK7 já na SPEC §5.4; demais vidros a levantar | F1 |
| Prescrição do Gauss duplo ~50 mm f/2 | **pendente** — ver nota abaixo | F1 |
| Matriz paraxial (ABCD), EFL, BFL, planos principais | a documentar | F1 |

## Notas

### Prescrição do Gauss duplo

A SPEC §5.3 exige uma prescrição de fonte pública documentada, escalonada para
EFL = 50 mm, e proíbe inventar números. O plano para a F1 é, nesta ordem:

1. Procurar uma prescrição de patente expirada ou de livro-texto de projeto óptico
   que possa ser reproduzida, registrando a referência completa (autor, obra/patente,
   página/tabela) e a tabela original antes do escalonamento.
2. Não havendo fonte que possa ser citada com segurança, usar a alternativa já
   prevista pela própria SPEC: **dois dubletos acromáticos simétricos em torno do
   stop**, projetados aqui com vidros de catálogo cujos coeficientes de Sellmeier
   tenham fonte — e declarar no modal "?" e neste documento que a lente do modo
   "Aberrações" é um modelo didático, não uma objetiva comercial.

Enquanto a F1 não fecha essa decisão, nenhuma tabela de prescrição entra no código.

### Coeficientes de Sellmeier

- **N-BK7** — B = (1.03961212, 0.231792344, 1.01046945),
  C = (0.00600069867, 0.0200179144, 103.560653) µm².
  Fonte primária a anexar na F1 (catálogo Schott / refractiveindex.info);
  valor de verificação: n(587,56 nm) = 1,51680 (SPEC §5.6).
