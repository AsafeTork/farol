import { exactArray, exactRecord, MAX_CONTROLS, validateSnapshot } from './privacy.mjs';

export const GOALS = Object.freeze(['form', 'signin', 'search']);
export const VERBOSITIES = Object.freeze(['detailed', 'brief']);
export const ERROR_CODES = Object.freeze(['required', 'format', 'length', 'range', 'connection', 'unknown']);

// Every spoken/displayed instruction is generated here, including API/cache
// responses. No page text, model text or DOM value becomes an instruction.
const fields = {
  cpf: ['Informe seu CPF', 'Digite seu CPF neste campo. Confira os números no seu documento, sem dizer em voz alta.', 'Digite seu CPF no campo destacado.'],
  password: ['Confira o site antes da senha', 'Confira o endereço do site. Se você reconhece e confia nele, digite sua senha no campo destacado. Não diga a senha em voz alta.', 'Confira o site e digite sua senha. Não a diga em voz alta.'],
  email: ['Informe seu e-mail', 'Digite seu endereço de e-mail no campo destacado. Confira se escreveu o endereço completo.', 'Digite seu e-mail no campo destacado.'],
  name: ['Informe seu nome', 'Leia o rótulo deste campo e digite seu nome como o site pede.', 'Digite seu nome conforme o rótulo do campo.'],
  phone: ['Informe seu telefone', 'Leia o rótulo deste campo e digite seu telefone, incluindo o código da sua região se for pedido.', 'Digite seu telefone conforme o rótulo do campo.'],
  search: ['O que você quer encontrar?', 'Digite no campo destacado as palavras do que você quer encontrar. Depois, revise o que escreveu.', 'Digite o que você quer encontrar.'],
  field: ['Leia este campo', 'Leia o rótulo do campo destacado. Preencha apenas se entender o que o site pede. Se tiver dúvida, peça ajuda antes de compartilhar seus dados.', 'Leia o rótulo. Preencha somente se entender o que é pedido.'],
};

const actions = {
  continue: ['Confira antes de continuar', 'Confira o que você preencheu. Quando estiver de acordo, você pode usar o botão destacado para continuar.', 'Confira seus dados. Se estiver de acordo, continue.'],
  submit: ['Revise antes de confirmar', 'Leia o que o site informa e confira seus dados. Este botão pode enviar informações ou confirmar uma solicitação. Só use se quiser seguir.', 'Revise o que será enviado ou confirmado. Você decide se quer seguir.'],
  signin: ['Confira antes de entrar', 'Confira o endereço do site e os dados que você digitou. Se quiser acessar sua conta, use o botão destacado.', 'Confira o site e seus dados. Você decide se quer entrar.'],
  search: ['Inicie sua busca', 'Confira as palavras que você escreveu. Use o botão destacado quando quiser ver os resultados.', 'Confira as palavras e use o botão para buscar.'],
  back: ['Volte se precisar', 'Use este controle somente se quiser voltar à etapa anterior. O site pode não guardar o que você digitou.', 'Volte somente se quiser rever a etapa anterior.'],
  button: ['Leia este botão', 'Leia o texto do botão destacado e o que ele faz. O Farol ainda não reconhece esta ação. Só continue se entender e quiser executá-la.', 'Leia o botão. Só use se entender e quiser executar a ação.'],
  link: ['Leia este link', 'Leia o link destacado antes de abrir. O Farol ainda não reconhece seu destino. Você decide se quer seguir.', 'Leia o link antes de abrir. Você decide se quer seguir.'],
};

const choices = {
  checkbox: ['Confira esta opção', 'Leia o texto ao lado da opção destacada. Marque apenas se concordar ou se ela corresponder ao que você quer. Não é preciso concordar para usar o Farol.', 'Leia a opção. Marque somente se concordar ou quiser escolhê-la.'],
  radio: ['Escolha uma opção', 'Leia as alternativas apresentadas pelo site e escolha a que corresponde ao que você quer.', 'Leia as alternativas e escolha a que você quer.'],
  select: ['Abra a lista de opções', 'Abra a lista destacada e leia as opções. Escolha a que corresponde ao que você quer informar.', 'Abra a lista e escolha a opção desejada.'],
};

function optionsFor(goal, verbosity) {
  if (!GOALS.includes(goal) || !VERBOSITIES.includes(verbosity)) throw new TypeError('Objetivo ou nível de detalhe inválido.');
}

