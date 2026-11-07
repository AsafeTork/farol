# Roteiro para uma IA testar o Farol no Android com ADB

Este roteiro descreve **o que executar e como registrar os resultados**. A existência do roteiro não significa que os testes tenham sido executados. Não marque um item como aprovado sem observar o resultado no aparelho ou emulador e registrar a evidência correspondente.

## Escopo da versão Android

O aplicativo empacota a atividade de prática do Farol. Os dois formulários são fictícios e não enviam uma solicitação a um órgão público. O guia usa instruções locais para orientar os campos e a pessoa executa cada ação. A versão descrita aqui não inclui navegação em portais reais, login Gov.br, IA remota ou Sessão Viva com microfone.

| Item | Valor esperado |
| --- | --- |
| Pacote | `io.github.asafetork.farol` |
| Activity inicial | `io.github.asafetork.farol/.MainActivity` |
| Android mínimo | 8.0 / API 26 |
| APK de desenvolvimento | `farol-android-debug.apk`, se esse for o arquivo anexado à release |
| Dados para teste | `Pessoa de exemplo` e `pessoa@exemplo.invalid` |
| Permissões esperadas no manifesto | Nenhuma permissão de Internet ou microfone; confirme no APK efetivamente baixado |
| Outros arquivos da release | `SHA256SUMS` para integridade e `permissoes.txt` com a inspeção produzida no build |

O nome final do APK, a versão e a assinatura devem ser confirmados nos artefatos da release. Se divergirem da tabela, interrompa o roteiro e informe a divergência; não corrija um resultado esperado para fazer o teste passar. O APK de depuração habilita a inspeção do WebView, que pode expor o conteúdo apresentado a ferramentas de depuração autorizadas; use apenas dados fictícios e dispositivos de teste.

## Regras de execução

1. Use preferencialmente um **emulador dedicado**. Em telefone físico, a pessoa responsável precisa ter autorizado a depuração USB e a instalação do APK.
2. Não use CPF, senhas, e-mails reais, tokens, dados bancários ou qualquer dado de outra pessoa. Capturas de tela e hierarquias de interface também podem conter notificações ou dados de outros aplicativos: confira-as antes de guardar ou compartilhar.
3. Use sempre `adb -s "$FAROL_SERIAL"` para agir somente no dispositivo escolhido. Se mais de um estiver conectado, não escolha silenciosamente o aparelho de outra pessoa.
4. Não use `adb root`, não desbloqueie o bootloader e não execute `pm clear`, `adb uninstall`, reset de fábrica ou alteração de permissões fora do escopo sem autorização específica. Não limpe o buffer de log do dispositivo: ele pode ser necessário a outras atividades.
5. Não desligue rede, acessibilidade ou serviços de um telefone de uso pessoal automaticamente. Faça testes que mudam configurações apenas em emulador dedicado ou com autorização específica, anotando e restaurando o estado original.
6. Não tente contornar telas protegidas ou ativar permissões ausentes para fazer um caso passar. Registre incompatibilidades e bloqueios.

## 1. Preparar ferramentas e identificar o APK

Requisitos no computador: Android SDK Platform Tools com `adb`, o APK baixado da release e, para inspeção da assinatura e do manifesto, `apksigner` e `aapt` do Android SDK Build Tools. O emulador precisa de Android 8.0 ou posterior e do componente Android System WebView funcional. Uma voz local em português é necessária para testar a leitura em voz alta.

```bash
adb version
adb devices -l

# Informe o arquivo que foi realmente baixado. Não execute este exemplo com
# um caminho inexistente nem pesquise arquivos pessoais sem necessidade.
FAROL_APK="/caminho/para/farol-android-debug.apk"
test -r "$FAROL_APK" || { printf '%s\n' 'APK não encontrado ou sem acesso.'; exit 1; }
sha256sum "$FAROL_APK"
```

