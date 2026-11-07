const CONFIG_KEY = 'farol:backend:v1';
const permission = { origins: ['http://127.0.0.1/*'] };
const form = document.querySelector('#settings');
const enabled = document.querySelector('#enabled');
const token = document.querySelector('#token');
const status = document.querySelector('#status');
const submit = form.querySelector('button');
document.querySelector('#extension-origin').textContent = `chrome-extension://${chrome.runtime.id}`;

async function load() {
  try {
    const config = (await chrome.storage.local.get(CONFIG_KEY))[CONFIG_KEY];
    enabled.checked = config?.enabled === true && await chrome.permissions.contains(permission);
    token.value = typeof config?.token === 'string' ? config.token : '';
  } catch { status.textContent = 'Não foi possível ler as configurações. Tente abrir esta tela novamente.'; }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  submit.disabled = true;
  try {
    if (/[\r\n]/.test(token.value)) throw new Error('token');
    if (enabled.checked && !await chrome.permissions.request(permission)) {
      enabled.checked = false;
      status.textContent = 'A permissão não foi concedida. O Farol continua funcionando neste aparelho.';
      return;
    }
    await chrome.storage.local.set({ [CONFIG_KEY]: { enabled: enabled.checked, token: token.value.trim() } });
    if (!enabled.checked) await chrome.permissions.remove(permission);
    status.textContent = enabled.checked ? 'Configuração salva. Encerre e abra o Farol para iniciar uma nova sessão e autorizar o serviço.' : 'Serviço desativado. O Farol continua funcionando neste aparelho.';
  } catch { status.textContent = 'Não foi possível salvar. Confira o token e tente novamente.'; }
  finally { submit.disabled = false; }
});
document.querySelector('#clear').addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove(CONFIG_KEY);
    await chrome.permissions.remove(permission);
    enabled.checked = false; token.value = '';
    status.textContent = 'Configuração e permissão do servidor removidas.';
  } catch { status.textContent = 'Não foi possível apagar a configuração. Tente novamente.'; }
});
void load();