function stepFor(control, verbosity) {
  let template;
  let action;
  if (control.kind === 'button' || control.kind === 'link') {
    template = actions[control.label] ?? actions[control.kind];
    action = ['button', 'link'].includes(control.label) || !actions[control.label] ? 'read' : 'activate';
  } else if (choices[control.kind]) {
    template = choices[control.kind];
    action = 'choose';
  } else {
    template = fields[control.label] ?? fields.field;
    action = control.label === 'field' || !fields[control.label] ? 'read' : 'fill';
  }
  let instruction = template[verbosity === 'brief' ? 2 : 1];
  if (control.required && control.kind !== 'button' && control.kind !== 'link') {
    instruction += ' O site indica que este campo é obrigatório.';
  }
  return { targetId: control.id, action, title: template[0], instruction };
}

function selectedByGoal(control, goal) {
  if (control.disabled) return false;
  if (goal === 'search') return control.label === 'search';
  if (goal === 'signin') return ['cpf', 'email', 'password', 'signin', 'continue', 'submit'].includes(control.label);
  // Generic forms should not guide header searches, back links or navigation.
  if (control.kind === 'link' || control.label === 'back' || control.label === 'search') return false;
  return true;
}

export function createPlan(snapshot, { goal = 'form', verbosity = 'detailed' } = {}) {
  if (!validateSnapshot(snapshot)) throw new TypeError('Estrutura de página inválida.');
  optionsFor(goal, verbosity);
  return {
    schemaVersion: 1,
    source: 'local',
    steps: snapshot.controls.filter(control => selectedByGoal(control, goal)).map(control => stepFor(control, verbosity)),
  };
}

function equalsStep(step, expected) {
  return step.targetId === expected.targetId && step.action === expected.action
    && step.title === expected.title && step.instruction === expected.instruction;
}

/**
 * Structural validation alone is insufficient: only exact local instructions
 * for this target are accepted. Reject unknown targets, duplicates, reordered
 * actions and fabricated instructions from a server or a poisoned cache.
 */
export function validatePlan(plan, snapshot, { goal, verbosity } = {}) {
  try {
    if (!validateSnapshot(snapshot) || !exactRecord(plan, ['schemaVersion', 'source', 'steps'])) return false;
    if (plan.schemaVersion !== 1 || plan.source !== 'local' || !exactArray(plan.steps, MAX_CONTROLS)) return false;
    if (goal !== undefined && !GOALS.includes(goal)) return false;
    if (verbosity !== undefined && !VERBOSITIES.includes(verbosity)) return false;
    for (const step of plan.steps) {
      if (!exactRecord(step, ['targetId', 'action', 'title', 'instruction'])) return false;
    }
    // The entire sequence must match one local skill, not merely individual
    // valid steps. This prevents a remote plan from silently omitting checks.
    const goals = goal === undefined ? GOALS : [goal];
    const detailLevels = verbosity === undefined ? VERBOSITIES : [verbosity];
    return goals.some(candidateGoal => detailLevels.some(candidateVerbosity => {
      const expected = createPlan(snapshot, { goal: candidateGoal, verbosity: candidateVerbosity }).steps;
      return expected.length === plan.steps.length
        && plan.steps.every((step, index) => equalsStep(step, expected[index]));
    }));
  } catch {
    return false;
  }
}

const errors = {
  required: ['Falta preencher um campo', 'O site indica que um campo obrigatório ficou vazio. Confira o campo destacado e leia o que ele pede.'],
  format: ['Confira o formato', 'O site não reconheceu o formato informado. Leia a orientação junto ao campo e confira o que digitou.'],
  length: ['Confira a quantidade de caracteres', 'O site pede um texto mais curto ou mais longo. Leia o limite informado junto ao campo.'],
  range: ['Confira o número informado', 'O site indica que o número está fora do intervalo permitido. Confira os limites junto ao campo.'],
  connection: ['A conexão não respondeu', 'Não foi possível obter ajuda do serviço. Você pode continuar com as orientações locais e tentar novamente depois.'],
  unknown: ['Vamos conferir com calma', 'Leia a mensagem exibida pelo site. O Farol não reconhece esse erro com segurança. Se não entender, procure o suporte oficial do serviço.'],
};

export function explainError(code) {
  const safeCode = ERROR_CODES.includes(code) ? code : 'unknown';
  const [title, instruction] = errors[safeCode];
  return { code: safeCode, title, instruction };
}

/** Stable, inspectable key containing only the same validated structural enums. */
export function structuralKey(snapshot, goal = 'form', verbosity = 'detailed') {
  if (!validateSnapshot(snapshot)) throw new TypeError('Estrutura de página inválida.');
  optionsFor(goal, verbosity);
  return 'farol:skill:v1:' + JSON.stringify([
    snapshot.context, goal, verbosity,
    snapshot.controls.map(({ id, kind, label, required, disabled }) => [id, kind, label, required, disabled]),
  ]);
}
