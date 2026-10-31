# Plano de implementação com agentes

**Objetivo:** transformar decisões e especificações do Farol em mudanças pequenas, verificáveis e publicáveis sem misturar MVP, Sessão Viva e documentação interna.

## 1. Papéis

| Papel | Modelo preferencial | Responsabilidade | Saída obrigatória |
|---|---|---|---|
| Reconhecimento | Astra | localizar arquivos, mapear impacto, detectar conflitos e inventariar validações existentes | mapa de arquivos + riscos |
| Implementação simples | Luna | copy, manutenção, ajustes pequenos e verificações mecânicas | diff pequeno + teste |
| Implementação média | Sol | alterações de UI, integração de componentes e mudanças técnicas delimitadas | implementação + evidências |
| Revisão crítica | Terra | arquitetura, privacidade, regressões, decisões difíceis e revisão final | parecer com bloqueios ou aceite |
| Integração | agente principal | combinar saídas, resolver conflitos, executar gates e publicar | diff final + evidências + commit/push |

Os nomes dos modelos representam níveis de responsabilidade. Se a ferramenta de agentes não estiver disponível, o agente principal executa o papel localmente e registra isso no handoff.

## 2. Ciclo padrão de trabalho

### Etapa 0 — Preparação

O agente principal define objetivo, escopo, arquivos permitidos e critério de aceite. O Astra lê somente os trechos relevantes e produz o mapa de impacto.

### Etapa 1 — Decisão

Se houver ambiguidade de produto, privacidade, arquitetura ou copy, o Terra revisa a decisão. A escolha adotada entra em `decisoes-farol.md` antes da implementação.

### Etapa 2 — Implementação

Luna ou Sol altera apenas os arquivos autorizados. A saída deve conter resumo, arquivos, riscos, comandos de validação e qualquer pendência. Nenhum agente altera publicação ou faz push nesta etapa.

### Etapa 3 — Verificação

O agente principal executa testes e auditorias. Em UI, captura desktop e 375px em `evidencia/`; em código, executa os testes afetados e verifica privacidade, acessibilidade e regressões.

### Etapa 4 — Revisão

Terra revisa mudanças complexas ou qualquer falha de auditoria. O resultado precisa ser `aceito`, `aceito com pendência documentada` ou `bloqueado`, sempre com evidência.

### Etapa 5 — Integração e publicação

O agente principal sincroniza a landing para `paginas-farol/index.html`, verifica que documentos internos não entraram no diretório publicado e executa:

```bash
git -C paginas-farol diff --check
git -C paginas-farol status --short
git -C paginas-farol add -A
git -C paginas-farol commit -m "tipo: descrição curta"
git -C paginas-farol push
```

Só fazer commit/push depois dos gates e da revisão do diff.

## 3. Fases do produto

### Fase A — Fundação documental

- consolidar fontes da verdade;
- manter decisões em um único registro;
- separar documentação interna de `paginas-farol/`;
- usar este plano em todas as tarefas seguintes.

**Saída:** documentação organizada e padrão aceito.

### Fase B — MVP implementável

- T1–T5;
- ciclos C1–C5;
- TTS nativo;
- backend `/plan` e `/explain-error`;
- saneamento local, skills, fallback e testes de aceite;
- rastreabilidade RF/RNF → módulo → teste.

**Saída:** MVP conforme a especificação funcional, sem microfone e sem execução automática.

### Fase C — Landing e demo pública

- preservar a landing vigente;
- corrigir somente mudanças aprovadas;
- manter Sessão Viva identificada como evolução;
- validar desktop e 375px;
- publicar apenas o conteúdo permitido.

**Saída:** Pages atualizado com evidências arquivadas localmente.

### Fase D — Sessão Viva pós-MVP

- pílula e estados ocioso/ouvindo/pensando/falando;
- legenda textual e microfone opt-in;
- backend `/live` com orçamento;
- anel, marcador e ripple sem cobrir o alvo;
- testes de interrupção, sincronização e desconexão.

**Saída:** evolução explicitamente separada do MVP.

## 4. Critério de aceite da tarefa

Uma tarefa está concluída somente quando:

- o objetivo foi implementado no escopo autorizado;
- as decisões novas foram registradas;
- os arquivos alterados estão listados;
- validações e evidências foram executadas;
- não há documento interno ou fonte acadêmica no Pages;
- o agente principal consegue explicar o risco restante em uma frase.

## 5. Formato de handoff entre agentes

```md
## Handoff — [tarefa]

Objetivo:
Escopo autorizado:
Arquivos lidos:
Arquivos alterados:
Decisões afetadas:
Validações executadas:
Evidências:
Riscos/pendências:
Recomendação: aceitar | revisar | bloquear
```
