# Registro de decisões — Projeto Farol

Este é o registro normativo de decisões do projeto. Uma decisão nova deve incluir data, contexto, escolha, impacto e responsável pela revisão.

## D-001 — Fonte publicada

**Status:** vigente  
**Decisão:** `paginas-farol/` é o único diretório Git e a única fonte enviada ao GitHub Pages.  
**Impacto:** documentos acadêmicos e internos permanecem fora da publicação.

## D-002 — Caso-âncora e escopo

**Status:** vigente  
**Decisão:** idosos em fluxos Gov.br são a persona e o caso-âncora; a arquitetura de skills deve permitir outros portais.  
**Impacto:** a copy pode usar Gov.br como exemplo sem definir o produto como exclusivo dele.

## D-003 — Tutoria reversa

**Status:** vigente  
**Decisão:** o Farol ensina e guia; a pessoa executa e decide. Skills por sistema evoluem com o uso.  
**Impacto:** não há clique automático, autofill ou execução silenciosa.

## D-004 — Privacidade

**Status:** vigente  
**Decisão:** saneamento e pseudonimização acontecem localmente; credenciais e valores digitados nunca saem do aparelho. A nuvem recebe apenas estrutura saneada, conforme consentimento e política de retenção.  
**Impacto:** qualquer integração nova precisa demonstrar o filtro antes da chamada externa.

## D-005 — Separação do MVP e da Sessão Viva

**Status:** vigente  
**Decisão:** o MVP usa TTS nativo e não exige microfone. A Sessão Viva é uma camada evolutiva/pós-MVP, com microfone opt-in por sessão e encerramento explícito.  
**Impacto:** demo e landing devem sinalizar claramente essa diferença.

## D-006 — Sistema visual

**Status:** vigente  
**Decisão:** usar noite `#04183F`, azul `#1351B4`, amarelo `#FFCD07`, caixa escura `#0C326F`, Archivo e Atkinson Hyperlegible, escala de espaçamento de 8pt e contraste mínimo WCAG AA.  
**Impacto:** novos componentes devem usar tokens do handoff e respeitar a auditoria visual.

## D-007 — Uso de agentes

**Status:** vigente  
**Decisão:** agentes trabalham por função, com escopo explícito e artefato verificável; o agente principal integra, valida e decide a publicação.  
**Impacto:** nenhum agente publica diretamente nem considera sua própria saída como evidência final.

## Modelo para novas decisões

```md
## D-XXX — Título

**Data:** AAAA-MM-DD  
**Status:** proposta | vigente | substituída
**Contexto:** problema ou pergunta.
**Decisão:** escolha adotada.
**Impacto:** arquivos, produto, custo, risco ou processo afetado.
**Evidência:** arquivo, teste, captura ou fonte.
```
