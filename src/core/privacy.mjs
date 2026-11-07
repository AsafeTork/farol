/**
 * The only transferable page representation used by Farol.
 * Raw labels are inspected locally to select a fixed enum; values, DOM IDs,
 * names, URLs and page text are never included. Targets stay in memory.
 */
export const CONTEXTS = Object.freeze(['generic', 'govbr', 'practice']);
export const KINDS = Object.freeze([
  'text', 'password', 'email', 'tel', 'number', 'search', 'select',
  'checkbox', 'radio', 'textarea', 'button', 'link',
]);
export const LABELS = Object.freeze([
  'cpf', 'password', 'email', 'name', 'phone', 'search', 'continue',
  'submit', 'back', 'signin', 'option', 'field', 'link', 'button',
]);
export const MAX_CONTROLS = 80;

const inputKinds = new Set(['text', 'password', 'email', 'tel', 'number', 'search', 'checkbox', 'radio']);
const fieldLabels = new Set(['cpf', 'password', 'email', 'name', 'phone', 'search', 'field']);
const actionLabels = new Set(['continue', 'submit', 'back', 'signin', 'search', 'button', 'link']);
const aliases = new Map([
  ['cpf', 'cpf'], ['numero do cpf', 'cpf'], ['seu cpf', 'cpf'], ['digite seu cpf', 'cpf'],
  ['informe seu cpf', 'cpf'], ['cpf somente numeros', 'cpf'],
  ['senha', 'password'], ['sua senha', 'password'], ['digite sua senha', 'password'],
  ['email', 'email'], ['e mail', 'email'], ['seu email', 'email'], ['endereco de email', 'email'],
  ['nome', 'name'], ['nome completo', 'name'], ['seu nome', 'name'],
  ['telefone', 'phone'], ['celular', 'phone'], ['seu telefone', 'phone'],
  ['buscar', 'search'], ['busca', 'search'], ['pesquisar', 'search'], ['pesquisa', 'search'],
  ['o que voce procura', 'search'], ['termo de busca', 'search'],
  ['continuar', 'continue'], ['avancar', 'continue'], ['proximo', 'continue'], ['proxima etapa', 'continue'],
  ['enviar', 'submit'], ['concluir', 'submit'], ['finalizar', 'submit'], ['confirmar', 'submit'],
  ['voltar', 'back'], ['anterior', 'back'], ['etapa anterior', 'back'],
  ['entrar', 'signin'], ['acessar', 'signin'], ['entrar com gov br', 'signin'],
]);

/** Check data properties only: accessors and unexpected/symbol keys fail closed. */
export function exactRecord(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== keys.length || ownKeys.some(key => !keys.includes(key))) return false;
  return keys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && 'value' in descriptor && descriptor.enumerable;
  });
}

/**
 * Reject sparse arrays, custom properties and accessor elements without
 * invoking them. Snapshots can come from untrusted caches or messages.
 */
export function exactArray(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return false;
  }
  return true;
}

/** Strictly validate the entire representation before caching or transmitting it. */
export function validateSnapshot(snapshot) {
  try {
    if (!exactRecord(snapshot, ['schemaVersion', 'context', 'controls'])) return false;
    if (snapshot.schemaVersion !== 1 || !CONTEXTS.includes(snapshot.context)) return false;
    const controls = snapshot.controls;
    if (!exactArray(controls, MAX_CONTROLS)) return false;
    const seen = new Set();
    for (const [index, control] of controls.entries()) {
      if (!exactRecord(control, ['id', 'kind', 'label', 'required', 'disabled'])) return false;
      if (typeof control.id !== 'string' || !/^c(?:[1-9]|[1-7][0-9]|80)$/.test(control.id)) return false;
      // Real captures always assign identifiers in order, with no gaps.
      if (control.id !== `c${index + 1}`) return false;
      if (seen.has(control.id)) return false;
      seen.add(control.id);
      if (!KINDS.includes(control.kind) || !LABELS.includes(control.label)) return false;
      if (control.kind === 'password' && control.label !== 'password') return false;
      if (['checkbox', 'radio', 'select'].includes(control.kind) && control.label !== 'option') return false;
      if (['button', 'link'].includes(control.kind) && !actionLabels.has(control.label)) return false;
      if (!['button', 'link', 'checkbox', 'radio', 'select'].includes(control.kind) && !fieldLabels.has(control.label)) return false;
      if (typeof control.required !== 'boolean' || typeof control.disabled !== 'boolean') return false;
    }
    return true;
  } catch {
    return false;
  }
}

function attribute(element, name) {
  return element.getAttribute?.(name) ?? '';
}

