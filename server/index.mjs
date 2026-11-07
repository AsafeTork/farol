import { createServer as createHttpServer } from 'node:http';
import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { validateSnapshot } from '../src/core/privacy.mjs';
import { createPlan, explainError } from '../src/core/planner.mjs';

const DEFAULT_ORIGINS = ['http://127.0.0.1:4173', 'http://localhost:4173'];
const GOALS = new Set(['form', 'signin', 'search']);
const VERBOSITIES = new Set(['detailed', 'brief']);
const ERROR_CODES = new Set(['required', 'format', 'length', 'range', 'connection', 'unknown']);
const RESPONSES = {
  invalid_origin: [403, 'Esta origem não está autorizada. Use a orientação local.'],
  unauthorized: [401, 'A autenticação do serviço não foi aceita. Use a orientação local.'],
  not_found: [404, 'Este caminho não está disponível.'],
  method_not_allowed: [405, 'Este método não está disponível.'],
  invalid_preflight: [403, 'Esta solicitação não está autorizada.'],
  unsupported_media_type: [415, 'Envie apenas JSON sem compressão.'],
  payload_too_large: [413, 'A estrutura excede o limite permitido. Use a orientação local.'],
  invalid_json: [400, 'O JSON não pôde ser lido. Use a orientação local.'],
  invalid_request: [400, 'A estrutura não atende ao contrato de privacidade. Use a orientação local.'],
  consent_required: [403, 'Autorize esta sessão antes de usar o serviço opcional.'],
  request_timeout: [408, 'O envio demorou demais. A orientação local continua disponível.'],
  rate_limited: [429, 'Aguarde um pouco. A orientação local continua disponível.'],
  capacity_reached: [503, 'O serviço está ocupado. A orientação local continua disponível.'],
  internal_error: [500, 'O serviço não conseguiu orientar este passo. Use a orientação local.'],
};

class RequestError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function integer(value, fallback, min, max, name) {
  const number = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new TypeError(`${name} deve ser um número inteiro entre ${min} e ${max}.`);
  }
  return number;
}

function loopback(host) {
  return host === 'localhost' || host === '::1' || (isIP(host) === 4 && host.startsWith('127.'));
}

function validOrigin(origin) {
  if (typeof origin !== 'string' || origin.length > 256) return false;
  if (/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return true;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === origin;
  } catch { return false; }
}

function normalizeConfig(options = {}) {
  const host = options.host ?? '127.0.0.1';
  if (typeof host !== 'string' || (!isIP(host) && host !== 'localhost')) {
    throw new TypeError('FAROL_HOST deve ser um endereço IP ou localhost.');
  }
  const apiToken = options.apiToken ?? '';
  if (typeof apiToken !== 'string' || (apiToken && !/^[A-Za-z0-9._~-]{32,256}$/.test(apiToken))) {
    throw new TypeError('FAROL_API_TOKEN deve conter entre 32 e 256 caracteres seguros.');
  }
  if (!loopback(host) && !apiToken) {
    throw new TypeError('FAROL_API_TOKEN é obrigatório para servir fora de loopback.');
  }
  const origins = options.allowedOrigins ?? DEFAULT_ORIGINS;
  if (!Array.isArray(origins) || !origins.length || origins.length > 32 || !origins.every(validOrigin)) {
    throw new TypeError('FAROL_ALLOWED_ORIGINS deve conter origens exatas, sem curinga, caminho ou barra final.');
  }
  return Object.freeze({
    host,
    port: integer(options.port, 8787, 0, 65535, 'FAROL_PORT'),
    apiToken,
    allowedOrigins: Object.freeze([...new Set(origins)]),
    maxBodyBytes: integer(options.maxBodyBytes, 24576, 128, 65536, 'maxBodyBytes'),
    bodyTimeoutMs: integer(options.bodyTimeoutMs, 5000, 25, 30000, 'bodyTimeoutMs'),
    rateLimit: integer(options.rateLimit, 60, 1, 1000, 'rateLimit'),
    rateWindowMs: integer(options.rateWindowMs, 60000, 50, 3600000, 'rateWindowMs'),
    maxRateEntries: integer(options.maxRateEntries, 1000, 1, 10000, 'maxRateEntries'),
  });
}

/** Read only these explicit environment names; never print the environment. */
export function loadConfig(env = process.env) {
  return normalizeConfig({
    host: env.FAROL_HOST,
    port: env.FAROL_PORT,
    apiToken: env.FAROL_API_TOKEN,
    allowedOrigins: env.FAROL_ALLOWED_ORIGINS === undefined
      ? undefined : env.FAROL_ALLOWED_ORIGINS.split(',').map((item) => item.trim()),
  });
}

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function authorizedToken(header, token) {
  if (!token || typeof header !== 'string') return false;
  const actual = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sendJson(res, status, body, extra = {}) {
  if (res.destroyed || res.writableEnded) return;
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...extra,
  });
  res.end(json);
}

function fail(res, code, extra = {}) {
  const [status, message] = RESPONSES[code] ?? RESPONSES.internal_error;
  sendJson(res, status, { error: { code: code in RESPONSES ? code : 'internal_error', message } }, extra);
}

function readJson(req, config) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let settled = false;
    const timer = setTimeout(() => finish(new RequestError('request_timeout')), config.bodyTimeoutMs);
    timer.unref();
    const finish = (error, body) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAbort);
      chunks.length = 0;
      if (error) { req.pause(); reject(error); } else resolve(body);
    };
    const onData = (chunk) => {
      size += chunk.length;
      if (size > config.maxBodyBytes) return finish(new RequestError('payload_too_large'));
      chunks.push(chunk);
    };
    const onEnd = () => {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new RequestError('invalid_json')); }
    };
    const onError = () => finish(new RequestError('invalid_request'));
    const onAbort = () => finish(new RequestError('invalid_request'));
    req.on('data', onData);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('aborted', onAbort);
  });
}

