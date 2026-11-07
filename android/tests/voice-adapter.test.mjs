import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const code = readFileSync(fileURLToPath(new URL('../app/src/main/web/android-tts.js', import.meta.url)), 'utf8');

test('a ponte oferece apenas voz local disponível e encaminha texto, ritmo e interrupção', () => {
  let ready = false, notifications = 0, spoken = null, stops = 0;
  const window = { FarolAndroidVoice: {
    isReady() { return ready; },
    speak(text, rate) { spoken = { text, rate }; },
    stop() { stops++; }
  } };
  runInNewContext(code, { window });
  const synth = window.speechSynthesis;
  assert.equal(synth.getVoices().length, 0);
  synth.addEventListener('voiceschanged', () => { notifications++; });
  ready = true;
  window.farolAndroidVoiceChanged();
  assert.equal(notifications, 1);
  const voices = synth.getVoices();
  assert.equal(voices.length, 1);
  assert.equal(voices[0].lang, 'pt-BR');
  assert.equal(voices[0].localService, true);
  const utterance = new window.SpeechSynthesisUtterance('Leia o campo destacado.');
  utterance.rate = 0.9;
  utterance.voice = voices[0];
  synth.speak(utterance);
  assert.equal(spoken.text, 'Leia o campo destacado.');
  assert.equal(spoken.rate, 0.9);
  synth.cancel();
  assert.equal(stops, 1);
});

test('sem voz pronta, a interface recebe uma falha e mantém a orientação textual', () => {
  const window = { FarolAndroidVoice: { isReady: () => false, stop() {} } };
  runInNewContext(code, { window });
  let error;
  const utterance = new window.SpeechSynthesisUtterance('Exemplo');
  utterance.onerror = event => { error = event.error; };
  window.speechSynthesis.speak(utterance);
  assert.equal(error, 'synthesis-unavailable');
});

test('a página continua utilizável quando não existe ponte Android', () => {
  const window = {};
  runInNewContext(code, { window });
  assert.equal(window.speechSynthesis, undefined);
});

test('se o navegador proteger a síntese nativa, o adaptador não deixa um construtor incompatível', () => {
  const originalUtterance = function Original() {};
  const originalEngine = { getVoices: () => [] };
  const window = { FarolAndroidVoice: { isReady: () => true }, SpeechSynthesisUtterance: originalUtterance };
  Object.defineProperty(window, 'speechSynthesis', { configurable: false, value: originalEngine });
  runInNewContext(code, { window });
  assert.equal(window.speechSynthesis, originalEngine);
  assert.equal(window.SpeechSynthesisUtterance, originalUtterance);
});
