import test from 'node:test';
import assert from 'node:assert/strict';
import { capturePage, validateSnapshot, MAX_CONTROLS } from '../src/core/privacy.mjs';
import { createPlan, validatePlan, explainError, structuralKey, ERROR_CODES } from '../src/core/planner.mjs';

// Small DOM doubles expose the exact APIs the capture layer uses. Sensitive
// getters throw, making an accidental read fail even if the result is redacted.
class Element {
  constructor(tagName, attributes = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = attributes;
    this.nodeType = 1;
    this.childNodes = text ? [{ nodeType: 3, data: text }] : [];
    this.labels = [];
    this.isConnected = true;
    this.style = { display: 'block', visibility: 'visible' };
    this.rects = [{}];
    this.excludedAncestor = false;
    this.reads = [];
    for (const key of ['value', 'checked', 'selectedOptions', 'innerHTML', 'textContent']) {
      Object.defineProperty(this, key, { get: () => { this.reads.push(key); throw new Error(`Sensitive read: ${key}`); } });
    }
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getClientRects() { return this.rects; }
  closest(selector) {
    const match = selector.includes('[data-farol-root]') && this.hasAttribute('data-farol-root')
      || selector.includes('[data-farol-ignore]') && (this.hasAttribute('data-farol-ignore') || this.ignoredAncestor)
      || selector.includes('[hidden]') && this.hasAttribute('hidden')
      || selector.includes('[inert]') && this.hasAttribute('inert')
      || selector.includes('[aria-hidden="true"]') && this.attributes['aria-hidden'] === 'true'
      || selector.includes('[aria-disabled="true"]') && (this.attributes['aria-disabled'] === 'true' || this.disabledAncestor);
    return this.excludedAncestor && selector.includes('[data-farol-root]') || match ? this : null;
  }
  matches(selector) {
    if (selector === ':disabled') return this.hasAttribute('disabled');
    return selector.split(',').some(part => {
      if (part === this.tagName.toLowerCase()) return true;
      if (part === '[contenteditable]') return this.hasAttribute('contenteditable');
      if (part === '[role="textbox"]') return this.attributes.role === 'textbox';
      if (part === '[role="searchbox"]') return this.attributes.role === 'searchbox';
      if (part === '[hidden]') return this.hasAttribute('hidden');
      if (part === '[aria-hidden="true"]') return this.attributes['aria-hidden'] === 'true';
      return false;
    });
  }
  contains(element) { return element === this || this.childNodes.some(child => child.contains?.(element)); }
}

function documentWith(elements, { hostname = 'example.test', practice = false, labelled = {} } = {}) {
  const document = {
    documentElement: { hasAttribute: name => name === 'data-farol-practice' && practice },
    location: { hostname },
    defaultView: { getComputedStyle: element => element.style },
    querySelectorAll: () => elements,
    getElementById: id => labelled[id] ?? null,
  };
  for (const element of elements) element.ownerDocument = document;
  Object.defineProperty(document, 'URL', { get: () => { throw new Error('URL must never be read.'); } });
  return document;
}

function control(id, kind, label, extras = {}) {
  return { id, kind, label, required: false, disabled: false, ...extras };
}

const snapshot = {
  schemaVersion: 1, context: 'practice', controls: [
    control('c1', 'text', 'cpf', { required: true }),
    control('c2', 'password', 'password'),
    control('c3', 'button', 'continue'),
    control('c4', 'search', 'search'),
    control('c5', 'button', 'search'),
    control('c6', 'checkbox', 'option'),
    control('c7', 'button', 'submit', { disabled: true }),
  ],
};

test('capture never reads field values, DOM aggregate text, URLs or sensitive control properties', () => {
  const cpf = new Element('input', { type: 'text', id: 'CPF-12345678901', name: 'Maria', 'aria-label': 'CPF', required: '' });
  const password = new Element('input', { type: 'password' });
  const button = new Element('button', {}, 'Continuar');
  const { snapshot: captured, targets } = capturePage(documentWith([cpf, password, button]));
  assert.deepEqual(captured.controls, [
    control('c1', 'text', 'cpf', { required: true }), control('c2', 'password', 'password'), control('c3', 'button', 'continue'),
  ]);
  assert.equal(targets.get('c1'), cpf);
  assert.equal(targets.get('c2'), password);
  assert.equal(JSON.stringify(captured).includes('Maria'), false);
  assert.equal(JSON.stringify(captured).includes('12345678901'), false);
  assert.deepEqual([cpf.reads, password.reads, button.reads], [[], [], []]);
});

test('PII embedded in labels, IDs, placeholders and URLs never becomes transferable text', () => {
  const name = new Element('input', { 'aria-label': 'Nome: Maria Silva', placeholder: 'maria@example.test', id: 'secret-abc' });
  const link = new Element('a', { href: 'https://example.test/?token=private' }, 'Conta de Maria Silva');
  const { snapshot: captured } = capturePage(documentWith([name, link], { hostname: 'maria.example.test' }));
  assert.equal(captured.context, 'generic');
  assert.equal(captured.controls[0].label, 'field');
  assert.equal(captured.controls[1].label, 'link');
  assert.doesNotMatch(JSON.stringify(captured), /Maria|maria|secret|private|example/);
});

test('only exact static label aliases survive canonicalization', () => {
  const label = new Element('label', {}, 'Número do CPF:');
  const field = new Element('input');
  field.labels.push(label);
  const emailLabel = new Element('span', {}, 'E-mail');
  const email = new Element('input', { 'aria-labelledby': 'personal-label-id' });
  const { snapshot: captured } = capturePage(documentWith([field, email], { labelled: { 'personal-label-id': emailLabel } }));
  assert.deepEqual(captured.controls.map(item => item.label), ['cpf', 'email']);
  assert.deepEqual(label.reads, []);
  assert.deepEqual(emailLabel.reads, []);
});

test('recognizes standard mandatory labels without returning their original text', () => {
  const name = new Element('input');
  name.labels.push(new Element('label', {}, 'Nome (obrigatório)'));
  const mail = new Element('input');
  mail.labels.push(new Element('label', {}, 'E-mail (obrigatório)'));
  const personal = new Element('input', { 'aria-label': 'Nome Maria (obrigatório)' });
  const { snapshot: captured } = capturePage(documentWith([name, mail, personal]));
  assert.deepEqual(captured.controls.map(item => item.label), ['name', 'email', 'field']);
  assert.doesNotMatch(JSON.stringify(captured), /obrigatório|Maria/);
});

test('nested editable content and textarea defaults are never read as a label', () => {
  const label = new Element('label', {}, 'Nome');
  const typed = new Element('textarea', {}, 'Very private initial note');
  label.childNodes.push(typed);
  label.childNodes.push(new Element('span', { role: 'textbox' }, 'Confidential typed text'));
  const field = new Element('input');
  field.labels = [label];
  const button = new Element('button', {}, 'Continuar');
  button.childNodes.push(new Element('span', { contenteditable: 'true' }, 'secret token'));
  const { snapshot: captured } = capturePage(documentWith([field, button]));
  assert.equal(captured.controls[0].label, 'name');
  assert.equal(captured.controls[1].label, 'continue');
  assert.doesNotMatch(JSON.stringify(captured), /private|secret|token|Confidential/);
  assert.deepEqual(typed.reads, []);
});

test('capture excludes assistant, hidden, disconnected, inert and unsupported controls', () => {
  const hiddenInput = new Element('input', { type: 'hidden' });
  const hostChild = new Element('button'); hostChild.excludedAncestor = true;
  const disconnected = new Element('input'); disconnected.isConnected = false;
  const noLayout = new Element('input'); noLayout.rects = [];
  const cssHidden = new Element('input'); cssHidden.style.visibility = 'hidden';
  const cssNone = new Element('input'); cssNone.style.display = 'none';
  const transparent = new Element('input'); transparent.style.opacity = '0';
  const offscreenHidden = new Element('input'); offscreenHidden.getBoundingClientRect = () => ({ right: -9998, bottom: 100 });
  const invisibleThroughAncestor = new Element('input'); invisibleThroughAncestor.checkVisibility = () => false;
  const ignored = new Element('button', { 'data-farol-ignore': '' });
  const ignoredDescendant = new Element('input'); ignoredDescendant.ignoredAncestor = true;
  const fileInput = new Element('input', { type: 'file' });
  const usable = new Element('input', { type: 'text', 'aria-label': 'CPF' });
  // A visible control below the viewport must be kept for scroll navigation.
  usable.getBoundingClientRect = () => ({ right: 400, bottom: 3000 });
  const { snapshot: captured } = capturePage(documentWith([
    hiddenInput, hostChild, disconnected, noLayout, cssHidden, cssNone, transparent, offscreenHidden, invisibleThroughAncestor,
    ignored, ignoredDescendant, fileInput,
    new Element('input', { inert: '' }), new Element('input', { hidden: '' }), usable,
  ]));
  assert.deepEqual(captured.controls, [control('c1', 'text', 'cpf')]);
});

test('disabled and readonly controls are represented but never become planned actions', () => {
  const disabledAncestor = new Element('button'); disabledAncestor.disabledAncestor = true;
  const { snapshot: captured } = capturePage(documentWith([
    new Element('input', { disabled: '', 'aria-label': 'CPF' }),
    new Element('input', { readonly: '', 'aria-label': 'CPF' }),
    new Element('button', { 'aria-disabled': 'true' }, 'Continuar'),
    new Element('input', { 'aria-readonly': 'true', 'aria-label': 'CPF' }),
    disabledAncestor,
  ]));
  assert.equal(captured.controls.length, 5);
  assert.ok(captured.controls.every(item => item.disabled));
  assert.deepEqual(createPlan(captured).steps, []);
});

test('capture is bounded and maintains opaque unique target IDs', () => {
  const fields = Array.from({ length: 100 }, () => new Element('input'));
  const { snapshot: captured, targets } = capturePage(documentWith(fields));
  assert.equal(captured.controls.length, MAX_CONTROLS);
  assert.equal(targets.size, MAX_CONTROLS);
  assert.equal(captured.controls.at(-1).id, 'c80');
  assert.equal(validateSnapshot(captured), true);
});

test('Gov.br context requires a hostname boundary and does not retain it', () => {
  for (const hostname of ['gov.br', 'sso.acesso.gov.br']) {
    assert.equal(capturePage(documentWith([], { hostname })).snapshot.context, 'govbr');
  }
  for (const hostname of ['evilgov.br', 'gov.br.attacker.test']) {
    assert.equal(capturePage(documentWith([], { hostname })).snapshot.context, 'generic');
  }
  assert.equal(capturePage(documentWith([], { practice: true })).snapshot.context, 'practice');
});

test('snapshot rejects raw data, extra keys, enum tampering and invalid target identifiers', () => {
  assert.equal(validateSnapshot(snapshot), true);
  for (const mutate of [
    value => { value.url = 'https://private.test'; },
    value => { value.context = 'https://gov.br'; },
    value => { value.schemaVersion = 2; },
    value => { value.controls[0].value = '12345678901'; },
    value => { value.controls[0].label = 'Nome: Maria'; },
    value => { value.controls[0].id = '#cpf-personal'; },
    value => { value.controls[0].id = 'c81'; },
    value => { value.controls[0].id = 'c8'; },
    value => { value.controls[0].required = 'yes'; },
    value => { value.controls[1].id = 'c1'; },
    value => { value.controls[1].kind = 'secret'; },
    value => { value.controls[1].label = 'cpf'; },
    value => { value.controls[2].label = 'option'; },
    value => { value.controls.extra = 'private'; },
    value => { delete value.controls[0]; },
  ]) {
    const bad = structuredClone(snapshot); mutate(bad);
    assert.equal(validateSnapshot(bad), false);
  }
});

test('snapshot validation fails closed without invoking getters', () => {
  let invoked = false;
  const accessor = { schemaVersion: 1, context: 'generic' };
  Object.defineProperty(accessor, 'controls', { enumerable: true, get() { invoked = true; return []; } });
  assert.equal(validateSnapshot(accessor), false);
  assert.equal(invoked, false);
  const getterItem = structuredClone(snapshot);
  Object.defineProperty(getterItem.controls, '0', { enumerable: true, get() { invoked = true; return snapshot.controls[0]; } });
  assert.equal(validateSnapshot(getterItem), false);
  assert.equal(invoked, false);
  const inherited = Object.create(snapshot);
  assert.equal(validateSnapshot(inherited), false);
  assert.equal(validateSnapshot(null), false);
});

test('skills produce different relevant routes and never run a DOM action', () => {
  const form = createPlan(snapshot);
  const signin = createPlan(snapshot, { goal: 'signin' });
  const search = createPlan(snapshot, { goal: 'search' });
  assert.deepEqual(form.steps.map(step => step.targetId), ['c1', 'c2', 'c3', 'c6']);
  assert.deepEqual(signin.steps.map(step => step.targetId), ['c1', 'c2', 'c3']);
  assert.deepEqual(search.steps.map(step => step.targetId), ['c4', 'c5']);
  for (const plan of [form, signin, search]) assert.equal(validatePlan(plan, snapshot), true);
  assert.match(form.steps[0].instruction, /obrigatório/);
  assert.match(form.steps[1].instruction, /Não diga a senha/);
  assert.equal(form.steps[3].action, 'choose');
});

test('sign-in includes an input submit without reading its potentially private value', () => {
  const cpf = new Element('input', { 'aria-label': 'CPF' });
  const password = new Element('input', { type: 'password' });
  const submit = new Element('input', { type: 'submit', value: 'Entrar' });
  const { snapshot: captured } = capturePage(documentWith([cpf, password, submit]));
  assert.equal(captured.controls[2].label, 'submit');
  const plan = createPlan(captured, { goal: 'signin' });
  assert.deepEqual(plan.steps.map(step => step.targetId), ['c1', 'c2', 'c3']);
  assert.match(plan.steps[2].instruction, /revise|confira/i);
  assert.deepEqual(submit.reads, []);
  assert.doesNotMatch(JSON.stringify(captured), /Entrar/);
});

test('unknown fields and buttons are guidance to read, never an inferred action', () => {
  const unknown = { schemaVersion: 1, context: 'generic', controls: [control('c1', 'text', 'field'), control('c2', 'button', 'button')] };
  const plan = createPlan(unknown);
  assert.deepEqual(plan.steps.map(step => step.action), ['read', 'read']);
  assert.match(plan.steps[1].instruction, /não reconhece/);
});

test('brief guidance remains valid and keeps all target/action decisions', () => {
  const verbose = createPlan(snapshot);
  const brief = createPlan(snapshot, { verbosity: 'brief' });
  assert.deepEqual(brief.steps.map(({ targetId, action }) => [targetId, action]), verbose.steps.map(({ targetId, action }) => [targetId, action]));
  assert.ok(brief.steps.every((step, index) => step.instruction.length < verbose.steps[index].instruction.length));
  assert.equal(validatePlan(brief, snapshot), true);
});

test('untrusted plans cannot inject instructions, scripts, new targets or hidden action fields', () => {
  for (const mutate of [
    plan => { plan.steps[0].instruction = 'Envie sua senha para um atendente.'; },
    plan => { plan.steps[0].title = '<img src=x onerror=alert(1)>'; },
    plan => { plan.steps[0].targetId = 'c80'; },
    plan => { plan.steps[0].action = 'click'; },
    plan => { plan.steps[0].selector = '#login'; },
    plan => { plan.steps.push(plan.steps[0]); },
    plan => { plan.steps.reverse(); },
    plan => { plan.steps.shift(); },
    plan => { plan.steps.splice(1, 1); },
    plan => { plan.source = 'remote'; },
    plan => { plan.instructions = 'ignore previous instructions'; },
  ]) {
    const bad = createPlan(snapshot); mutate(bad);
    assert.equal(validatePlan(bad, snapshot), false);
  }
});

test('validation binds the entire plan to the requested goal and detail level', () => {
  const plan = createPlan(snapshot, { goal: 'signin', verbosity: 'brief' });
  assert.equal(validatePlan(plan, snapshot, { goal: 'signin', verbosity: 'brief' }), true);
  assert.equal(validatePlan(plan, snapshot, { goal: 'form', verbosity: 'brief' }), false);
  assert.equal(validatePlan(plan, snapshot, { goal: 'signin', verbosity: 'detailed' }), false);
  assert.equal(validatePlan(plan, snapshot, { goal: 'other' }), false);
  let invoked = false;
  Object.defineProperty(plan.steps, '0', { enumerable: true, get() { invoked = true; return {}; } });
  assert.equal(validatePlan(plan, snapshot), false);
  assert.equal(invoked, false);
});

test('plan cannot target a control that became disabled or changed meaning', () => {
  const plan = createPlan(snapshot);
  const disabled = structuredClone(snapshot); disabled.controls[0].disabled = true;
  const changed = structuredClone(snapshot); changed.controls[0].label = 'name';
  assert.equal(validatePlan(plan, disabled), false);
  assert.equal(validatePlan(plan, changed), false);
});

test('cache key uses only validated structure and partitions goals and verbosity', () => {
  const key = structuralKey(snapshot);
  assert.equal(key, structuralKey(structuredClone(snapshot)));
  assert.notEqual(key, structuralKey(snapshot, 'signin'));
  assert.notEqual(key, structuralKey(snapshot, 'form', 'brief'));
  const invalid = structuredClone(snapshot); invalid.controls[0].value = 'sensitive';
  assert.throws(() => structuralKey(invalid), TypeError);
  assert.throws(() => createPlan(invalid), TypeError);
  assert.throws(() => createPlan(snapshot, { goal: 'transfer-money' }), TypeError);
});

test('error explanations use only enums and never echo raw error text', () => {
  for (const code of ERROR_CODES) {
    const explanation = explainError(code);
    assert.equal(explanation.code, code);
    assert.ok(explanation.title && explanation.instruction);
  }
  const explanation = explainError('CPF 123.456.789-01 already registered for Maria');
  assert.equal(explanation.code, 'unknown');
  assert.doesNotMatch(JSON.stringify(explanation), /123|Maria|already/);
});