function hidden(element, document) {
  if (element.closest?.('[data-farol-root], [data-farol-ignore], [hidden], [inert], [aria-hidden="true"]')) return true;
  if (element.isConnected === false || attribute(element, 'type').toLowerCase() === 'hidden') return true;
  // Modern browsers check inherited opacity and visibility as well as layout.
  // Do not check viewport intersection: the person may scroll to a control.
  if (typeof element.checkVisibility === 'function'
      && !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return true;
  const style = document.defaultView?.getComputedStyle?.(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0')) return true;
  // Offscreen elements can still be useful steps. Only exclude nodes with no layout.
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return true;
  // Common visually hidden controls are placed thousands of pixels before the
  // page origin. Keep controls below or to the right of the viewport: normal
  // scrolling can reach them. This also handles a fixed element far offscreen.
  if (typeof element.getBoundingClientRect === 'function') {
    const box = element.getBoundingClientRect();
    const view = document.defaultView;
    const offsetX = style?.position === 'fixed' ? 0 : Number(view?.scrollX) || 0;
    const offsetY = style?.position === 'fixed' ? 0 : Number(view?.scrollY) || 0;
    if ((Number.isFinite(box.right) && box.right + offsetX < -2048)
      || (Number.isFinite(box.bottom) && box.bottom + offsetY < -2048)) return true;
  }
  return false;
}

function kindOf(element) {
  const tag = element.tagName?.toLowerCase();
  if (tag === 'button') return 'button';
  if (tag === 'a') return 'link';
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'textarea';
  if (tag === 'input') {
    const type = attribute(element, 'type').toLowerCase() || 'text';
    if (['submit', 'reset', 'button', 'image'].includes(type)) return 'button';
    // Dates/files/ranges need a dedicated skill; avoid inventing instructions.
    return inputKinds.has(type) ? type : null;
  }
  const role = attribute(element, 'role');
  if (role === 'button' || role === 'checkbox' || role === 'radio') return role;
  if (role === 'combobox') return 'select';
  if (attribute(element, 'contenteditable') === 'true') return 'textarea';
  return null;
}

function canonical(text) {
  if (typeof text !== 'string' || text.length > 100) return null;
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[.:*()?!_-]/g, ' ').replace(/\s+/g, ' ').trim();
  // Exact matching prevents labels such as "Nome: Maria" from leaving the device.
  // A common fixed suffix communicates that the field is mandatory; it does
  // not add user-specific information and is never returned to the caller.
  return aliases.get(normalized) ?? aliases.get(normalized.replace(/\s+obrigatorio$/, '')) ?? null;
}

function labelText(element) {
  // Traverse a small label subtree, never an aggregate textContent. Skip editable
  // content and form controls so even an unusual nested label cannot read data.
  const pending = [element];
  let text = '';
  let visited = 0;
  while (pending.length) {
    if (++visited > 32) return null;
    const node = pending.shift();
    if (node.nodeType === 3) {
      text += node.data;
      if (text.length > 100) return null;
      continue;
    }
    if (node.nodeType !== 1) continue;
    if (node.matches?.('input,select,textarea,[contenteditable],[role="textbox"],[role="searchbox"],script,style,[hidden],[aria-hidden="true"]')) continue;
    for (const child of node.childNodes ?? []) pending.push(child);
  }
  return text;
}

function labelOf(element, kind) {
  if (kind === 'password') return 'password';
  // The input's type is structural; reading its value could expose data.
  if (kind === 'button' && element.tagName?.toLowerCase() === 'input'
      && attribute(element, 'type').toLowerCase() === 'submit') return 'submit';
  if (kind === 'checkbox' || kind === 'radio' || kind === 'select') return 'option';
  const candidates = [attribute(element, 'aria-label')];
  // Read only explicitly associated labels, never page/body/form text.
  const labelledBy = attribute(element, 'aria-labelledby');
  if (labelledBy.length <= 200) {
    for (const id of labelledBy.trim().split(/\s+/).slice(0, 4)) {
      if (!id) continue;
      const label = element.ownerDocument?.getElementById?.(id);
      if (label && !label.contains?.(element) && !label.matches?.('input,select,textarea,[contenteditable]')) {
        candidates.push(labelText(label));
      }
    }
  }
  for (const label of Array.from(element.labels ?? []).slice(0, 4)) {
    candidates.push(labelText(label));
  }
  if (kind === 'button' || kind === 'link') {
    // input[type=submit].value is intentionally never inspected.
    if (element.tagName?.toLowerCase() !== 'input') candidates.push(labelText(element));
  }
  for (const candidate of candidates) {
    const label = canonical(candidate);
    if (!label) continue;
    if ((kind === 'button' || kind === 'link') ? actionLabels.has(label) : fieldLabels.has(label)) return label;
  }
  const fallback = { email: 'email', tel: 'phone', search: 'search', button: 'button', link: 'link' };
  return fallback[kind] ?? 'field';
}

function contextOf(document) {
  if (document.documentElement?.hasAttribute?.('data-farol-practice')) return 'practice';
  // Only classify the hostname locally; never retain or transmit it.
  const hostname = document.location?.hostname?.toLowerCase() ?? '';
  return hostname === 'gov.br' || hostname.endsWith('.gov.br') ? 'govbr' : 'generic';
}

/**
 * Capture visible interactive controls. This function does not focus, click,
 * fill, submit, listen to input, read field values or perform network requests.
 */
export function capturePage(document) {
  if (!document?.querySelectorAll) throw new TypeError('Documento indisponível para orientação.');
  const controls = [];
  const targets = new Map();
  const candidates = document.querySelectorAll(
    'input,select,textarea,button,a[href],[role="button"],[role="checkbox"],[role="radio"],[role="combobox"],[contenteditable="true"]',
  );
  let examined = 0;
  for (const element of candidates) {
    if (++examined > 1200 || controls.length >= MAX_CONTROLS) break;
    try {
      if (hidden(element, document)) continue;
      const kind = kindOf(element);
      if (!kind) continue;
      const id = `c${controls.length + 1}`;
      controls.push({
        id, kind, label: labelOf(element, kind),
        required: element.hasAttribute?.('required') === true || attribute(element, 'aria-required') === 'true',
        disabled: element.matches?.(':disabled') === true || attribute(element, 'aria-disabled') === 'true'
          || Boolean(element.closest?.('[aria-disabled="true"]'))
          || attribute(element, 'aria-readonly') === 'true' || element.hasAttribute?.('readonly') === true,
      });
      targets.set(id, element);
    } catch {
      // A removed node or unsupported DOM API must not expose fallback raw text.
    }
  }
  const snapshot = { schemaVersion: 1, context: contextOf(document), controls };
  if (!validateSnapshot(snapshot)) throw new TypeError('Estrutura da página não pôde ser saneada.');
  return { snapshot, targets };
}
