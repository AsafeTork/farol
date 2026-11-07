import test from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, loadConfig, startServer } from '../server/index.mjs';
import { validatePlan, explainError } from '../src/core/planner.mjs';

const ORIGIN = 'http://127.0.0.1:4173';
const TOKEN = 'local-test-token-with-at-least-32-characters';
const snapshot = () => ({
  schemaVersion: 1,
  context: 'practice',
  controls: [
    { id: 'c1', kind: 'email', label: 'email', required: true, disabled: false },
    { id: 'c2', kind: 'button', label: 'continue', required: false, disabled: false },
  ],
});
const planRequest = () => ({ schemaVersion: 1, consent: true, snapshot: snapshot(), goal: 'form', verbosity: 'detailed' });

async function service(t, options = {}) {
  const server = createServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(url + path, {
    method: 'POST',
    headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { server, url, post };
}

test('health identifies deterministic service without disclosing config or requiring auth', async (t) => {
  const { url } = await service(t, { apiToken: TOKEN });
  const response = await fetch(`${url}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', mode: 'rules', schemaVersion: 1 });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('valid sanitized plan request returns a locally verifiable plan', async (t) => {
  const { post } = await service(t);
  const body = planRequest();
  const response = await post('/plan', body);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), ORIGIN);
  const plan = await response.json();
  assert.equal(plan.source, 'local');
  assert.equal(validatePlan(plan, body.snapshot), true);
  assert.ok(plan.steps.some((step) => step.targetId === 'c1'));
});

test('known error code returns the same safe local explanation', async (t) => {
  const { post } = await service(t);
  const response = await post('/explain-error', { schemaVersion: 1, consent: true, code: 'required' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), explainError('required'));
});

test('request denies consent that is false or a truthy string', async (t) => {
  const { post } = await service(t);
  for (const consent of [false, 'true', 1, null]) {
    const response = await post('/plan', { ...planRequest(), consent });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'consent_required');
  }
  const body = planRequest();
  delete body.consent;
  assert.equal((await post('/plan', body)).status, 400);
});

test('schema rejects personal information in every structural layer without echoing it', async (t) => {
  const { post } = await service(t);
  const secret = 'sentinel-private-person-12345678900';
  const alterations = [
    (body) => { body.value = secret; },
    (body) => { body.snapshot.url = `https://example.test/${secret}`; },
    (body) => { body.snapshot.controls[0].value = secret; },
    (body) => { body.snapshot.controls[0].label = secret; },
    (body) => { body.snapshot.controls[0].id = secret; },
    (body) => { body.snapshot.context = secret; },
    (body) => { body.snapshot.controls[0].kind = secret; },
    (body) => { body.goal = secret; },
    (body) => { body.verbosity = secret; },
    (body) => { body.snapshot.controls[0].required = secret; },
  ];
  for (const alter of alterations) {
    const body = planRequest();
    alter(body);
    const response = await post('/plan', body);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes(secret));
  }
});

test('error explanation rejects free text, extra fields and unknown codes', async (t) => {
  const { post } = await service(t);
  for (const body of [
    { schemaVersion: 1, consent: true, code: 'required', message: 'user@example.test' },
    { schemaVersion: 1, consent: true, code: 'user@example.test' },
    { schemaVersion: 2, consent: true, code: 'required' },
    ['required'],
    null,
  ]) assert.equal((await post('/explain-error', body)).status, 400);
});

test('prototype pollution keys are rejected without modifying objects', async (t) => {
  const { url } = await service(t);
  const response = await fetch(`${url}/plan`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify(planRequest()).replace('"schemaVersion":1', '"__proto__":{"polluted":true},"schemaVersion":1'),
  });
  assert.equal(response.status, 400);
  assert.equal({}.polluted, undefined);
});

