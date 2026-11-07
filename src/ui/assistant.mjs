import { capturePage, validateSnapshot } from '../core/privacy.mjs';
import { createPlan, validatePlan, explainError, structuralKey } from '../core/planner.mjs';
import { styles } from './styles.mjs';

const mounted = new WeakMap();
const PREFS_KEY = 'farol:preferences:v1';
const CACHE_KEY = 'farol:cache:v1';
const defaults = Object.freeze({ fontSize: 18, rate: 0.9, voice: false, voiceURI: '', verbosity: 'detailed', goal: 'form' });
const goals = new Set(['form', 'signin', 'search']);
const errorCodes = new Set(['required', 'format', 'length', 'range', 'connection', 'unknown']);

function validPreferences(value) {
  if (!value || typeof value !== 'object') return { ...defaults };
  return {
    fontSize: [18, 20, 22].includes(value.fontSize) ? value.fontSize : 18,
    rate: [0.7, 0.9, 1, 1.1].includes(value.rate) ? value.rate : 0.9,
    voice: value.voice === true,
    voiceURI: typeof value.voiceURI === 'string' && value.voiceURI.length < 300 ? value.voiceURI : '',
    verbosity: value.verbosity === 'brief' ? 'brief' : 'detailed',
    goal: goals.has(value.goal) ? value.goal : 'form'
  };
}

