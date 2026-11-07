import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPlan } from '../src/core/planner.mjs';

// Exercise the real service worker with the Chrome boundary simulated. This
// complements, but does not replace, loading the extension in a real browser.
test('extension protects its token, forwards only consented sanitized data and cancels requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'farol-extension-'));
  const previousChrome = globalThis.chrome;
  const previousFetch = globalThis.fetch;
  const calls = [];
  let handler;
  let accessLevel;
  let pendingSignal;
  let announceFetch;
  const requested = new Promise(resolve => { announceFetch = resolve; });
  const data = { 'farol:backend:v1': { enabled:true, token:'secret-not-for-page' } };
  const sender = { id:'extension-id', tab:{ id:17 }, frameId:0 };
  const snapshot = { schemaVersion:1, context:'generic', controls:[{ id:'c1', kind:'email', label:'email', required:true, disabled:false }] };
  const body = { schemaVersion:1, consent:true, snapshot, goal:'form', verbosity:'detailed' };
  const plan = createPlan(snapshot, { goal:'form', verbosity:'detailed' });
  try {
    await mkdir(join(directory, 'src'), { recursive:true });
    await cp(resolve('src/core'), join(directory, 'src/core'), { recursive:true });
    await cp(resolve('extension/background.mjs'), join(directory, 'background.mjs'));
    globalThis.chrome = {
      runtime: { id:'extension-id', onMessage:{ addListener(fn) { handler = fn; } } },
      action: { onClicked:{ addListener() {} } },
      storage: { local: {
        async setAccessLevel(value) { accessLevel = value; },
        async get(key) { return { [key]:data[key] }; },
        async set(values) { Object.assign(data, values); },
        async remove(key) { delete data[key]; },
      } },
      permissions: { async contains() { return true; } },
    };
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) return new Response(JSON.stringify(plan), { headers:{ 'content-type':'application/json' } });
      pendingSignal = init.signal;
      announceFetch();
      return new Promise((_, reject) => {
        if (init.signal.aborted) return reject(new Error('aborted'));
        init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once:true });
      });
    };
    await import(pathToFileURL(join(directory, 'background.mjs')).href);
    const message = (payload, from = sender) => new Promise(resolveReply => handler(payload, from, resolveReply));
    assert.deepEqual(accessLevel, { accessLevel:'TRUSTED_CONTEXTS' });
    assert.equal(calls.length, 0, 'starting the worker performs no network request');
    assert.deepEqual(await message({ type:'farol:capabilities' }), { ok:true, backendEnabled:true });
    assert.equal((await message({ type:'farol:storage:get', key:'farol:backend:v1' })).ok, false);
    assert.equal((await message({ type:'farol:storage:set', key:'farol:backend:v1', value:{} })).ok, false);
    assert.equal((await message({ type:'farol:storage:set', key:'farol:preferences:v1', value:{ fontSize:20 } })).ok, true);
    assert.deepEqual((await message({ type:'farol:storage:get', key:'farol:preferences:v1' })).value, { fontSize:20 });
    assert.equal((await message({ type:'farol:storage:get', key:'farol:preferences:v1' }, { id:'other', tab:{ id:17 } })).ok, false);
    const requestId = 'e398b460-13df-474f-a532-68f6b5119ff0';
    assert.equal((await message({ type:'farol:plan', requestId, payload:{ ...body, consent:false } })).ok, false);
    assert.equal((await message({ type:'farol:plan', requestId, payload:{ ...body, password:'secret' } })).ok, false);
    assert.equal(calls.length, 0, 'invalid payloads never reach the network');
    assert.equal((await message({ type:'farol:plan', requestId, payload:body })).ok, true);
    assert.equal(calls[0].url, 'http://127.0.0.1:8787/plan');
    assert.deepEqual(JSON.parse(calls[0].init.body), body);
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-not-for-page');
    const cancelId = '46023387-9f62-4d70-9006-9db397a3de6e';
    const pending = message({ type:'farol:plan', requestId:cancelId, payload:body });
    await requested;
    await message({ type:'farol:cancel', requestId:cancelId });
    assert.equal(pendingSignal.aborted, true);
    assert.equal((await pending).ok, false);
  } finally {
    globalThis.chrome = previousChrome;
    globalThis.fetch = previousFetch;
    await rm(directory, { recursive:true, force:true });
  }
});
