const ENDPOINT = "https://stt.api.cloud.yandex.net/speech/v1/stt:recognize";

export class SpeechError extends Error {}

export async function recognize(lpcm, { apiKey, folderId, lang = "ru-RU", rate = 8000 }) {
  if (!apiKey) throw new SpeechError("Не задан API-ключ Yandex SpeechKit — откройте настройки расширения.");
  if (!folderId) throw new SpeechError("Не задан идентификатор каталога (folder id) — откройте настройки расширения.");

  const url = `${ENDPOINT}?${new URLSearchParams({
    folderId,
    lang,
    format: "lpcm",
    sampleRateHertz: String(rate),
    profanityFilter: "false",
  })}`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Api-Key " + apiKey, "Content-Type": "application/octet-stream" },
      body: lpcm,
    });
  } catch (e) {
    throw new SpeechError("Не удалось связаться с Yandex SpeechKit. Проверьте интернет: " + e.message);
  }

  if (!response.ok) {
    throw new SpeechError(explain(response.status, await response.text().catch(() => "")));
  }

  const data = await response.json().catch(() => ({}));
  return (data.result || "").trim();
}

function explain(status, body) {
  const detail = body && body.length < 300 ? " Ответ сервиса: " + body.trim() : "";
  switch (status) {
    case 400:
      return "SpeechKit не принял кусок записи. Обычно это значит, что файл повреждён или пуст." + detail;
    case 401:
      return "Ключ не подошёл: проверьте, что вы вставили API-ключ сервисного аккаунта целиком и без пробелов." + detail;
    case 403:
      return "Доступ запрещён: у сервисного аккаунта нет роли ai.speechkit-stt.user либо каталог указан чужой." + detail;
    case 404:
      return "Каталог не найден: проверьте идентификатор каталога в настройках." + detail;
    case 413:
      return "Кусок записи оказался слишком большим для синхронного распознавания.";
    case 429:
      return "Слишком много запросов подряд — SpeechKit просит подождать. Попробуйте ещё раз через минуту.";
    default:
      if (status >= 500) return "Сервис распознавания ответил ошибкой " + status + ". Это на стороне Яндекса, попробуйте позже.";
      return "Распознавание не удалось, код ответа " + status + "." + detail;
  }
}
