/* Farol — interações progressivas. Sem dependências. */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionKey = 'farol-motion';
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const readPref = () => {
    try { return localStorage.getItem(motionKey); } catch { return null; }
  };
  const savePref = (value) => {
    try { localStorage.setItem(motionKey, value); } catch { /* modo privado */ }
  };
  const motionOff = () => root.classList.contains('motion-off');
  let pauseSession = () => {};

  /* ---------- movimento ---------- */
  function updateMotionUI() {
    const off = motionOff();
    $$('[data-motion-toggle]').forEach((button) => {
      button.setAttribute('aria-pressed', String(off));
      const label = $('[data-motion-label]', button);
      if (label) label.textContent = off ? 'Retomar cena' : 'Pausar cena';
      button.setAttribute('aria-label', off ? 'Retomar o movimento da cena' : 'Pausar o movimento da cena');
    });
    if (off) pauseSession();
  }

  function setMotion(off) {
    root.classList.toggle('motion-off', off);
    root.classList.toggle('motion-on', !off);
    savePref(off ? 'off' : 'on');
    updateMotionUI();
    document.dispatchEvent(new CustomEvent('farol:motion', { detail: { off } }));
  }

  $$('[data-motion-toggle]').forEach((button) => {
    button.addEventListener('click', () => setMotion(!motionOff()));
  });

  updateMotionUI();

  if (reduceQuery.addEventListener) {
    reduceQuery.addEventListener('change', (event) => {
      if (readPref()) return;
      setMotion(event.matches);
    });
  }

  /* ---------- menu móvel ---------- */
  const menuButton = $('[data-menu-toggle]');
  const nav = $('#nav-principal');
  if (menuButton && nav) {
    const setMenu = (open) => {
      menuButton.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.classList.toggle('menu-open', open);
    };
    menuButton.addEventListener('click', () => {
      setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
    });
    $$('a', nav).forEach((link) => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
        menuButton.focus();
      }
    });
    const wide = window.matchMedia('(min-width: 1160px)');
    if (wide.addEventListener) wide.addEventListener('change', (event) => { if (event.matches) setMenu(false); });
  }

  /* ---------- progresso de leitura ---------- */
  const header = $('[data-header]');
  const progress = $('[data-progress]');
  let scrollTick = false;
  function onScroll() {
    const doc = document.documentElement;
    const max = doc.scrollHeight - doc.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, doc.scrollTop / max)) : 0;
    if (progress) progress.style.transform = 'scaleX(' + ratio.toFixed(4) + ')';
    if (header) header.classList.toggle('is-scrolled', doc.scrollTop > 8);
    scrollTick = false;
  }
  window.addEventListener('scroll', () => {
    if (!scrollTick) {
      scrollTick = true;
      window.requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  /* ---------- scrollspy ---------- */
  const navLinks = $$('#nav-principal a[href^="#"]');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const byId = new Map(navLinks.map((link) => [link.getAttribute('href').slice(1), link]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((link) => link.removeAttribute('aria-current'));
        const active = byId.get(entry.target.id);
        if (active) active.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-42% 0px -52% 0px', threshold: 0 });
    $$('main section[id]').forEach((section) => spy.observe(section));
  }

  /* ---------- reveal ---------- */
  const revealItems = $$('[data-reveal]');
  if (revealItems.length) {
    if (motionOff() || !('IntersectionObserver' in window)) {
      revealItems.forEach((item) => item.classList.add('is-visible'));
    } else {
      revealItems.forEach((item) => item.classList.add('will-reveal'));
      const reveal = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          reveal.unobserve(entry.target);
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      revealItems.forEach((item) => reveal.observe(item));
      window.setTimeout(() => {
        revealItems.forEach((item) => item.classList.add('is-visible'));
      }, 2400);
    }
  }

  /* ---------- estrelas ---------- */
  const starCanvas = $('[data-stars]');
  if (starCanvas && starCanvas.getContext) {
    const draw = () => {
      const rect = starCanvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      starCanvas.width = Math.round(rect.width * dpr);
      starCanvas.height = Math.round(rect.height * dpr);
      const ctx = starCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      let seed = 73;
      const random = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };
      for (let i = 0; i < 88; i += 1) {
        const x = random() * rect.width;
        const y = random() * rect.height * 0.72;
        const radius = random() * 1.15 + 0.35;
        ctx.globalAlpha = random() * 0.55 + 0.18;
        ctx.fillStyle = random() > 0.9 ? '#FFCD07' : '#DCE6F7';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    let starTimer = 0;
    const redraw = () => {
      window.clearTimeout(starTimer);
      starTimer = window.setTimeout(draw, 120);
    };
    draw();
    window.addEventListener('resize', redraw, { passive: true });
  }

  /* ---------- inclinação 3D ---------- */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (finePointer.matches) {
    $$('[data-tilt]').forEach((element) => {
      let frame = 0;
      let targetX = 0;
      let targetY = 0;
      const paint = () => {
        element.style.setProperty('--tilt-y', targetX.toFixed(2) + 'deg');
        element.style.setProperty('--tilt-x', targetY.toFixed(2) + 'deg');
        frame = 0;
      };
      element.addEventListener('pointermove', (event) => {
        if (motionOff()) return;
        const rect = element.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;
        targetX = px * 10;
        targetY = py * -6;
        if (!frame) frame = window.requestAnimationFrame(paint);
      });
      const reset = () => {
        targetX = 0;
        targetY = 0;
        if (!frame) frame = window.requestAnimationFrame(paint);
      };
      element.addEventListener('pointerleave', reset);
      element.addEventListener('blur', reset, true);
    });
  }

  /* ---------- sessão viva ---------- */
  const session = $('[data-session]');
  if (session) {
    const tabs = $$('[role="tab"]', session);
    const panel = $('[role="tabpanel"]', session);
    const phone = $('[data-session-phone]', session);
    const title = $('[data-session-title]', session);
    const desc = $('[data-session-desc]', session);
    const panelWho = $$('[data-session-who]', session);
    const panelLine = $$('[data-session-line]', session);
    const liveWho = $$('[data-live-who]', session);
    const liveLine = $$('[data-live-line]', session);
    const playButton = $('[data-session-play]', session);
    const playLabel = $('[data-play-label]', session);

    const states = {
      ocioso: {
        title: 'Ocioso',
        desc: 'sessão aberta, em silêncio',
        who: 'Farol',
        line: 'Estou aqui. Quando você quiser começar, é só falar.',
        aria: 'Ocioso. Sessão aberta, em silêncio.'
      },
      ouvindo: {
        title: 'Ouvindo',
        desc: 'é a sua vez de falar',
        who: 'Você',
        line: '“Não sei onde digitar meu CPF.”',
        aria: 'Ouvindo. É a sua vez de falar. Você diz: Não sei onde digitar meu CPF.'
      },
      pensando: {
        title: 'Pensando',
        desc: 'consulta à IA em nuvem',
        who: 'Farol',
        line: 'Um instante. Estou encontrando o campo certo.',
        aria: 'Pensando. Consulta à IA em nuvem.'
      },
      falando: {
        title: 'Falando',
        desc: 'o Farol fala',
        who: 'Farol',
        line: 'É o número que está na sua carteira. Apontei o campo com a <b>borda amarela</b> — pode digitar.',
        aria: 'Falando. O Farol explica onde está o campo do CPF.'
      }
    };

    let current = phone ? phone.getAttribute('data-estado') : 'ouvindo';
    if (!states[current]) current = 'ouvindo';
    let playing = false;
    let timer = 0;
    let order = ['ocioso', 'ouvindo', 'pensando', 'falando'];

    const applyState = (name, moveFocus) => {
      const state = states[name];
      if (!state) return;
      current = name;
      tabs.forEach((tab) => {
        const selected = tab.getAttribute('data-state') === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        if (selected && moveFocus) tab.focus();
      });
      if (phone) phone.setAttribute('data-estado', name);
      if (panel) {
        const active = tabs.find((tab) => tab.getAttribute('data-state') === name);
        if (active) panel.setAttribute('aria-labelledby', active.id);
      }
      if (title) title.textContent = state.title;
      if (desc) desc.textContent = state.desc;
      panelWho.forEach((node) => { node.textContent = state.who; });
      panelLine.forEach((node) => { node.innerHTML = state.line; });
      liveWho.forEach((node) => { node.textContent = state.who; });
      liveLine.forEach((node) => { node.innerHTML = state.line; });
      if (panel) panel.setAttribute('aria-label', state.aria);
    };

    const stopTimer = () => {
      if (timer) window.clearInterval(timer);
      timer = 0;
    };
    const setPlaying = (value) => {
      playing = value;
      if (playButton) {
        playButton.setAttribute('aria-pressed', String(value));
        if (playLabel) playLabel.textContent = value ? 'Pausar a sessão' : 'Reproduzir a sessão';
        playButton.setAttribute('aria-label', value ? 'Pausar a demonstração da sessão viva' : 'Reproduzir a demonstração da sessão viva');
      }
      stopTimer();
      if (!value) return;
      timer = window.setInterval(() => {
        if (motionOff()) { setPlaying(false); return; }
        const index = order.indexOf(current);
        const next = order[(index + 1) % order.length];
        applyState(next, false);
      }, 4200);
    };

    pauseSession = () => setPlaying(false);

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        setPlaying(false);
        applyState(tab.getAttribute('data-state'), false);
      });
      tab.addEventListener('keydown', (event) => {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        setPlaying(false);
        applyState(tabs[next].getAttribute('data-state'), true);
      });
    });

    if (playButton) {
      playButton.addEventListener('click', () => setPlaying(!playing));
    }

    applyState(current, false);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) setPlaying(false);
    });
    document.addEventListener('farol:motion', (event) => {
      if (event.detail && event.detail.off) setPlaying(false);
    });
  }

  /* ---------- comparador antes/depois ---------- */
  const compareRange = $('[data-compare-range]');
  if (compareRange) {
    const compare = compareRange.closest('[data-compare]');
    const updateCompare = () => {
      if (compare) compare.style.setProperty('--pos', compareRange.value + '%');
      compareRange.setAttribute('aria-valuetext', compareRange.value + '% do portal original; ' + (100 - Number(compareRange.value)) + '% do modo Farol');
    };
    compareRange.addEventListener('input', updateCompare);
    updateCompare();
  }

  /* marca que o JS iniciou, para o fallback de reveal */
  root.classList.add('js-ready');
})();
