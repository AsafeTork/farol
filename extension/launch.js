(async () => {
  const { mountAssistant } = await import(chrome.runtime.getURL('src/ui/assistant.mjs'));
  const allowedKeys = new Set(['farol:preferences:v1', 'farol:cache:v1']);
  async function stored(type, key, value) {
    if (!allowedKeys.has(key)) return undefined;
    const message = type === 'farol:storage:set' ? { type, key, value } : { type, key };
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error('storage-unavailable');
    return response.value;
  }
  const storage = {
    get: key => stored('farol:storage:get', key),
    set: (key, value) => stored('farol:storage:set', key, value),
    remove: key => stored('farol:storage:remove', key)
  };
  let capabilities;
  try { capabilities = await chrome.runtime.sendMessage({ type: 'farol:capabilities' }); } catch { capabilities = null; }
  async function request(type, payload, { signal } = {}) {
    if (signal?.aborted) throw new Error('aborted');
    // getRandomValues is also available on ordinary HTTP pages, where
    // randomUUID may be unavailable because the page is not a secure context.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const cancel = () => { void chrome.runtime.sendMessage({ type: 'farol:cancel', requestId }).catch(() => {}); };
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const response = await chrome.runtime.sendMessage({ type, payload, requestId });
      if (signal?.aborted || !response?.ok) throw new Error('local-service-unavailable');
      return response.result;
    } finally { signal?.removeEventListener('abort', cancel); }
  }
  mountAssistant({
    document, storage,
    ...(capabilities?.backendEnabled ? {
      requestPlan: (payload, options) => request('farol:plan', payload, options),
      requestExplanation: (payload, options) => request('farol:explain', payload, options)
    } : {})
  });
})().catch(() => {
  // A protected or expired page cannot host the assistant. Do not log page data.
});
