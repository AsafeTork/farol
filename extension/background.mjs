import { validateSnapshot } from './src/core/privacy.mjs';
import { createPlan, validatePlan, explainError } from './src/core/planner.mjs';

const CONFIG_KEY = 'farol:backend:v1';
const ENDPOINT = 'http://127.0.0.1:8787';
const PERMISSION = { origins: ['http://127.0.0.1/*'] };
const TYPES = new Map([['farol:plan', '/plan'], ['farol:explain', '/explain-error']]);
const codes = new Set(['required', 'format', 'length', 'range', 'connection', 'unknown']);
const STORAGE_KEYS = new Set(['farol:preferences:v1', 'farol:cache:v1']);
const pending = new Map();

// Keep the backend token out of content scripts, even if page code is hostile.
// The service worker offers a narrow proxy for non-secret UI preferences only.
const accessReady = chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });

function exactKeys(object, keys) {
  return object && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).length === keys.length && keys.every(key => Object.hasOwn(object, key));
}
function validPayload(type, body) {
  if (type === 'farol:plan') return exactKeys(body, ['schemaVersion', 'consent', 'snapshot', 'goal', 'verbosity'])
    && body.schemaVersion === 1 && body.consent === true && validateSnapshot(body.snapshot)
    && ['form', 'signin', 'search'].includes(body.goal) && ['detailed', 'brief'].includes(body.verbosity);
  return type === 'farol:explain' && exactKeys(body, ['schemaVersion', 'consent', 'code'])
    && body.schemaVersion === 1 && body.consent === true && codes.has(body.code);
}

chrome.action.onClicked.addListener(async tab => {
  if (!tab.id) return;
  try {
    await accessReady;
    if (!/^https?:\/\//i.test(tab.url || '')) throw new Error('protected');
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['launch.js'] });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'Abrir Farol nesta página' });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#8A2600' });
    await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
    await chrome.action.setTitle({ tabId: tab.id, title: 'O Farol não pode abrir nesta tela protegida. Tente em uma página comum com formulário.' });
  }
});

async function handleMessage(message, sender) {
  if (sender.id !== chrome.runtime.id || !sender.tab?.id) return { ok: false, error: 'not-authorized' };
  if (!message || typeof message !== 'object') return { ok: false, error: 'invalid-request' };
  await accessReady;
  if (['farol:storage:get', 'farol:storage:set', 'farol:storage:remove'].includes(message.type)) {
    const keys = message.type === 'farol:storage:set' ? ['type', 'key', 'value'] : ['type', 'key'];
    if (!exactKeys(message, keys) || !STORAGE_KEYS.has(message.key)) return { ok: false, error: 'invalid-request' };
    if (message.type === 'farol:storage:get') return { ok: true, value: (await chrome.storage.local.get(message.key))[message.key] };
    if (message.type === 'farol:storage:remove') { await chrome.storage.local.remove(message.key); return { ok: true }; }
    const serialized = JSON.stringify(message.value);
    if (typeof serialized !== 'string' || serialized.length > 120000) return { ok: false, error: 'invalid-request' };
    await chrome.storage.local.set({ [message.key]: message.value });
    return { ok: true };
  }
  const key = `${sender.tab.id}:${sender.frameId ?? 0}:${message.requestId}`;
  if (message.type === 'farol:cancel') {
    if (!exactKeys(message, ['type', 'requestId']) || typeof message.requestId !== 'string') return { ok: false, error: 'invalid-request' };
    pending.get(key)?.abort();
    return { ok: true };
  }
  if (message.type === 'farol:capabilities') {
    const config = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
    return { ok: true, backendEnabled: config?.enabled === true && await chrome.permissions.contains(PERMISSION) };
  }
  if (!TYPES.has(message.type) || !exactKeys(message, ['type', 'payload', 'requestId'])
    || typeof message.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(message.requestId)
    || !validPayload(message.type, message.payload)) return { ok: false, error: 'not-authorized' };
  const controller = new AbortController();
  pending.set(key, controller);
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const config = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
    const enabled = config?.enabled === true && await chrome.permissions.contains(PERMISSION);
    if (!enabled || controller.signal.aborted) throw new Error('not-authorized');
    const headers = { 'Content-Type': 'application/json' };
    if (typeof config.token === 'string' && config.token.length > 0 && config.token.length <= 512 && !/[\r\n]/.test(config.token)) headers.Authorization = `Bearer ${config.token}`;
    const response = await fetch(`${ENDPOINT}${TYPES.get(message.type)}`, {
      method: 'POST', headers, body: JSON.stringify(message.payload), signal: controller.signal,
      credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer'
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('unavailable');
    if (Number(response.headers.get('content-length') || 0) > 65536) throw new Error('oversize');
    const text = await response.text();
    if (text.length > 65536) throw new Error('oversize');
    const result = JSON.parse(text);
    if (message.type === 'farol:plan') {
      const expected = createPlan(message.payload.snapshot, message.payload);
      if (!validatePlan(result, message.payload.snapshot) || JSON.stringify(result.steps) !== JSON.stringify(expected.steps)) throw new Error('invalid-plan');
      return { ok: true, result: expected };
    }
    const expected = explainError(message.payload.code);
    if (result?.code !== expected.code || result?.title !== expected.title || result?.instruction !== expected.instruction) throw new Error('invalid-explanation');
    return { ok: true, result: expected };
  } catch { return { ok: false, error: 'local-service-unavailable' }; }
  finally { clearTimeout(timer); pending.delete(key); }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handleMessage(message, sender).then(reply).catch(() => reply({ ok: false, error: 'unavailable' }));
  return true;
});