/** Optional deterministic API. No payload, token, URL or page data is logged or persisted. */
export function createServer(options = {}) {
  const config = normalizeConfig(options);
  const allowedOrigins = new Set(config.allowedOrigins);
  const rateEntries = new Map();

  const pruneRateEntries = (now = Date.now()) => {
    for (const [key, entry] of rateEntries) if (entry.resetAt <= now) rateEntries.delete(key);
  };
  const cleanupTimer = setInterval(pruneRateEntries, Math.min(config.rateWindowMs, 1000));
  cleanupTimer.unref();

  function rateResult(remoteAddress) {
    const now = Date.now();
    pruneRateEntries(now);
    // Never trust X-Forwarded-For. Counts contain only an ephemeral transport IP and expiry.
    let entry = rateEntries.get(remoteAddress);
    if (!entry || entry.resetAt <= now) {
      if (rateEntries.size >= config.maxRateEntries && !entry) return 'capacity_reached';
      entry = { count: 0, resetAt: now + config.rateWindowMs };
      rateEntries.set(remoteAddress, entry);
    }
    entry.count = Math.min(entry.count + 1, config.rateLimit + 1);
    return entry.count > config.rateLimit ? 'rate_limited' : null;
  }

  const server = createHttpServer({ maxHeaderSize: 8192 }, (req, res) => {
    // A disconnect can emit another error after a bounded body reader has settled.
    req.on('error', () => {});
    res.on('error', () => {});
    void handle(req, res).catch(() => fail(res, 'internal_error', { Connection: 'close' }));
  });
  server.headersTimeout = 10000;
  server.requestTimeout = Math.max(10000, config.bodyTimeoutMs + 1000);
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on('close', () => { clearInterval(cleanupTimer); rateEntries.clear(); });
  server.on('clientError', (_error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });

  async function handle(req, res) {
    res.setHeader('Vary', 'Origin');
    const rateError = rateResult(req.socket.remoteAddress ?? 'unknown');
    if (rateError) return fail(res, rateError, { 'Retry-After': String(Math.ceil(config.rateWindowMs / 1000)), Connection: 'close' });

    const origin = req.headers.origin;
    if (origin !== undefined && (typeof origin !== 'string' || !allowedOrigins.has(origin))) {
      return fail(res, 'invalid_origin', { Connection: 'close' });
    }
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);

    const path = req.url;
    if (!['/health', '/plan', '/explain-error'].includes(path)) return fail(res, 'not_found', { Connection: 'close' });
    const method = path === '/health' ? 'GET' : 'POST';
    if (req.method === 'OPTIONS') {
      const requestedHeaders = String(req.headers['access-control-request-headers'] ?? '')
        .split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
      if (!origin || req.headers['access-control-request-method'] !== method
        || requestedHeaders.some((header) => !['content-type', 'authorization'].includes(header))) {
        return fail(res, 'invalid_preflight');
      }
      res.writeHead(204, {
        'Access-Control-Allow-Methods': method,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '600',
        'Cache-Control': 'no-store',
      });
      return res.end();
    }
    if (req.method !== method) return fail(res, 'method_not_allowed', { Allow: `${method}, OPTIONS`, Connection: 'close' });
    if (path === '/health') return sendJson(res, 200, { status: 'ok', mode: 'rules', schemaVersion: 1 });

    const hasToken = authorizedToken(req.headers.authorization, config.apiToken);
    if ((config.apiToken && !hasToken) || (!origin && !hasToken)) return fail(res, 'unauthorized', { Connection: 'close' });
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?$/i.test(req.headers['content-type'] ?? '')
      || (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity')) {
      return fail(res, 'unsupported_media_type', { Connection: 'close' });
    }
    if (Number(req.headers['content-length']) > config.maxBodyBytes) return fail(res, 'payload_too_large', { Connection: 'close' });

    let body;
    try { body = await readJson(req, config); }
    catch (error) { return fail(res, error instanceof RequestError ? error.code : 'internal_error', { Connection: 'close' }); }

    const keys = path === '/plan'
      ? ['schemaVersion', 'consent', 'snapshot', 'goal', 'verbosity']
      : ['schemaVersion', 'consent', 'code'];
    if (!exactKeys(body, keys) || body.schemaVersion !== 1) return fail(res, 'invalid_request');
    if (body.consent !== true) return fail(res, 'consent_required');
    if (path === '/plan') {
      if (!GOALS.has(body.goal) || !VERBOSITIES.has(body.verbosity) || !validateSnapshot(body.snapshot)) {
        return fail(res, 'invalid_request');
      }
      return sendJson(res, 200, createPlan(body.snapshot, { goal: body.goal, verbosity: body.verbosity }));
    }
    if (!ERROR_CODES.has(body.code)) return fail(res, 'invalid_request');
    return sendJson(res, 200, explainError(body.code));
  }

  return server;
}

export async function startServer(options = loadConfig()) {
  const config = normalizeConfig(options);
  const server = createServer(config);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => { server.removeListener('error', reject); resolve(); });
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = loadConfig();
    const server = await startServer(config);
    console.info(`Farol: serviço de regras em execução na porta ${server.address().port}. Sem retenção de conteúdo.`);
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      server.close();
      server.closeIdleConnections();
      const deadline = setTimeout(() => server.closeAllConnections(), 5000);
      deadline.unref();
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch {
    console.error('Farol: não foi possível iniciar o serviço. Confira a configuração e a disponibilidade da porta.');
    process.exitCode = 1;
  }
}
