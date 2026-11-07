import { mountAssistant } from '../src/ui/assistant.mjs';

let assistant;
const start = document.querySelector('#start-guide');
const status = document.querySelector('#guide-status');
const exercise = document.querySelector('#exercise');
const original = exercise.innerHTML;
const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(`farol-practice:${key}`)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`farol-practice:${key}`, JSON.stringify(value)); } catch { /* O guia funciona também sem persistência. */ } },
  remove(key) { try { localStorage.removeItem(`farol-practice:${key}`); } catch { /* Armazenamento indisponível. */ } }
};

start.addEventListener('click', async () => {
  start.disabled = true;
  try {
    assistant?.destroy();
    assistant = mountAssistant({ document, storage });
    await assistant.ready;
    status.textContent = 'Guia aberto. Continue no seu ritmo.';
    start.innerHTML = 'Reabrir orientação <span aria-hidden="true">→</span>';
  } catch {
    status.textContent = 'Não foi possível abrir o guia. Recarregue a página para tentar novamente.';
  } finally { start.disabled = false; }
});

function updateGuide() { assistant?.refresh?.(); }
function showError(form) {
  let firstInvalid;
  for (const field of form.querySelectorAll('input,select')) {
    const valid = field.validity.valid;
    field.setAttribute('aria-invalid', String(!valid));
    if (!valid && !firstInvalid) firstInvalid = field;
  }
  if (!firstInvalid) return false;
  const error = document.querySelector('#form-error');
  error.hidden = false;
  error.textContent = firstInvalid.validity.valueMissing ? 'Falta preencher um campo obrigatório. Confira o campo destacado.' : 'Confira o formato do e-mail. Você pode usar pessoa@exemplo.invalid.';
  firstInvalid.focus();
  return true;
}

function bindForm() {
  document.querySelector('#practice-form').addEventListener('submit', event => {
    event.preventDefault();
    if (showError(event.currentTarget)) return;
    // A atividade não lê, persiste ou transmite os conteúdos digitados.
    exercise.innerHTML = `<p class="eyebrow blue">CONFERIR E DECIDIR</p><h2 id="atividade-titulo" tabindex="-1">Você está no controle</h2><p class="description">Os três campos foram preenchidos. Esta atividade é fictícia: nenhum pedido será enviado.</p><form id="confirm-form" novalidate><div class="check-line"><input id="practice-confirm" type="checkbox" required><label for="practice-confirm">Entendi que esta é uma atividade de prática.</label></div><p class="form-error" id="form-error" role="alert" hidden></p><button class="primary continue" type="submit">Concluir atividade <span aria-hidden="true">→</span></button></form>`;
    document.querySelector('#stage-count').textContent = '2 de 2';
    document.querySelector('#atividade-titulo').focus();
    updateGuide();
    document.querySelector('#confirm-form').addEventListener('submit', event => {
      event.preventDefault();
      if (showError(event.currentTarget)) return;
      exercise.innerHTML = `<div class="success-mark" aria-hidden="true">✓</div><p class="eyebrow blue">UM PASSO A MAIS DE AUTONOMIA</p><h2 id="atividade-titulo" tabindex="-1">Prática concluída.</h2><p class="description">Você preencheu os campos, leu uma confirmação e tomou sua decisão.</p><p class="review-note">Em um serviço real, confira sempre o resultado no próprio portal. O Farol orienta; a confirmação pertence ao serviço.</p><button class="primary continue" id="again" type="button" data-farol-ignore>Praticar de novo <span aria-hidden="true">↻</span></button>`;
      document.querySelector('#stage-count').textContent = 'Concluído';
      document.querySelector('#atividade-titulo').focus();
      document.querySelector('#again').addEventListener('click', reset);
      updateGuide();
    });
  });
}

function reset() {
  assistant?.destroy();
  assistant = undefined;
  exercise.innerHTML = original;
  document.querySelector('#stage-count').textContent = '1 de 2';
  status.textContent = 'Sem cadastro. Sem microfone.';
  start.innerHTML = 'Começar orientação <span aria-hidden="true">→</span>';
  bindForm();
  start.focus();
}

document.querySelector('#reset-practice').addEventListener('click', reset);
bindForm();