Compare o hash com o valor publicado junto ao **mesmo arquivo** na release. Se a release trouxer `SHA256SUMS` com nomes relativos, coloque os dois arquivos no mesmo diretório e execute ali `sha256sum -c SHA256SUMS`. Se não houver hash publicado, anote o hash calculado como identificação do teste; isso, sozinho, não autentica a origem do APK. O arquivo `permissoes.txt`, quando disponibilizado, ajuda na conferência, mas também deve ser comparado com a inspeção do APK baixado.

Se as ferramentas estiverem instaladas:

```bash
apksigner verify --verbose --print-certs "$FAROL_APK"
aapt dump badging "$FAROL_APK"
aapt dump permissions "$FAROL_APK"
```

Registre o pacote, versão, SDK mínimo, certificado e resultado da verificação. Examine as linhas `uses-permission`: `android.permission.INTERNET` e `android.permission.RECORD_AUDIO` devem estar ausentes nesta versão. Se `apksigner` ou `aapt` estiverem indisponíveis, marque a inspeção correspondente como **bloqueada**; a instalação bem-sucedida não substitui essa verificação. Uma assinatura de depuração é adequada para testes e não equivale a uma chave de produção.

## 2. Selecionar o dispositivo com segurança

```bash
adb devices -l
# Copie exatamente um serial que apareça com estado "device".
FAROL_SERIAL="emulator-5554"
FAROL_PACKAGE="io.github.asafetork.farol"

adb -s "$FAROL_SERIAL" get-state
adb -s "$FAROL_SERIAL" shell getprop ro.build.version.release
adb -s "$FAROL_SERIAL" shell getprop ro.build.version.sdk
adb -s "$FAROL_SERIAL" shell getprop ro.product.cpu.abi
adb -s "$FAROL_SERIAL" shell wm size
adb -s "$FAROL_SERIAL" shell wm density
adb -s "$FAROL_SERIAL" shell pm path "$FAROL_PACKAGE"
```

Substitua o serial de exemplo. Se o estado for `unauthorized`, solicite que a pessoa responsável confirme a chave de depuração no aparelho; não tente contornar a confirmação. `offline`, dispositivo ausente ou API abaixo de 26 bloqueiam o teste. O comando `pm path` informa se há uma instalação existente: se houver, não a substitua sem antes confirmar que o aparelho e a instalação são de teste. Registre apenas o modelo, versão e API necessários para reproduzir; não publique o serial do aparelho.

## 3. Instalar e iniciar

Em um dispositivo de teste sem instalação anterior:

```bash
adb -s "$FAROL_SERIAL" install "$FAROL_APK"
adb -s "$FAROL_SERIAL" shell am start -W -n "$FAROL_PACKAGE/.MainActivity"
```

Espere a instalação retornar `Success` e a activity abrir; anote mensagens de erro sem expor dados pessoais. Se o APK for marcado como teste, `adb install -t` pode ser necessário. Não use `-r` automaticamente em uma instalação existente: ele substitui o aplicativo preservando dados e pode executar migrações. Em um emulador dedicado ou após autorização para substituir **essa instalação**, a atualização pode ser tentada com `adb -s "$FAROL_SERIAL" install -r "$FAROL_APK"`.

Se ocorrer `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, registre a incompatibilidade de assinatura. **Não desinstale o aplicativo existente para contornar o erro**: a desinstalação pode apagar seus dados. Com o aplicativo em primeiro plano, confirme visualmente que a tela é do Farol antes de enviar qualquer toque ou digitação pelo ADB.

## 4. Coletar evidências sem dados reais

Guarde as evidências em um diretório local de teste fora do conteúdo publicado. Antes de capturar, confira se não há notificações privadas, outro aplicativo, teclado com sugestões pessoais ou dados reais visíveis.

```bash
mkdir -p evidencias-android
adb -s "$FAROL_SERIAL" exec-out screencap -p > evidencias-android/01-inicio.png

