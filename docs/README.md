# Documentação do Projeto Farol

Este diretório contém a documentação interna do Projeto Farol. Nenhum arquivo daqui deve ser publicado no GitHub Pages.

## Ordem de leitura

1. [`padrao-projeto-farol.md`](padrao-projeto-farol.md) — padrão geral, fontes da verdade e critérios de qualidade.
2. [`decisoes-farol.md`](decisoes-farol.md) — decisões normativas e limites do MVP.
3. [`plano-implementacao-agentes.md`](plano-implementacao-agentes.md) — fluxo de trabalho, agentes, fases e critérios de aceite.
4. [`especificacao-funcional-iassistente.md`](especificacao-funcional-iassistente.md) — contrato funcional e técnico do MVP.
5. [`handoff-implementacao-farol.md`](handoff-implementacao-farol.md) — tokens, componentes e Sessão Viva.

A especificação e o handoff citados nos itens 4 e 5, assim como o paper, não foram encontrados neste repositório. As escolhas de engenharia adotadas enquanto faltam estão em [`contrato-mvp-provisorio.md`](contrato-mvp-provisorio.md); o que foi implementado e o que ainda precisa ser verificado está em [`estado-mvp.md`](estado-mvp.md).

## Hierarquia de autoridade

- O paper define a proposta acadêmica e os requisitos que não podem ser contraditos.
- A especificação funcional detalha o MVP implementável.
- O padrão e o registro de decisões organizam o trabalho e resolvem conflitos operacionais.
- O handoff detalha a identidade visual e a Sessão Viva.
- Mockups e evidências comprovam decisões visuais; não substituem os documentos normativos.

Quando houver conflito, registrar a dúvida em `decisoes-farol.md` antes de alterar código ou copy.
