# ADR 0001 — Registro de decisões de arquitetura

- **Status:** aceito
- **Data:** 2026-09-26

## Contexto

A SPEC §7 prevê `docs/adr/` para registrar decisões de arquitetura. Sem um formato
combinado, as decisões acabam espalhadas por mensagens de commit.

## Decisão

Cada decisão que afete a arquitetura, a stack ou uma regra da SPEC vira um arquivo
`docs/adr/NNNN-titulo-em-kebab-case.md` com as seções: Contexto, Decisão,
Consequências e Alternativas consideradas. ADRs não são reescritos: quando uma
decisão muda, o ADR antigo recebe `Status: substituído por ADR NNNN`.

## Consequências

- Histórico rastreável das escolhas, em especial das que se afastam da SPEC.
- Um passo extra por decisão relevante.

## Alternativas consideradas

- Registrar tudo só nas mensagens de commit: difícil de achar depois.
- Um único arquivo `DECISIONS.md`: cresce e gera conflitos de edição.