# Faça outra captura após cada caso que precisar de evidência visual:
adb -s "$FAROL_SERIAL" exec-out screencap -p > evidencias-android/02-guia.png
```

Para inspecionar nomes acessíveis e posições atuais, se o dispositivo suportar o comando abaixo:

```bash
adb -s "$FAROL_SERIAL" exec-out uiautomator dump /dev/tty > evidencias-android/tela.xml
```

O XML pode conter o texto visível na tela, inclusive o que foi digitado. Use dados fictícios e examine o arquivo antes de compartilhá-lo. Se a hierarquia vier vazia, incompleta ou com erro, registre a limitação e use a captura de tela; uma hierarquia incompleta não prova que a interface é inacessível.

Para diagnosticar falhas após reproduzi-las, obtenha o PID **atual** do aplicativo e filtre o log por esse processo:

```bash
FAROL_PID="$(adb -s "$FAROL_SERIAL" shell pidof "$FAROL_PACKAGE" | tr -d '\r' | awk '{print $1}')"
if [ -n "$FAROL_PID" ]; then
  adb -s "$FAROL_SERIAL" logcat -d --pid="$FAROL_PID" -v brief '*:W' > evidencias-android/farol-warnings.txt
else
  printf '%s\n' 'Processo ausente: registre a falha e não conclua que o log está limpo.'
