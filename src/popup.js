document.getElementById("options").onclick = () => chrome.runtime.openOptionsPage();

(async () => {
  const state = document.getElementById("state");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { apiKey } = await chrome.storage.local.get("apiKey");

  if (!tab || !/\/crm\//.test(tab.url || "")) {
    state.textContent = "Откройте карточку лида, сделки или контакта со звонком — кнопки появятся рядом с плеером.";
    return;
  }
  state.textContent = apiKey
    ? "Кнопки «Скачать запись» и «Расшифровать» стоят рядом с каждым плеером в карточке."
    : "Скачивание работает. Для расшифровки задайте ключ SpeechKit в настройках.";
})();
