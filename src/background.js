chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg && msg.type === "download") {
    chrome.downloads.download({ url: msg.url, filename: msg.name, saveAs: false }, (id) => {
      reply({ ok: Boolean(id), error: chrome.runtime.lastError && chrome.runtime.lastError.message });
    });
    return true;
  }

  if (msg && msg.type === "transcribe") {
    const params = new URLSearchParams({ src: msg.url });
    for (const [key, value] of Object.entries(msg.info || {})) {
      if (value) params.set(key, String(value));
    }
    chrome.tabs.create({ url: chrome.runtime.getURL("src/transcript.html") + "?" + params });
    reply({ ok: true });
    return false;
  }

  return false;
});
