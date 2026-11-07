# Farol para Android — atividade de prática

Este módulo empacota a página de prática e o painel compartilhado do projeto em um WebView. O pacote é `io.github.asafetork.farol` e requer Android 8.0 (API 26) ou superior, com Android System WebView atualizado.

A versão é uma **demonstração offline**. A atividade contém apenas formulários fictícios; o aplicativo não acessa portais reais ou a conta Gov.br. Não solicita as permissões de internet, câmera ou microfone. A pessoa executa e confirma cada ação. A voz usa TextToSpeech do Android somente quando há uma voz pt-BR identificada como local; sem essa voz, as instruções em texto continuam disponíveis.

## Gerar um APK de teste

Pré-requisitos: JDK 17, Gradle 8.9, Android SDK Platform 35 e Android SDK Build-Tools 35.0.0, com `ANDROID_HOME` apontando para o SDK. Na raiz do repositório:

```sh
gradle -p android :app:assembleDebug
```

O APK de teste, assinado pela chave de depuração do ambiente que o construiu, é gerado em `android/app/build/outputs/apk/debug/app-debug.apk`. A chave de depuração não é uma assinatura para publicação em loja. Caso o aparelho já possua uma instalação assinada por outra chave, a atualização será recusada; preserve ou remova seus dados somente com autorização da pessoa responsável pelo aparelho.

O build copia uma lista explícita de assets do protótipo web e inclui o adaptador de voz Android. Arquivos internos de documentação, a extensão e o backend não entram no APK. Não é necessário executar `npm install` para o build Android.

## Validação disponível sem SDK Android

```sh
node --test android/tests/voice-adapter.test.mjs
```

Esse teste cobre o adaptador JavaScript com uma ponte simulada; ele não compila o aplicativo nem substitui a instalação e os testes no Android. O ambiente de implementação não dispunha de SDK, Gradle ou aparelho: verifique no dispositivo, em especial, o carregamento da página offline por interceptação do WebView sem a permissão `INTERNET` e a reprodução da voz local. O roteiro ADB completo encontra-se na documentação da release.