test('foreign, null and lookalike origins are denied without permissive CORS headers', async (t) => {
  const { post } = await service(t, { apiToken: TOKEN });
  for (const origin of ['https://evil.example', 'null', `${ORIGIN}.evil.example`, `${ORIGIN}/`]) {
    const response = await post('/plan', planRequest(), { Origin: origin, Authorization: `Bearer ${TOKEN}` });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
});

test('exact extension origin is supported when configured', async (t) => {
  const extensionOrigin = `chrome-extension://${'a'.repeat(32)}`;
  const { post } = await service(t, { allowedOrigins: [extensionOrigin] });
  const response = await post('/plan', planRequest(), { Origin: extensionOrigin });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), extensionOrigin);
});

test('preflight permits only declared methods and headers from configured origins', async (t) => {
  const { url } = await service(t);
  const valid = await fetch(`${url}/plan`, { method: 'OPTIONS', headers: {
    Origin: ORIGIN,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type, authorization',
  } });
  assert.equal(valid.status, 204);
  assert.equal(valid.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(valid.headers.get('access-control-allow-credentials'), null);
  assert.equal(valid.headers.get('access-control-allow-methods'), 'POST');
  for (const headers of [
    { 'Access-Control-Request-Method': 'POST' },
    { Origin: ORIGIN, 'Access-Control-Request-Method': 'DELETE' },
    { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-secret' },
  ]) assert.equal((await fetch(`${url}/plan`, { method: 'OPTIONS', headers })).status, 403);
});

test('configured token is required even for allowed Origin and is never reflected', async (t) => {
  const { post } = await service(t, { apiToken: TOKEN });
  for (const authorization of ['', 'Bearer wrong', `Basic ${TOKEN}`]) {
    const response = await post('/plan', planRequest(), { Authorization: authorization });
    assert.equal(response.status, 401);
    assert.ok(!(await response.text()).includes(TOKEN));
  }
  assert.equal((await post('/plan', planRequest(), { Authorization: `Bearer ${TOKEN}` })).status, 200);
});

test('clients without Origin need a configured correct token', async (t) => {
  const first = await service(t);
  const headers = { 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${first.url}/plan`, { method: 'POST', headers, body: JSON.stringify(planRequest()) })).status, 401);
  const second = await service(t, { apiToken: TOKEN });
  const response = await fetch(`${second.url}/plan`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(planRequest()),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('invalid JSON, unsupported content types and compression fail safely', async (t) => {
  const { url, post } = await service(t);
  const malformed = await fetch(`${url}/plan`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{not-json',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'invalid_json');
  for (const headers of [{ 'Content-Type': 'text/plain' }, { 'Content-Encoding': 'gzip' }]) {
    assert.equal((await post('/plan', planRequest(), headers)).status, 415);
  }
  assert.equal((await post('/plan', planRequest(), { 'Content-Type': 'application/json; charset=utf-8' })).status, 200);
});

test('body limit applies both to known Content-Length and chunked input', async (t) => {
  const { url } = await service(t, { maxBodyBytes: 128 });
  const known = await fetch(`${url}/plan`, {
    method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: 'x'.repeat(129),
  });
  assert.equal(known.status, 413);
  assert.equal((await known.json()).error.code, 'payload_too_large');
  const chunkedStatus = await new Promise((resolve, reject) => {
    const req = httpRequest(`${url}/plan`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' } }, (res) => {
      res.resume();
      res.on('end', () => { resolve(res.statusCode); req.destroy(); });
    });
    req.on('error', reject);
    req.write('x'.repeat(80));
    req.end('x'.repeat(80));
  });
  assert.equal(chunkedStatus, 413);
});

test('incomplete request body times out rather than retaining content indefinitely', async (t) => {
  const { url } = await service(t, { bodyTimeoutMs: 50 });
  const result = await new Promise((resolve, reject) => {
    const req = httpRequest(`${url}/plan`, { method: 'POST', headers: {
      Origin: ORIGIN, 'Content-Type': 'application/json', 'Content-Length': '100',
    } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (part) => { body += part; });
      res.on('end', () => { resolve({ status: res.statusCode, body: JSON.parse(body) }); req.destroy(); });
    });
    req.on('error', reject);
    req.write('{');
  });
  assert.equal(result.status, 408);
  assert.equal(result.body.error.code, 'request_timeout');
});

test('rate limit uses transport IP rather than spoofable forwarding headers', async (t) => {
  const { url } = await service(t, { rateLimit: 2 });
  for (const forwarded of ['198.51.100.1', '198.51.100.2']) {
    assert.equal((await fetch(`${url}/health`, { headers: { 'X-Forwarded-For': forwarded } })).status, 200);
  }
  const response = await fetch(`${url}/health`, { headers: { 'X-Forwarded-For': '198.51.100.3' } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '60');
});

test('only declared routes and methods are available; query strings are not accepted', async (t) => {
  const { url } = await service(t);
  for (const path of ['/docs', '/plan?value=private', '/plan/', '/explain-error/']) {
    const response = await fetch(url + path);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes('private'));
  }
  const getPlan = await fetch(`${url}/plan`);
  assert.equal(getPlan.status, 405);
  assert.equal(getPlan.headers.get('allow'), 'POST, OPTIONS');
  assert.equal((await fetch(`${url}/health`, { method: 'POST' })).status, 405);
});

test('configuration rejects unsafe origins, invalid limits, weak tokens and unprotected remote binds', () => {
  assert.deepEqual(loadConfig({}).allowedOrigins, [ORIGIN, 'http://localhost:4173']);
  assert.equal(loadConfig({}).port, 8787);
  for (const env of [
    { FAROL_HOST: '0.0.0.0' },
    { FAROL_HOST: '::' },
    { FAROL_HOST: 'example.com' },
    { FAROL_PORT: '70000' },
    { FAROL_ALLOWED_ORIGINS: '*' },
    { FAROL_ALLOWED_ORIGINS: 'null' },
    { FAROL_ALLOWED_ORIGINS: `${ORIGIN}/` },
    { FAROL_ALLOWED_ORIGINS: '' },
    { FAROL_API_TOKEN: 'weak' },
  ]) assert.throws(() => loadConfig(env));
  assert.equal(loadConfig({ FAROL_HOST: '0.0.0.0', FAROL_API_TOKEN: TOKEN }).host, '0.0.0.0');
  assert.throws(() => createServer({ maxBodyBytes: 100000000 }));
  assert.throws(() => createServer({ maxRateEntries: Infinity }));
});

test('startServer supports ephemeral loopback port and reusable close', async (t) => {
  const server = await startServer({ port: 0 });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal(server.address().address, '127.0.0.1');
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/health`)).status, 200);
});

