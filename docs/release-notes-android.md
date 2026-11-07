# Farol Android — versão de testes

Esta é uma compilação de **depuração** destinada à avaliação do protótipo. O aplicativo contém a atividade de prática offline e o guia por texto, destaque e voz local quando uma voz compatível estiver disponível no aparelho. Não orienta páginas reais nem acessa a conta Gov.br. A Sessão Viva e o microfone não estão incluídos.

A depuração do WebView está habilitada nessa compilação. Ela permite inspecionar o conteúdo da tela em um ambiente de depuração autorizado: use somente dados fictícios e dispositivos de teste.

Baixe `farol-android-debug.apk`, confira o arquivo `SHA256SUMS` e siga `testes-android-adb.md`. A instalação por ADB requer um aparelho ou emulador Android compatível e autorizado. Os testes descritos no roteiro não devem ser interpretados como executados até haver evidências do aparelho.

O APK usa a chave de depuração gerada pelo ambiente de build. Builds gerados em máquinas diferentes podem ter assinaturas diferentes e, nesse caso, o Android pode recusar a atualização por cima de uma versão anterior. Preserve os dados e obtenha autorização antes de desinstalar qualquer aplicativo. Uma assinatura de produção está fora desta entrega.