fi
```

Logs podem conter conteúdo sensível. Leia e remova informações pessoais antes de compartilhar. Se o aplicativo reiniciou ou caiu, o PID pode ter mudado: esse filtro não garante que um erro anterior apareça. Não colete o log completo de outros aplicativos sem necessidade e autorização.

## 5. Executar os cenários

Os toques e digitações devem ocorrer somente na activity de teste. Use a hierarquia acessível ou uma captura atual para localizar cada controle; não reutilize coordenadas fixas em telas com resolução, zoom ou orientação diferentes. A automação pode usar `adb -s "$FAROL_SERIAL" shell input tap X Y` e `adb -s "$FAROL_SERIAL" shell input text 'Pessoa%sde%sexemplo'` depois de verificar onde está o campo. `%s` representa espaço para o comando `input text`; confira o texto resultante. Para o e-mail fictício, use `pessoa@exemplo.invalid`.

| ID | Ação | Resultado a observar | Evidência |
| --- | --- | --- | --- |
| A01 | Instalar e abrir | App abre a prática; não solicita microfone nem autenticação. Nenhuma tela se apresenta como serviço Gov.br real. | Saída da instalação, screenshot inicial e versão/API. |
| A02 | Deixar o primeiro formulário vazio e tocar em **Continuar** | A atividade aponta a falta de campo obrigatório, sem avançar para a confirmação. | Captura com aviso e campo indicado. |
| A03 | Tocar em **Começar orientação** na atividade e depois no painel | O painel apresenta etapas em português e destaca um campo. Nenhum valor é preenchido e nenhum botão do formulário é acionado pelo guia. | Captura do painel e do primeiro campo vazio. |
| A04 | Preencher nome e e-mail fictícios, escolher um assunto e avançar no guia passo a passo | As instruções acompanham o campo indicado; a pessoa escolhe quando avançar. O botão de envio requer toque da pessoa. | Capturas ou notas do primeiro, segundo e último passo. |
| A05 | Pausar, retomar, voltar, recolher e reabrir o painel | Cada controle responde e o guia permanece utilizável; destaque e voz não continuam durante a pausa. | Capturas/notas do estado pausado e retomado. |
| A06 | Na etapa de confirmação, tentar concluir sem marcar a opção; depois marcar e concluir | Primeiro aparece um aviso; depois surge **Prática concluída**. Isso não representa uma solicitação real. | Capturas do aviso e do resultado. |
| A07 | Recomeçar a atividade | Retorna ao formulário de prática; não conserva involuntariamente os valores de teste em campos reiniciados. | Captura do formulário reiniciado. |
| A08 | Ligar a opção de voz e usar **Ouvir passo** | Com voz local em português disponível, a orientação é audível e pode ser interrompida. Sem voz compatível, há orientação em texto e mensagem compreensível. | Nome da voz local, resultado audível ou bloqueio observado. |
| A09 | Verificar o pacote instalado e o manifesto do APK | Pacote corresponde ao arquivo baixado; permissões de Internet e gravação de áudio não são solicitadas. | Saídas de `aapt` e `pm path`, sem serial. |
| A10 | Testar com rede desligada em emulador dedicado | A prática, o roteiro e, quando houver voz local, a fala continuam utilizáveis. Restaurar a configuração original após o teste. | Antes/depois do estado da rede e resultado por recurso. |
| A11 | Navegar por teclado e, se disponível, TalkBack; testar fonte ampliada e rotação | Controles identificáveis, ordem de foco compreensível, texto legível e botões acessíveis sem sobreposição que impeça a tarefa. | Comandos observados, capturas e limitações de recurso. |
| A12 | Encerrar e abrir novamente; consultar logs filtrados | A activity reabre sem travar. Nenhum valor fictício aparece indevidamente no log coletado. | Saída de inicialização, log revisado e capturas pertinentes. |

No A04, o primeiro **Continuar** do formulário abre a etapa com uma caixa de confirmação e o botão **Concluir atividade**. No A08, um mecanismo sem voz local em português, áudio desativado ou permissão do dispositivo indisponível deve ser descrito como **bloqueio ambiental**, e não como teste de voz aprovado. No A10, confirme o estado da rede pela interface do emulador e registre-o; não desconecte a rede de um aparelho de uso pessoal sem autorização.

Para A11, use os controles do emulador ou a interface do aparelho em vez de modificar configurações globais por script. Se a configuração de tamanho de fonte, orientação ou TalkBack for alterada com autorização, registre o valor anterior e restaure-o. Um teste com capturas ou inspeção da hierarquia não substitui uma avaliação com leitor de tela e usuários reais.

## 6. Critérios para concluir

Considere a execução **aprovada para este aparelho** somente se a identidade/assinatura do APK foi conferida, A01–A07 e A09 passaram, não há travamento que impeça o uso e não há divulgação de dados fictícios nos registros examinados. A08, A10 e A11 precisam ter resultado observado ou ser declarados bloqueados explicitamente; para considerar o produto validado em voz, offline ou acessibilidade, os respectivos casos também precisam passar.

Não conclua que o Farol está pronto para produção, que funciona em outros modelos, que o Gov.br foi integrado ou que a privacidade está provada por uma única inspeção. O manifesto, as capturas e os logs ajudam a investigar; eles não substituem testes em vários aparelhos, análise do código, medição de tráfego quando aplicável e validação com pessoas.

## 7. Entrega da outra IA

Preencha e entregue este relatório, substituindo cada campo por observações reais:

```text
Resultado geral: aprovado no aparelho | reprovado | bloqueado | não executado
APK: nome, versão e SHA-256
Assinatura: verificada | falhou | bloqueada; motivo
Dispositivo: emulador ou modelo, Android/API, arquitetura, resolução, WebView
Data, ambiente e comandos executados: ...
Casos A01–A12: aprovado / reprovado / bloqueado / não executado, com motivo
Falhas: passos para reproduzir, comportamento esperado e observado
Evidências: caminhos locais e descrição; indicar se foram revisadas para dados sensíveis
Limitações e riscos restantes: ...
```

## Referências oficiais

- [Android Debug Bridge: instalação, comandos e capturas](https://developer.android.com/tools/adb)
- [Verificação de assinatura com apksigner](https://developer.android.com/tools/apksigner)
- [Testes com UI Automator](https://developer.android.com/training/testing/other-components/ui-automator)
