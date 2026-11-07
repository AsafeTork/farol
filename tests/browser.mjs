import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { serve } from '../scripts/serve.mjs';

// This test needs a real Chromium. Do not silently claim a visual pass when
// Playwright or its browser executable is missing.
const require = createRequire(import.meta.url);
let chromium;
try {
  try { ({ chromium } = require('playwright')); }
  catch {
    const modules = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
    if (!modules) throw new Error('Playwright não instalado.');
    ({ chromium } = require(resolve(modules, 'playwright')));
  }
} catch {
  console.error('Instale as dependências com npm install e o navegador com npx playwright install chromium.');
  process.exit(1);
}

const server = await serve({ port: 0 });
let browser;
const evidence = resolve('evidencia');
await mkdir(evidence, { recursive: true });
const results = [];
try {
  browser = await chromium.launch({ headless: true });
  const url = `http://127.0.0.1:${server.address().port}/pratica.html`;
  for (const viewport of [{ name:'desktop', width:1365, height:900 }, { name:'375px', width:375, height:812 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const failures = [];
    const external = [];
    page.on('pageerror', error => failures.push(error.message));
    page.on('request', request => { if (!request.url().startsWith(`http://127.0.0.1:${server.address().port}/`)) external.push(request.url()); });
    // Open the demo's shadow root only inside this test so Playwright can
    // inspect controls; the shipped assistant continues to default to closed.
    await page.addInitScript(() => {
      const original = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) {
        return original.call(this, this.hasAttribute('data-farol-root') ? { ...options, mode: 'open' } : options);
      };
    });
    await page.goto(url, { waitUntil:'load' });
    await page.screenshot({ path:resolve(evidence, `pratica-${viewport.name}.png`), fullPage:true });
    const layout = await page.evaluate(() => ({ documentWidth:document.documentElement.scrollWidth, viewportWidth:innerWidth }));
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${viewport.name}: há rolagem horizontal`);
    await page.locator('#start-guide').click();
    const panel = page.locator('[data-farol-root]').first();
    await panel.locator('[data-action="start"]').click();
    await panel.locator('[data-view="active"]').waitFor();
    await page.screenshot({ path:resolve(evidence, `orientacao-${viewport.name}.png`), fullPage:true });
    assert.match(await panel.locator('[data-part="step-title"]').innerText(), /nome/i);
    const name = page.locator('#practice-name');
    assert.equal(await name.inputValue(), '', 'o guia não deve preencher campos');
    await name.fill('Pessoa de exemplo');
    await name.evaluate(element => element.setAttribute('aria-label', 'CPF'));
    await panel.locator('[data-part="change"]:visible').waitFor();
    assert.equal(await panel.locator('[data-action="next"]').isDisabled(), true, 'rótulo modificado deve invalidar o passo');
    await name.evaluate(element => element.removeAttribute('aria-label'));
    await panel.locator('[data-view="active"] [data-action="refresh"]').click();
    await panel.locator('[data-part="change"][hidden]').waitFor({ state:'attached' });
    await panel.locator('[data-action="next"]').click();
    assert.match(await panel.locator('[data-part="step-title"]').innerText(), /e-mail/i);
    await page.locator('#practice-email').fill('pessoa@exemplo.invalid');
    await panel.locator('[data-action="next"]').click();
    await page.locator('#practice-subject').selectOption('info');
    await panel.locator('[data-action="next"]').click();
    assert.ok(await page.locator('#practice-form').isVisible(), 'o guia não deve enviar o formulário');
    const stored = await page.evaluate(() => JSON.stringify(localStorage));
    assert.ok(!stored.includes('Pessoa de exemplo') && !stored.includes('pessoa@exemplo.invalid'), 'dados digitados não devem ser armazenados');
    await page.locator('#practice-form button[type="submit"]').click();
    await page.locator('#confirm-form').waitFor();
    await page.locator('#practice-confirm').check();
    await page.locator('#confirm-form button[type="submit"]').click();
    assert.match(await page.locator('#atividade-titulo').innerText(), /Prática concluída/);
    assert.deepEqual(failures, [], `${viewport.name}: erro de JavaScript`);
    assert.deepEqual(external, [], `${viewport.name}: a prática não deveria realizar chamadas externas`);
    results.push({ viewport:viewport.name, status:'ok' });
    await context.close();
    console.log(`${viewport.name}: fluxo, privacidade e imagens verificados`);
  }
  await writeFile(resolve(evidence, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
} catch (error) {
  console.error('Teste em navegador falhou:', error.message);
  console.error('Confirme que Chromium está instalado: npx playwright install chromium.');
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
