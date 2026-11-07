# Estado da implementação do MVP

**Referência:** contrato provisório, D-002–D-010 e plano de implementação. A ausência da especificação funcional, do handoff e do artigo impede comprovar T1–T5 e a conformidade integral.

| Objetivo verificável nas fontes disponíveis | Implementação | Verificação |
| --- | --- | --- |
| A pessoa executa as ações; orientação em texto e destaque | `src/ui/assistant.mjs`, `src/core/planner.mjs` | Testes de templates e planejamento; interação em navegador ainda pendente |
| Voz nativa sem microfone | `src/ui/assistant.mjs` | Sintaxe verificada; precisa de navegador com voz local em português |
| Dados digitados e credenciais no aparelho | `src/core/privacy.mjs` | `tests/core.test.mjs` usa acessores que falham se valores forem lidos e verifica snapshots sem conteúdo sensível |
| Roteiros e cache com fallback | `src/core/planner.mjs`, `src/ui/assistant.mjs` | Testes de roteiros adulterados, metas, cache e falhas da API |
| `/plan` e `/explain-error` | `server/index.mjs` | `tests/server.test.mjs` cobre consentimento, esquema estrito, CORS, token, limites e integração simulada com a extensão |
| Separação do conteúdo público | `scripts/build.mjs`, `.github/workflows/pages.yml` | `tests/distribution.test.mjs` verifica a lista explícita e a ausência de documentos internos no site gerado |

O protótipo usa uma extensão Chromium e uma atividade local. Não usa inteligência artificial remota, navegador embutido nem captura de microfone. Não detecta automaticamente todos os tipos de erro e não aperfeiçoa skills autonomamente; as regras e explicações são locais e pré-definidas.

## Evidências e pendências

- `npm run validate`: testes de módulo e distribuição, checagem de sintaxe e build. A saída exata é a execução realizada no ambiente da implementação.
- `npm run test:browser`: preparado para desktop e largura de 375 px, mas não executado com sucesso no ambiente original porque Chromium não estava instalado e o download disponível não retornou um arquivo válido. A integração real da extensão e a experiência com teclado, voz, leitores de tela, contraste e sobreposição continuam pendentes.
- O workflow de verificação inclui uma etapa que instala Chromium e tenta gerar capturas no GitHub Actions. Falhas dessa etapa precisam ser investigadas antes de publicação.
- Sessão Viva continua sendo uma prancha conceitual posterior ao MVP. A implantação exige decisões próprias de tecnologia, consentimento, custo e tratamento de áudio.
- O serviço usa regras determinísticas locais; integrar modelo externo e aprendizagem de roteiros depende de requisitos, consentimento e especificação de privacidade verificáveis.
