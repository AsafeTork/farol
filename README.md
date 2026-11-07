# Farol — orientação digital passo a passo

O Farol é um protótipo do IAssistente Intergeracional, do IFPA Bragança. Ele destaca campos, explica as etapas e oferece leitura em voz alta; a pessoa lê, digita, clica e toma as decisões. O Gov.br é o caso de referência, mas os roteiros também podem orientar outras páginas.

## Experimentar no computador

É necessário ter Node.js 22 ou superior. No terminal, dentro da pasta do projeto:

```sh
npm run dev
```

Abra o endereço mostrado no terminal, normalmente `http://127.0.0.1:4173/pratica.html`. A atividade é fictícia, sem conta nem ligação com um serviço público. Clique em **Começar orientação** na página e novamente no painel do Farol para iniciar o roteiro. A voz é opcional e depende de uma voz local em português instalada no aparelho.

## Usar a extensão Chromium

1. Execute `npm run build` na pasta do projeto.
2. Abra `chrome://extensions` no Chrome ou a página de extensões equivalente no Edge.
3. Ative o **Modo do desenvolvedor**, escolha **Carregar sem compactação** e selecione a pasta `dist/extension` gerada no passo 1.
4. Abra uma página com formulário e clique no ícone Farol. O guia pede que você escolha um objetivo antes de preparar os passos.

A extensão só é acionada na aba escolhida. Páginas internas do navegador, alguns serviços protegidos, componentes personalizados e formulários em outros quadros podem não ser orientados. Revise o destino antes de digitar informações pessoais; o Farol não é um serviço oficial do Gov.br e não confirma o resultado de uma operação.

## Privacidade e funcionamento

O planejamento padrão acontece no navegador por regras e textos locais. Valores digitados, credenciais, endereços das páginas e rótulos brutos não entram na estrutura transferível. O cache contém apenas estruturas padronizadas e roteiros; as preferências e o cache podem ser apagados no painel. O MVP não usa microfone e não automatiza cliques, preenchimentos ou decisões.

O serviço HTTP local é opcional e desativado por padrão. É preciso configurá-lo e autorizar seu uso em cada sessão; ele trabalha com os mesmos roteiros determinísticos. As instruções e limitações estão em [server/README.md](server/README.md). Esta versão não usa IA remota nem aprende fluxos por conta própria. A Sessão Viva mostrada na página é uma proposta posterior ao MVP.

## Desenvolvimento e verificações

```sh
npm run validate          # sintaxe, testes de módulos e build
npm run test:browser      # requer npm install e Chromium do Playwright
```

Para preparar o navegador do teste visual, use `npm install` e `npx playwright install chromium` em um ambiente com acesso aos repositórios necessários. O build gera `paginas-farol/` com uma lista explícita de conteúdo público e `dist/extension/` com a extensão. O workflow manual do GitHub Pages publica somente o primeiro diretório depois de configurado no repositório.

## Fontes e limites

O contrato de implementação consultado está em [docs/contrato-mvp-provisorio.md](docs/contrato-mvp-provisorio.md). A especificação funcional, o handoff visual e o paper citados nos documentos existentes não foram encontrados no repositório; a conformidade integral e os requisitos T1–T5 precisam ser conferidos quando essas fontes estiverem disponíveis. A implementação precisa de avaliação com as pessoas que pretende atender e de testes em navegadores reais.
