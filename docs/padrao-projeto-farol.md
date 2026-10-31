# Padrão do Projeto Farol

**Status:** padrão vigente  
**Escopo:** documentação, implementação, revisão e publicação do Farol.

## 1. Identidade do produto

O Farol é um assistente de acessibilidade cognitiva que guia pessoas por fluxos digitais passo a passo. A pessoa executa cada ação; o assistente explica, destaca e lê em voz alta. O Gov.br é o caso-âncora, não o limite arquitetural.

Termos obrigatórios: `Farol`, `IAssistente Intergeracional`, `tutoria reversa`, `skill`, `Sessão Viva`, `MVP`. Usar português do Brasil e evitar prometer funcionalidade que ainda está apenas especificada.

## 2. Fontes da verdade

| Assunto | Fonte principal | Regra |
|---|---|---|
| Proposta, requisitos e riscos | `documento-overleaf/Artigo.tex` | Não contradizer no produto nem na copy. |
| MVP funcional e contratos | `docs/especificacao-funcional-iassistente.md` | Contrato de implementação. |
| Identidade e Sessão Viva | `docs/handoff-implementacao-farol.md` | Norma visual e de interação. |
| Decisões consolidadas | `docs/decisoes-farol.md` | Registrar alterações de direção. |
| Estado publicado | `paginas-farol/` | Único diretório Git e única fonte do Pages. |
| Evidência de validação | `evidencia/` | Toda afirmação de pronto deve apontar para uma evidência. |

`mockups/` e `figuras-fonte/` são fontes de trabalho. `documento-overleaf/`, `pesquisa/` e este diretório são internos e não devem ser publicados em Pages.

## 3. Padrão de implementação

- Fazer a menor mudança que resolve o objetivo.
- Preservar alterações existentes e não apagar arquivos fora do escopo.
- Separar MVP de evolução: a Sessão Viva é demonstração/evolução e não deve ser apresentada como funcionalidade entregue do MVP.
- Para UI, reutilizar tokens, tipografia, componentes e regras de posicionamento do handoff.
- Nunca comunicar estado somente por cor; fornecer texto, foco visível e alternativa para movimento.
- Nunca automatizar o clique, preenchimento ou decisão da pessoa.
- Credenciais e valores digitados nunca saem do dispositivo; somente estrutura saneada pode ser enviada à API.

## 4. Padrão de documentação de uma mudança

Toda mudança relevante deve registrar:

1. objetivo e escopo;
2. fonte da verdade consultada;
3. decisão ou requisito afetado;
4. arquivos alterados;
5. validação executada;
6. evidências geradas;
7. risco ou pendência restante.

## 5. Gates de qualidade

Uma mudança de UI só está pronta quando tiver:

- captura em desktop e 375px salva em `evidencia/`;
- auditoria de overflow, contraste, escala e overlaps;
- verificação de texto e links;
- confirmação de que a landing alterada foi sincronizada para `paginas-farol/index.html`;
- `git diff`, `git status`, commit e push revisados no diretório `paginas-farol/`.

Uma mudança técnica só está pronta quando tiver testes do módulo, tratamento de falhas, impacto de privacidade documentado e rastreabilidade para RF/RNF ou decisão correspondente.

## 6. Regra de publicação

O Pages publica somente `paginas-farol/`. Paper, handoff, especificações, fontes Overleaf, auditorias internas e documentos de agentes não entram nesse diretório. Antes do push, conferir o diff completo e os arquivos rastreados.
