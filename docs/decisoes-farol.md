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

## D-008 — Contrato disponível e primeiro adaptador

**Data:** 2026-11-06
**Status:** vigente para esta implementação
**Contexto:** o repositório contém o padrão e o plano, mas não contém a especificação funcional, o handoff ou o paper. O histórico não recuperou essas fontes; T1–T5 não estão definidos.
**Decisão:** implementar os requisitos comprovados pelo contrato explícito `contrato-mvp-provisorio.md`, com extensão Chromium e página de prática. Não atribuir a implementação aos T1–T5 nem declarar conformidade com documentos ausentes.
**Impacto:** o adaptador de navegador embutido e a validação acadêmica ficam pendentes. Revisão de integração pelo agente principal.
**Evidência:** inventário do commit base `b307be7`; contrato e testes do MVP.

## D-009 — Roteiros seguros e custo zero

**Data:** 2026-11-06
**Status:** vigente
**Contexto:** não há provedor de IA configurado ou contrato de modelo verificável.
**Decisão:** roteiros por regras locais e templates conhecidos; backend opcional com os mesmos contratos. Só enums e IDs efêmeros podem sair do aparelho, após consentimento explícito da sessão. Não enviar rótulos brutos, conteúdo, URL ou valores.
**Impacto:** a versão não pesquisa nem aprende novos fluxos autonomamente. Cache reutiliza estruturas e preferências; não armazena progresso de autenticação, histórico de páginas ou dados digitados. A adaptação de linguagem é controlada pela pessoa.
**Evidência:** `src/core/`, `server/`, testes de privacidade e consentimento.

## D-010 — Publicação por lista explícita

**Data:** 2026-11-06
**Status:** substitui o trecho de D-001 sobre a localização do diretório Git
**Contexto:** o Git atual contém site e documentação na raiz. Publicar a raiz exporia documentos internos.
**Decisão:** manter um repositório; gerar `paginas-farol/` com lista explícita somente de landing, demonstrações e assets públicos. Backend, documentação e testes ficam fora.
**Impacto:** um workflow de Pages deve publicar exclusivamente esse artefato; ativação de hospedagem depende da configuração do repositório. Entrega em branch e PR preserva a revisão antes do deploy.
**Evidência:** `scripts/build.mjs`, teste da distribuição e workflow Pages manual.

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
