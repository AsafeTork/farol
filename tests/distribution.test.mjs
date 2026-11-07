import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, publicFiles, root } from '../scripts/build.mjs';
import { serve } from '../scripts/serve.mjs';

test('build publica somente lista explícita e empacota módulo compartilhado na extensão', async () => {
  const { site, extension } = await build();
  async function walk(path, prefix = '') {
    let files = [];
    for (const item of await readdir(path, { withFileTypes:true })) {
      files.push(...(item.isDirectory() ? await walk(resolve(path,item.name),prefix+item.name+'/') : [prefix+item.name]));
    }
    return files;
  }
  assert.deepEqual((await walk(site)).sort(), [...publicFiles].sort());
  assert.ok(!(await walk(site)).some(p => /^(docs|server|tests|evidencia|\.github)\//.test(p)));
  const manifest = JSON.parse(await readFile(resolve(extension,'manifest.json'),'utf8'));
  assert.equal(manifest.manifest_version,3);
  assert.ok(!manifest.host_permissions?.length);
  assert.equal(await readFile(resolve(extension,'src/core/privacy.mjs'),'utf8'),await readFile(resolve(root,'src/core/privacy.mjs'),'utf8'));
});

test('servidor de prática não expõe documentos internos, código backend ou caminhos arbitrários', async () => {
  const server = await serve({ port:0 });
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/pratica.html`)).status,200);
    for (const path of ['docs/decisoes-farol.md','server/index.mjs','.env','package.json','../README.md','%2e%2e/README.md']) {
      assert.equal((await fetch(`${base}/${path}`)).status,404,path);
    }
    assert.equal((await fetch(`${base}/pratica.html`,{method:'POST'})).status,405);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