test('extension bridge and backend exchange only consented, validated payloads', async (t) => {
  const extensionId = 'a'.repeat(32);
  const origin = `chrome-extension://${extensionId}`;
  const { url } = await service(t, { allowedOrigins: [origin], apiToken: TOKEN });
  const temp = await mkdtemp(join(tmpdir(), 'farol-worker-test-'));
  await mkdir(join(temp, 'src'), { recursive: true });
  await cp(resolve('extension/background.mjs'), join(temp, 'background.mjs'));
  await cp(resolve('src/core'), join(temp, 'src/core'), { recursive: true });
  const realFetch = globalThis.fetch;
  const originalChrome = globalThis.chrome;
  let listener;
  let requests = 0;
  let lastPayload;
  let lastHeaders;
  let accessLevel;
  let blockFetch = false;
  let activeSignal;
  let signalFetchStarted;
  const records = new Map([['farol:backend:v1', { enabled: true, token: TOKEN }]]);
  globalThis.chrome = {
    action: { onClicked: { addListener() {} } },
    runtime: { id: extensionId, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      async setAccessLevel({ accessLevel: level }) { accessLevel = level; },
      async get(key) { return { [key]: records.get(key) }; },
      async set(values) { for (const [key, value] of Object.entries(values)) records.set(key, value); },
      async remove(key) { records.delete(key); },
    } },
    permissions: { async contains() { return true; } },
  };
  globalThis.fetch = async (target, options) => {
    requests++;
    assert.match(String(target), /^http:\/\/127\.0\.0\.1:8787\/(plan|explain-error)$/);
    lastPayload = JSON.parse(options.body);
    lastHeaders = options.headers;
    if (blockFetch) {
      activeSignal = options.signal;
      signalFetchStarted();
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    return realFetch(`${url}${new URL(target).pathname}`, {
      ...options, headers: { ...options.headers, Origin: origin },
    });
  };
  try {
    await import(pathToFileURL(join(temp, 'background.mjs')).href);
    assert.equal(accessLevel, 'TRUSTED_CONTEXTS');
    const sender = { id: extensionId, tab: { id: 1 } };
    const message = (payload, from = sender) => new Promise((resolveMessage) => {
      assert.equal(listener(payload, from, resolveMessage), true);
    });

    const data = planRequest();
    const result = await message({ type: 'farol:plan', payload: data, requestId: randomUUID() });
    assert.equal(result.ok, true);
    assert.equal(validatePlan(result.result, data.snapshot), true);
    assert.deepEqual(lastPayload, data);
    assert.equal(lastHeaders.Authorization, `Bearer ${TOKEN}`);
    assert.ok(!JSON.stringify(result).includes(TOKEN));

    const explanation = await message({ type: 'farol:explain', requestId: randomUUID(), payload: {
      schemaVersion: 1, consent: true, code: 'required',
    } });
    assert.deepEqual(explanation, { ok: true, result: explainError('required') });
    assert.equal(requests, 2);

    const invalid = [
      { type: 'farol:plan', requestId: randomUUID(), payload: { ...data, consent: false } },
      { type: 'farol:plan', requestId: randomUUID(), payload: { ...data, snapshot: { ...data.snapshot, url: 'https://private.invalid/' } } },
      { type: 'farol:explain', requestId: randomUUID(), payload: { schemaVersion: 1, consent: true, code: 'private text' } },
      { type: 'farol:plan', payload: data },
      { type: 'farol:plan', requestId: 'bad-id', payload: data },
    ];
    for (const request of invalid) assert.equal((await message(request)).ok, false);
    assert.equal((await message({ type: 'farol:plan', payload: data, requestId: randomUUID() }, { id: 'external', tab: { id: 1 } })).ok, false);
    assert.equal(requests, 2, 'invalid or unauthorized requests must not reach the backend');

    const prefKey = 'farol:preferences:v1';
    assert.deepEqual(await message({ type: 'farol:storage:set', key: prefKey, value: { verbosity: 'brief' } }), { ok: true });
    assert.deepEqual(await message({ type: 'farol:storage:get', key: prefKey }), { ok: true, value: { verbosity: 'brief' } });
    assert.equal((await message({ type: 'farol:storage:get', key: 'farol:backend:v1' })).ok, false);
    assert.equal((await message({ type: 'farol:storage:set', key: prefKey, value: 'x'.repeat(120001) })).ok, false);
    assert.deepEqual(await message({ type: 'farol:storage:remove', key: prefKey }), { ok: true });
    assert.equal(records.has(prefKey), false);

    blockFetch = true;
    const started = new Promise(resolveStarted => { signalFetchStarted = resolveStarted; });
    const requestId = randomUUID();
    const waiting = message({ type: 'farol:plan', payload: data, requestId });
    await started;
    assert.equal(activeSignal.aborted, false);
    assert.deepEqual(await message({ type: 'farol:cancel', requestId }, { id: extensionId, tab: { id: 2 } }), { ok: true });
    assert.equal(activeSignal.aborted, false, 'another tab cannot cancel this request');
    assert.deepEqual(await message({ type: 'farol:cancel', requestId }), { ok: true });
    assert.equal(activeSignal.aborted, true);
    assert.equal((await waiting).ok, false);
  } finally {
    globalThis.fetch = realFetch;
    if (originalChrome === undefined) delete globalThis.chrome; else globalThis.chrome = originalChrome;
    await rm(temp, { recursive: true, force: true });
  }
});