/** Read-only guidance. Page values and arbitrary page text never enter this UI. */
export function mountAssistant({ document: doc = globalThis.document, storage, requestPlan, requestExplanation, shadowMode = 'closed' } = {}) {
  if (!doc?.body) throw new Error('A página precisa estar aberta antes de iniciar o Farol.');
  const existing = mounted.get(doc);
  if (existing) { existing.expand(); return existing; }
  const win = doc.defaultView || globalThis;
  const host = doc.createElement('div');
  host.setAttribute('data-farol-root', '');
  host.setAttribute('aria-label', 'Farol — orientação de navegação');
  // On third-party pages, prevent page scripts from silently changing the
  // controls, consent checkbox or displayed instructions inside the panel.
  const root = host.attachShadow({ mode: shadowMode === 'open' ? 'open' : 'closed' });
  const sheet = doc.createElement('style');
  sheet.textContent = styles;
  root.append(sheet);
  const shell = doc.createElement('div');
  // Constant application markup only. No page, API or stored text enters innerHTML.
  shell.innerHTML = `
    <div class="ring" hidden aria-hidden="true"></div><div class="target-label" hidden aria-hidden="true">Aqui · passo atual</div>
    <section class="panel" aria-label="Orientação do Farol" lang="pt-BR">
      <header class="bar"><div class="brand"><svg viewBox="0 0 40 48" aria-hidden="true"><path d="M14 12 2 7v10l12-5m12 0 12-5v10l-12-5" fill="#FFCD07"/><circle cx="20" cy="12" r="6" fill="#FFCD07"/><path d="m16 21-4 20h16l-4-20z" fill="white"/><rect x="8" y="41" width="24" height="4" rx="2" fill="white"/></svg>Farol</div><button type="button" data-action="collapse" aria-label="Recolher o painel do Farol">Recolher</button><button type="button" data-action="close">Encerrar</button></header>
      <div class="body">
        <div class="group" data-view="intro"><p class="eyebrow">Um passo de cada vez</p><h2>Vamos navegar juntos?</h2><p>Eu explico e mostro onde está cada campo. Você preenche, clica e decide no seu tempo.</p><div class="group"><label for="farol-goal">O que você quer fazer?</label><select id="farol-goal"><option value="form">Preencher esta página</option><option value="signin">Entrar em uma conta</option><option value="search">Fazer uma busca</option></select></div><button type="button" class="primary wide" data-action="start">Começar orientação</button><p class="muted">A orientação funciona neste aparelho. Não preciso ler os dados que você digita.</p></div>
        <div class="group" data-view="active" hidden><p class="eyebrow" data-part="step-count"></p><div class="progress" role="progressbar" aria-label="Etapas da orientação" aria-valuemin="0"><span></span></div><h2 data-part="step-title" tabindex="-1"></h2><p class="instruction" data-part="instruction"></p><div class="row"><button type="button" data-action="show">Mostrar na tela</button><button type="button" data-action="speak">Ouvir passo</button></div><div class="controls"><button type="button" data-action="previous">Voltar</button><button type="button" class="primary" data-action="next">Já fiz. Próximo</button></div><div class="row"><button type="button" data-action="pause">Pausar</button><button type="button" data-action="refresh">Atualizar página</button></div><p class="footer">Avance depois de fazer a ação na página. O Farol nunca clica ou preenche por você.</p></div>
        <div class="group" data-view="paused" hidden><p class="eyebrow">No seu tempo</p><h2>Orientação pausada</h2><p>O destaque e a voz estão desligados. Continue quando quiser.</p><button type="button" class="primary wide" data-action="resume">Retomar orientação</button></div>
        <div class="group" data-view="complete" hidden><p class="eyebrow">Orientação concluída</p><h2>Você percorreu os passos.</h2><p>Confira o resultado na própria página. Terminar o roteiro não confirma um envio, login ou atendimento.</p><button type="button" class="primary wide" data-action="restart">Orientar outra página</button></div>
        <div class="group" data-view="empty" hidden><h2>Não encontrei campos nesta tela.</h2><p>Abra a página com o formulário ou a busca e tente novamente. Algumas telas protegidas e conteúdos dentro de outros quadros não podem ser orientados.</p><button type="button" class="primary wide" data-action="refresh">Tentar novamente</button></div>
        <p class="notice" data-part="status" role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="notice error" data-part="change" hidden>A página mudou. Atualize o roteiro para orientar os campos atuais.</p>
        <details data-part="error-help"><summary>Entender um aviso</summary><div><label for="farol-error">Qual é o problema?</label><select id="farol-error"><option value="required">Campo obrigatório</option><option value="format">Formato não aceito</option><option value="length">Quantidade de caracteres</option><option value="range">Número fora do limite</option><option value="connection">Problema de conexão</option><option value="unknown">Outro aviso</option></select><button type="button" data-action="explain">Explicar com calma</button><p class="notice" data-part="explanation" role="status" aria-live="polite"></p></div></details>
        <details data-part="preferences"><summary>Ajustar para mim</summary><div><label for="farol-font">Tamanho do texto</label><select id="farol-font"><option value="18">Confortável</option><option value="20">Maior</option><option value="22">Muito maior</option></select><label class="check"><input id="farol-voice-on" type="checkbox">Ler cada passo em voz alta</label><label for="farol-rate">Velocidade da voz</label><select id="farol-rate"><option value="0.7">Bem devagar</option><option value="0.9">Devagar</option><option value="1">Normal</option><option value="1.1">Um pouco mais rápido</option></select><label for="farol-voice">Voz em português</label><select id="farol-voice"><option value="">Voz do aparelho</option></select><label for="farol-detail">Quantidade de explicação</label><select id="farol-detail"><option value="detailed">Explique com calma</option><option value="brief">Seja mais breve</option></select><button type="button" data-action="stop-speech">Parar a voz</button></div></details>
        <details data-part="backend" hidden><summary>Serviço local opcional</summary><div><p class="muted">Com sua autorização, o serviço recebe somente tipos de campos e rótulos padronizados. Não recebe o site, os dados digitados nem textos da página. A autorização termina ao encerrar o Farol.</p><label class="check"><input id="farol-consent" type="checkbox">Permitir estrutura saneada nesta sessão</label></div></details>
        <details><summary>Privacidade e dados locais</summary><div><p class="muted">Guardamos apenas suas preferências e até 8 roteiros estruturais neste navegador. Não guardamos os campos preenchidos, senhas ou endereços das páginas.</p><button type="button" data-action="erase">Apagar preferências e roteiros</button><p class="muted">O MVP usa voz nativa. A Sessão Viva com microfone é uma proposta futura.</p></div></details>
      </div>
    </section><button type="button" class="floating" data-action="expand" hidden><span class="lamp" aria-hidden="true"></span><span data-part="compact-title">Abrir Farol</span></button>`;
  root.append(shell);
  const spacer = doc.createElement('div');
  spacer.setAttribute('data-farol-root', '');
  spacer.setAttribute('aria-hidden', 'true');
  spacer.style.cssText = 'display:block;pointer-events:none;height:0;clear:both;';
  doc.body.append(host, spacer);
  const $ = selector => root.querySelector(selector);
  const part = name => $(`[data-part="${name}"]`);
  const action = name => $(`[data-action="${name}"]`);
  const panel = $('.panel');
  const ring = $('.ring');
  const marker = $('.target-label');
  const synth = win.speechSynthesis;
  let prefs = { ...defaults };
  let state = 'intro';
  let captured = null;
  let plan = null;
  let index = 0;
  let collapsed = false;
  let destroyed = false;
  let generation = 0;
  let changeTimer;
  let frame;
  let speechSequence = 0;
  let busy = false;
  let consentGranted = false;
  let voices = [];
  let storageQueue = Promise.resolve();
  const controllers = new Set();
  const cleanups = [];
  const previousFocus = doc.activeElement;

  function listen(target, event, handler, options) { target.addEventListener(event, handler, options); cleanups.push(() => target.removeEventListener(event, handler, options)); }
  function status(text) { if (!destroyed) part('status').textContent = text; }
  async function read(key) { try { return await storage?.get(key); } catch { status('O navegador não permitiu guardar preferências. A orientação continua nesta sessão.'); return undefined; } }
  function write(key, value) {
    storageQueue = storageQueue.then(() => storage?.set(key, value)).catch(() => { status('Não foi possível guardar preferências. A orientação continua nesta sessão.'); });
    return storageQueue;
  }
  function setBusy(value) { busy = value; root.querySelectorAll('[data-action="start"], [data-action="refresh"]').forEach(button => { button.disabled = value; }); }
  function stopSpeech() { speechSequence++; try { synth?.cancel(); } catch { /* Text remains available. */ } }
  function stopRequests() { for (const controller of controllers) controller.abort(); controllers.clear(); }
  function setView(view) { state = view; root.querySelectorAll('[data-view]').forEach(node => { node.hidden = node.dataset.view !== view; }); resizeSpacer(); }
  function currentTarget() { return captured?.targets.get(plan?.steps[index]?.targetId); }
  function resizeSpacer() {
    if (destroyed) return;
    spacer.style.height = `${collapsed ? 84 : Math.ceil(panel.getBoundingClientRect().height) + 32}px`;
  }
  function hideHighlight() { ring.hidden = true; marker.hidden = true; }
  function positionHighlight() {
    frame = undefined;
    if (destroyed || state !== 'active') { hideHighlight(); return; }
    const target = currentTarget();
    if (!target?.isConnected) { hideHighlight(); return; }
    const rect = target.getBoundingClientRect();
    const width = win.innerWidth || doc.documentElement.clientWidth;
    const height = win.innerHeight || doc.documentElement.clientHeight;
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) { hideHighlight(); return; }
    ring.hidden = false;
    Object.assign(ring.style, { top: `${rect.top - 4}px`, left: `${rect.left - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
    const top = rect.top >= 34 ? rect.top - 32 : rect.bottom + 8;
    marker.hidden = false;
    Object.assign(marker.style, { top: `${Math.max(4, Math.min(height - 28, top))}px`, left: `${Math.max(8, Math.min(width - 160, rect.left))}px` });
  }
  function scheduleHighlight() { if (!frame) frame = win.requestAnimationFrame(positionHighlight); }
  function showTarget() {
    if (state !== 'active') return;
    // Recheck immediately, including while a debounced mutation is pending.
    markChanged();
    if (!part('change').hidden) return;
    const target = currentTarget();
    if (!target?.isConnected) { markChanged(); return; }
    // Scroll only: the person chooses when to focus, type or click the actual control.
    target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const rect = target.getBoundingClientRect();
    if (!collapsed) {
      const isMobile = win.innerWidth <= 600;
      if (!isMobile) panel.classList.toggle('left', rect.right > win.innerWidth - panel.offsetWidth - 40 && rect.left > panel.offsetWidth + 40);
      const box = panel.getBoundingClientRect();
      const overlapsX = rect.right > box.left && rect.left < box.right;
      if (overlapsX && rect.bottom + 40 > box.top) win.scrollBy({ top: rect.top - Math.max(48, (box.top - rect.height) / 2), behavior: 'instant' });
    }
    scheduleHighlight();
  }
  function speech(text) {
    stopSpeech();
    if (!synth || !win.SpeechSynthesisUtterance) { status('Este navegador não oferece voz. Todas as instruções continuam disponíveis em texto.'); return; }
    const sequence = speechSequence;
    try {
      const utterance = new win.SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = prefs.rate;
      // Some SpeechSynthesis voices are remote services. Only use a voice the
      // browser identifies as local so that speech cannot send instructions out.
      const voice = voices.find(item => item.voiceURI === prefs.voiceURI) || voices.find(item => /^pt-BR$/i.test(item.lang)) || voices[0];
      if (!voice) { status('Não encontrei uma voz em português no aparelho. Você pode continuar pelo texto.'); return; }
      utterance.voice = voice;
      utterance.onerror = event => { if (sequence === speechSequence && !['canceled', 'interrupted'].includes(event.error)) status('A voz não ficou disponível. Você pode seguir pelo texto e tentar Ouvir passo novamente.'); };
      synth.speak(utterance);
    } catch { status('Não foi possível iniciar a voz. Siga pelo texto ou tente Ouvir passo novamente.'); }
  }
  function announceStep() {
    // Do not speak stale guidance, including during the mutation debounce.
    markChanged();
    if (destroyed || state !== 'active' || !part('change').hidden) return;
    const step = plan?.steps[index];
    if (step) speech(`${step.title}. ${step.instruction}`);
  }
  function renderStep({ focus = false, speak = false, scroll = false } = {}) {
    if (!plan?.steps.length) { setView('empty'); hideHighlight(); return; }
    const step = plan.steps[index];
    part('step-count').textContent = `Passo ${index + 1} de ${plan.steps.length}`;
    part('step-title').textContent = step.title;
    part('instruction').textContent = step.instruction;
    $('.progress').setAttribute('aria-valuemax', String(plan.steps.length));
    $('.progress').setAttribute('aria-valuenow', String(index + 1));
    $('.progress').style.setProperty('--progress', `${(index + 1) / plan.steps.length * 100}%`);
    action('previous').disabled = index === 0;
    action('next').textContent = index === plan.steps.length - 1 ? 'Terminei os passos' : 'Já fiz. Próximo';
    part('compact-title').textContent = `Farol · passo ${index + 1} de ${plan.steps.length}`;
    setView('active');
    if (focus && !collapsed) part('step-title').focus({ preventScroll: true });
    if (scroll) showTarget(); else scheduleHighlight();
    if (speak && prefs.voice) announceStep();
  }
  function markChanged() {
    if (destroyed || !captured || ['intro', 'complete', 'empty'].includes(state)) return;
    let current;
    try { current = capturePage(doc); } catch { current = null; }
    const oldTargets = captured.targets;
    const hasChanged = !current || JSON.stringify(current.snapshot) !== JSON.stringify(captured.snapshot) || [...(current?.targets || [])].some(([id, node]) => oldTargets.get(id) !== node);
    if (hasChanged) { stopSpeech(); hideHighlight(); part('change').hidden = false; action('next').disabled = true; action('previous').disabled = true; action('show').disabled = true; action('speak').disabled = true; }
  }
  function validForCurrent(candidate, snapshot) {
    if (!validatePlan(candidate, snapshot)) return false;
    const local = createPlan(snapshot, { goal: prefs.goal, verbosity: prefs.verbosity });
    return JSON.stringify(candidate.steps) === JSON.stringify(local.steps);
  }
  async function request(adapter, payload) {
    const controller = new AbortController();
    controllers.add(controller);
    let timer;
    try {
      return await Promise.race([
        adapter(payload, { signal: controller.signal }),
        new Promise((_, reject) => {
          timer = win.setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 4000);
          controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        })
      ]);
    } finally { win.clearTimeout(timer); controllers.delete(controller); }
  }
  async function start({ preserve = false } = {}) {
    const run = ++generation;
    stopSpeech(); stopRequests();
    setBusy(true);
    status('Estou preparando os passos.');
    const oldTarget = preserve ? currentTarget() : null;
    try {
      const nextCapture = capturePage(doc);
      if (!validateSnapshot(nextCapture.snapshot)) throw new Error('invalid snapshot');
      const snapshot = nextCapture.snapshot;
      let nextPlan = createPlan(snapshot, { goal: prefs.goal, verbosity: prefs.verbosity });
      const key = structuralKey(snapshot, prefs.goal, prefs.verbosity);
      const stored = await read(CACHE_KEY);
      const cache = Array.isArray(stored) ? stored.slice(0, 8) : [];
      const cached = cache.find(item => item && item.key === key && validForCurrent(item.plan, snapshot));
      let note = cached ? 'Roteiro local já conhecido. Seus dados continuam no aparelho.' : 'Roteiro preparado neste aparelho. Você está no controle.';
      if (cached) nextPlan = createPlan(snapshot, { goal: prefs.goal, verbosity: prefs.verbosity });
      if (consentGranted && typeof requestPlan === 'function') {
        try {
          const remote = await request(requestPlan, { schemaVersion: 1, consent: true, snapshot, goal: prefs.goal, verbosity: prefs.verbosity });
          if (!validForCurrent(remote, snapshot)) throw new Error('invalid plan');
          nextPlan = createPlan(snapshot, { goal: prefs.goal, verbosity: prefs.verbosity });
          note = 'Roteiro confirmado pelo serviço local. Os dados digitados não foram enviados.';
        } catch { note = 'O serviço opcional não respondeu com um roteiro válido. Continuamos com a orientação deste aparelho.'; }
      }
      if (destroyed || run !== generation) return;
      // A page can change while an asynchronous cache or service request is
      // pending. Never present the now-stale target as the current step.
      const current = capturePage(doc);
      const stale = JSON.stringify(current.snapshot) !== JSON.stringify(snapshot)
        || [...current.targets].some(([id, node]) => nextCapture.targets.get(id) !== node);
      if (stale) {
        captured = null; plan = null; setView('empty'); hideHighlight();
        status('A página mudou enquanto eu preparava os passos. Tente novamente para orientar os campos atuais.');
        return;
      }
      captured = nextCapture;
      plan = nextPlan;
      const sameTarget = oldTarget && plan.steps.findIndex(step => captured.targets.get(step.targetId) === oldTarget);
      index = typeof sameTarget === 'number' && sameTarget >= 0 ? sameTarget : 0;
      part('change').hidden = true;
      action('next').disabled = false;
      action('show').disabled = false;
      action('speak').disabled = !synth;
      status(note);
      renderStep({ focus: true, speak: true, scroll: true });
      await write(CACHE_KEY, [{ key, plan: nextPlan }, ...cache.filter(item => item && item.key !== key && typeof item.key === 'string' && item.key.length < 16000)].slice(0, 8));
    } catch {
      if (run === generation && !destroyed) { captured = null; plan = null; setView('empty'); hideHighlight(); status('Não consegui preparar esta tela. Você pode atualizar a página e tentar de novo.'); }
    } finally { if (run === generation && !destroyed) { setBusy(false); resizeSpacer(); } }
  }
  function pause() { generation++; setBusy(false); stopRequests(); stopSpeech(); setView('paused'); hideHighlight(); part('compact-title').textContent = 'Farol · orientação pausada'; }
  function collapse() { collapsed = true; panel.hidden = true; action('expand').hidden = false; resizeSpacer(); scheduleHighlight(); action('expand').focus(); }
  function expand() { collapsed = false; panel.hidden = false; action('expand').hidden = true; resizeSpacer(); action('collapse').focus({ preventScroll: true }); if (state === 'active') showTarget(); }
  function updateVoices() {
    voices = synth?.getVoices?.().filter(voice => voice.localService === true && /^pt(?:-|_|$)/i.test(voice.lang)) || [];
    const select = $('#farol-voice');
    select.replaceChildren();
    const fallback = doc.createElement('option'); fallback.value = ''; fallback.textContent = 'Voz do aparelho'; select.append(fallback);
    for (const voice of voices) { const option = doc.createElement('option'); option.value = voice.voiceURI; option.textContent = `${voice.name}${voice.localService ? ' · no aparelho' : ''}`; select.append(option); }
    select.value = voices.some(voice => voice.voiceURI === prefs.voiceURI) ? prefs.voiceURI : '';
  }
  function applyPreferences() {
    panel.style.setProperty('--font-size', `${prefs.fontSize}px`);
    $('#farol-font').value = String(prefs.fontSize);
    $('#farol-rate').value = String(prefs.rate);
    $('#farol-voice-on').checked = prefs.voice;
    $('#farol-detail').value = prefs.verbosity;
    $('#farol-goal').value = prefs.goal;
    updateVoices(); resizeSpacer();
  }
  async function explain() {
    const code = $('#farol-error').value;
    if (!errorCodes.has(code)) return;
    const run = generation;
    let explanation = explainError(code);
    action('explain').disabled = true;
    if (consentGranted && typeof requestExplanation === 'function') {
      try {
        const received = await request(requestExplanation, { schemaVersion: 1, consent: true, code });
        if (received?.code !== explanation.code || received?.title !== explanation.title || received?.instruction !== explanation.instruction) throw new Error('invalid explanation');
      } catch { status('A explicação vem deste aparelho porque o serviço opcional não ficou disponível.'); }
    }
    if (destroyed || run !== generation) { if (!destroyed) action('explain').disabled = false; return; }
    part('explanation').textContent = `${explanation.title}. ${explanation.instruction}`;
    if (prefs.voice) speech(`${explanation.title}. ${explanation.instruction}`);
    action('explain').disabled = false;
  }
  async function erase() {
    generation++; stopSpeech(); stopRequests();
    try {
      storageQueue = storageQueue.then(async () => { await storage?.remove(PREFS_KEY); await storage?.remove(CACHE_KEY); });
      await storageQueue;
    }
    catch { status('O navegador não permitiu apagar os dados locais. Tente nas configurações do navegador.'); return; }
    prefs = { ...defaults }; captured = null; plan = null; index = 0;
    consentGranted = false; $('#farol-consent').checked = false;
    part('explanation').textContent = '';
    part('change').hidden = true;
    setBusy(false); applyPreferences(); setView('intro'); hideHighlight();
    status('Preferências e roteiros apagados. A autorização do serviço também foi encerrada.');
  }
  const handlers = {
    start: () => { prefs.goal = $('#farol-goal').value; void write(PREFS_KEY, prefs); void start(); },
    refresh: () => void start({ preserve: true }), restart: () => { generation++; setBusy(false); stopSpeech(); hideHighlight(); setView('intro'); status('Escolha seu próximo objetivo.'); },
    next: () => {
      markChanged();
      if (!part('change').hidden || busy) return;
      stopSpeech();
      if (index >= plan.steps.length - 1) { setView('complete'); hideHighlight(); part('compact-title').textContent = 'Farol · roteiro concluído'; return; }
      index++; renderStep({ focus: true, speak: true, scroll: true });
    },
    previous: () => { markChanged(); if (index > 0 && !busy && part('change').hidden) { index--; stopSpeech(); renderStep({ focus: true, speak: true, scroll: true }); } },
    show: showTarget, speak: announceStep, 'stop-speech': () => { stopSpeech(); status('Voz interrompida. Você pode continuar pelo texto.'); },
    pause, resume: () => { markChanged(); if (part('change').hidden) renderStep({ focus: true, speak: true, scroll: true }); else void start({ preserve: true }); },
    collapse, expand, close: destroy, erase: () => void erase(), explain: () => void explain()
  };
  listen(root, 'click', event => {
    if (!event.isTrusted) return;
    const button = event.target.closest?.('[data-action]');
    if (button && !button.disabled) handlers[button.dataset.action]?.();
  });
  listen(root, 'change', event => {
    const id = event.target.id;
    if (id === 'farol-consent') {
      if (!event.isTrusted) { event.target.checked = consentGranted; return; }
      consentGranted = event.target.checked;
      if (!consentGranted) { stopRequests(); status('Envio desativado. A orientação continua neste aparelho.'); }
      return;
    }
    if (!event.isTrusted) return;
    if (id === 'farol-error') return;
    const previousVerbosity = prefs.verbosity;
    prefs = validPreferences({ ...prefs, fontSize: Number($('#farol-font').value), rate: Number($('#farol-rate').value), voice: $('#farol-voice-on').checked, voiceURI: $('#farol-voice').value, verbosity: $('#farol-detail').value, goal: $('#farol-goal').value });
    stopSpeech(); applyPreferences(); void write(PREFS_KEY, prefs);
    if (plan && previousVerbosity !== prefs.verbosity) { plan = createPlan(captured.snapshot, { goal: prefs.goal, verbosity: prefs.verbosity }); if (state === 'active') renderStep(); }
  });
  listen(root, 'keydown', event => { if (event.key === 'Escape') { event.preventDefault(); collapse(); } });
  listen(root, 'toggle', resizeSpacer, true);
  listen(win, 'resize', () => { resizeSpacer(); scheduleHighlight(); });
  listen(win, 'scroll', scheduleHighlight, true);
  if (synth?.addEventListener) listen(synth, 'voiceschanged', updateVoices);
  if (!synth || !win.SpeechSynthesisUtterance) { $('#farol-voice-on').disabled = true; action('speak').disabled = true; }
  if (typeof requestPlan === 'function' || typeof requestExplanation === 'function') part('backend').hidden = false;
  const observer = new win.MutationObserver(records => {
    if (records.every(record => host.contains(record.target) || record.target === host || record.target === spacer)) return;
    win.clearTimeout(changeTimer); changeTimer = win.setTimeout(markChanged, 180);
  });
  observer.observe(doc.body, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'required', 'type', 'role',
      'aria-label', 'aria-labelledby', 'aria-disabled', 'aria-required', 'class', 'style',
      'inert', 'readonly', 'aria-readonly', 'for', 'id', 'href', 'contenteditable', 'data-farol-ignore']
  });
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(resizeSpacer) : null;
  resizeObserver?.observe(panel);
  function destroy() {
    if (destroyed) return;
    destroyed = true; generation++; stopRequests(); stopSpeech();
    win.clearTimeout(changeTimer); if (frame) win.cancelAnimationFrame(frame);
    observer.disconnect(); resizeObserver?.disconnect(); cleanups.forEach(fn => fn());
    captured = null; plan = null; consentGranted = false; $('#farol-consent').checked = false;
    host.remove(); spacer.remove(); mounted.delete(doc);
    if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
  }
  const api = { destroy, expand, refresh: () => start({ preserve: true }), ready: null };
  mounted.set(doc, api);
  setBusy(true);
  api.ready = (async () => { prefs = validPreferences(await read(PREFS_KEY)); if (destroyed) return; applyPreferences(); setBusy(false); status('Pronto para começar. Nenhum campo foi lido.'); })();
  return api;
}
