# Serviço opcional de orientação

O MVP funciona localmente no navegador. Este servidor oferece as mesmas regras determinísticas em `/plan` e `/explain-error`, para exercitar o contrato de integração sem contratar um modelo. Não é um serviço de IA e não inclui Sessão Viva, autenticação Gov.br ou microfone.

## Execução

Requer Node.js 22 ou posterior. Na raiz do projeto:

```bash
node server/index.mjs
```

Por padrão, escuta somente em `127.0.0.1:8787`. O arquivo `.env.example` documenta as variáveis; ele não é carregado automaticamente. Pode-se exportá-las no shell ou usar `node --env-file=.env server/index.mjs` depois de criar uma cópia local.

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `FAROL_HOST` | `127.0.0.1` | IP de escuta; `localhost` também é aceito |
| `FAROL_PORT` | `8787` | Porta HTTP |
| `FAROL_ALLOWED_ORIGINS` | `http://127.0.0.1:4173,http://localhost:4173` | Origens exatas separadas por vírgula; sem `/` final, caminhos ou `*` |
| `FAROL_API_TOKEN` | vazio | Token bearer opcional em loopback, obrigatório em outros endereços ou para clientes sem `Origin`; de 32 a 256 caracteres alfanuméricos ou `._~-` |

Para a extensão, acrescente `chrome-extension://ID_DA_EXTENSAO` à allowlist, substituindo pelo ID real exibido em `chrome://extensions`. Caso o navegador omita `Origin` no service worker, configure também o mesmo token no servidor e nas opções da extensão. Um token pode ser gerado localmente com `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Não faça commit desse token. Se houver token configurado, ele passa a ser obrigatório em toda requisição de planejamento ou explicação, mesmo de origens autorizadas.

Uma implantação externa precisará de HTTPS, controle de acesso, limites de infraestrutura e política operacional próprios. A configuração entregue é para uso local; não há serviço externo publicado pelo projeto.

## Contrato

`GET /health` retorna `{ "status": "ok", "mode": "rules", "schemaVersion": 1 }` e não revela configuração. Não exige token. Uma origem fornecida continua sujeita à allowlist.

`POST /plan`, `Content-Type: application/json`:

```json
{
  "schemaVersion": 1,
  "consent": true,
  "snapshot": {
    "schemaVersion": 1,
    "context": "practice",
    "controls": [
      { "id": "c1", "kind": "email", "label": "email", "required": true, "disabled": false }
    ]
  },
  "goal": "form",
  "verbosity": "detailed"
}
```

O resultado é o plano `{ schemaVersion, source: 'local', steps }` definido em `docs/contrato-mvp-provisorio.md`. O cliente deve validar novamente o plano antes de usá-lo.

`POST /explain-error` recebe somente `{ "schemaVersion": 1, "consent": true, "code": "required" }`. Os códigos permitidos são `required`, `format`, `length`, `range`, `connection` e `unknown`. O resultado é `{ code, title, instruction }`. Não enviar mensagens de erro originais.

Erros têm formato `{ "error": { "code": "invalid_request", "message": "…" } }`. O cliente mantém a orientação local se houver recusa, indisponibilidade ou timeout. `OPTIONS` trata apenas preflight das rotas declaradas; `Access-Control-Allow-Origin` sempre contém uma origem exata.

## Privacidade e limites

- O filtro local envia apenas tipos e rótulos canônicos. O servidor valida a mesma allowlist estrita e rejeita propriedades adicionais, valores, URLs e rótulos livres.
- Consentimento explícito por sessão é responsabilidade da interface; o servidor exige `consent: true` em cada solicitação. Esse campo não substitui a interface de consentimento.
- Sem armazenamento de conteúdo, logging de payloads, cookies, telemetria, chamadas a provedores ou histórico. Buffers são liberados após o processamento; não há garantia de apagamento físico da memória do processo.
- Limite de corpo: 24 KiB; envio: 5 segundos; cabeçalhos: 8 KiB. Respostas usam `Cache-Control: no-store` e `nosniff`.
- Limite padrão: 60 requisições por minuto por endereço de transporte. No máximo 1.000 contadores temporários em memória. O contador guarda IP, quantidade e expiração; não usa `X-Forwarded-For` e é eliminado ao expirar ou encerrar o servidor. Quando a capacidade acaba, novas origens de transporte recebem 503.
- JSON inválido, consentimento ausente, campos inesperados, origens fora da lista, token incorreto e métodos não permitidos têm respostas estáveis sem ecoar dados recebidos.
- CORS restringe clientes de navegador; não é autenticação. O bind em loopback limita a exposição padrão, e o token é obrigatório para outro bind. Clientes locais autorizados compartilham o limite por IP.

## Validação

```bash
node --test tests/server.test.mjs
```

Os testes usam portas efêmeras de loopback e cobrem contrato válido, saneamento, limites, consentimento, autenticação, CORS, métodos e falhas de transporte. Não acessam serviços externos.
