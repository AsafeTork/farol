/* The Android package contains only first-party offline pages. This adapter
 * exposes the small Web Speech surface used by the shared Farol panel. */
(() => {
  'use strict';
  const native = window.FarolAndroidVoice;
  if (!native) return;
  const listeners = new Set();
  const voice = Object.freeze({
    name: 'Português no dispositivo', voiceURI: 'farol-android-local',
    lang: 'pt-BR', localService: true, default: true
  });
  class Utterance {
    constructor(text) { this.text = String(text ?? ''); this.lang = 'pt-BR'; this.rate = 1; this.voice = null; this.onerror = null; }
  }
  const synthesis = {
    getVoices() {
      try { return native.isReady() ? [voice] : []; } catch { return []; }
    },
    speak(utterance) {
      try {
        if (!native.isReady()) throw new Error('voice unavailable');
        native.speak(String(utterance?.text ?? ''), Number(utterance?.rate) || 1);
      } catch {
        if (typeof utterance?.onerror === 'function') utterance.onerror({ error: 'synthesis-unavailable' });
      }
    },
    cancel() { try { native.stop(); } catch { /* The text remains available. */ } },
    addEventListener(type, listener) { if (type === 'voiceschanged' && typeof listener === 'function') listeners.add(listener); },
    removeEventListener(type, listener) { if (type === 'voiceschanged') listeners.delete(listener); }
  };
  const previousUtterance = Object.getOwnPropertyDescriptor(window, 'SpeechSynthesisUtterance');
  const previousSynthesis = Object.getOwnPropertyDescriptor(window, 'speechSynthesis');
  try {
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
    // Called only by the native host when Android's local TTS is ready.
    Object.defineProperty(window, 'farolAndroidVoiceChanged', {
      configurable: false,
      value() { for (const listener of listeners) { try { listener(); } catch { /* Other listeners may still update. */ } } }
    });
  } catch {
    // Do not leave a custom utterance constructor attached to a native engine
    // if a browser refuses one of the replacements.
    try {
      if (previousUtterance) Object.defineProperty(window, 'SpeechSynthesisUtterance', previousUtterance);
      else delete window.SpeechSynthesisUtterance;
      if (previousSynthesis) Object.defineProperty(window, 'speechSynthesis', previousSynthesis);
      else delete window.speechSynthesis;
    } catch { /* The guide still has text if a browser protects these properties. */ }
  }
})();
