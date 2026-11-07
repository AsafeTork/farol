# Contrato de implementação do MVP — 6 de novembro de 2026

Base: `padrao-projeto-farol.md`, decisões D-001–D-007, plano de agentes e ciclos C1–C5 descritos na landing. A especificação funcional, o handoff e o paper citados não estão no repositório nem foram localizados. Este contrato explicita escolhas de engenharia; não substitui essas fontes nem inventa T1–T5.

## Escopo

MVP executável com extensão Chromium acionada pela pessoa, ambiente de prática local, orientação por etapas, TTS nativo, destaque do alvo, explicação de erros conhecidos, preferências e cache local de roteiros sem valores. Backend HTTP opcional `/plan` e `/explain-error`, por regras determinísticas, sem chave ou custo de modelo. Sessão Viva permanece ilustração pós-MVP; nenhuma captura de microfone ou execução de clique/preenchimento.

O navegador embutido mencionado na landing é uma direção futura. A extensão é o adaptador implementado para orientar a página real; a prática reproduz uma tarefa didática, sem integrar autenticação Gov.br.

## Contratos compartilhados (ES modules, sem dependências de produção)

`src/core/privacy.mjs`:

- `capturePage(document)` retorna `{ snapshot, targets }`, com `targets: Map<string, Element>` apenas em memória.
- `snapshot = { schemaVersion: 1, context: 'generic' | 'govbr' | 'practice', controls: [{ id, kind, label, required, disabled }] }`.
- IDs efêmeros `c1`…`c80`; kinds `text`, `password`, `email`, `tel`, `number`, `search`, `select`, `checkbox`, `radio`, `textarea`, `button`, `link`.
- Labels são exclusivamente canônicos: `cpf`, `password`, `email`, `name`, `phone`, `search`, `continue`, `submit`, `back`, `signin`, `option`, `field`, `link`, `button`. Nunca copiar rótulo bruto, texto de página, valores, URLs, IDs DOM ou mensagens de erro para a estrutura transferível.
- `validateSnapshot(snapshot)` valida estritamente o contrato e retorna boolean.

`src/core/planner.mjs`:

- `createPlan(snapshot, { goal = 'form', verbosity = 'detailed' } = {})` retorna `{ schemaVersion: 1, source: 'local', steps: [{ targetId, action, title, instruction }] }`.
- Goals `form`, `signin`, `search`; verbosity `detailed` ou `brief`; actions `fill`, `choose`, `activate`, `read`.
- `validatePlan(plan, snapshot)` retorna boolean. Planos só referenciam alvos existentes; instruções devem vir de templates locais seguros, inclusive quando recebidas do backend.
- `explainError(code)` retorna `{ code, title, instruction }`. Códigos `required`, `format`, `length`, `range`, `connection`, `unknown`; nenhum texto livre de erro é enviado.
- `structuralKey(snapshot, goal, verbosity)` retorna chave determinística sem dados pessoais para cache. Sempre revalidar cache com snapshot atual.

`src/ui/assistant.mjs`: exporta `mountAssistant({ document = globalThis.document, storage, requestPlan, requestExplanation } = {})`; storage é opcional `{ get(key), set(key,value), remove(key) }`, síncrono ou Promise. Retorna `{ destroy() }`. Aceita apenas um painel por página; shadow DOM, botões acessíveis, zero leitura de valores. Extensão e prática usam o mesmo módulo. Não transmitir nada por padrão. Qualquer requestPlan só é invocado após consentimento explícito por sessão; fallback local para erro/timeout. Textos remoto/cache devem ser validados e normalizados por templates locais antes de falar/exibir.

## HTTP opcional

POST `/plan`: `{ schemaVersion: 1, consent: true, snapshot, goal, verbosity }`; resposta JSON é o plano. POST `/explain-error`: `{ schemaVersion: 1, consent: true, code }`; resposta JSON é explicação. Rejeitar propriedades extras, strings fora dos enums, corpo excessivo, consentimento ausente, métodos inválidos e origens fora da allowlist. Não registrar payloads. Sem retenção em disco. Serviço em loopback por padrão; origin/token configuráveis no servidor para outros ambientes.

## Distribuição e evidência

O repositório atual usa a raiz para o site, contrariando o diretório `paginas-farol/` descrito nos docs. O build criará `paginas-farol/` apenas com lista explícita de arquivos públicos; servidor, documentação, testes e fontes internas ficam de fora. Extensão empacotada em `dist/extension/`; evidências em `evidencia/`, nunca no Pages. Mudanças serão entregues em branch e PR revisável, sem publicar um serviço externo.
