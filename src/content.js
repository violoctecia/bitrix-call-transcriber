const FILE_MARK = "crm_show_file.php";
const PANEL_MARK = "data-bct-panel";

const BTN_CLASS = "ui-btn --air ui-btn-md ui-btn-no-caps ui-btn-round";
const CARD = ".crm-timeline__card";
const ACTION_ROW = ".crm-timeline__card-action";
const ACTION_BUTTONS = ".crm-timeline__card-action_buttons";
const ACTION_BTN_WRAP = "crm-timeline__card-action-btn";

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();

function scan() {
  for (const media of document.querySelectorAll("audio, video")) {
    const src = media.currentSrc || media.src || "";
    if (!src.includes(FILE_MARK)) continue;

    const card = media.closest(CARD) || fallbackCard(media);
    if (!card || card.hasAttribute(PANEL_MARK)) continue;

    const row = buttonRow(card);
    if (!row) continue;

    card.setAttribute(PANEL_MARK, "1");
    const info = callInfo(card);
    const first = row.firstChild;
    for (const node of controls(src, info)) {
      row.insertBefore(node, first);
    }
  }
}

function fallbackCard(media) {
  let el = media.parentElement;
  for (let i = 0; i < 8 && el; i++) {
    if (el.clientHeight > 40 && el.clientWidth > 200) return el;
    el = el.parentElement;
  }
  return media.parentElement;
}

function buttonRow(card) {
  const existing = card.querySelector(ACTION_BUTTONS);
  if (existing) return existing;

  const actions = card.querySelector(ACTION_ROW);
  const row = document.createElement("div");
  row.className = "crm-timeline__card-action_buttons";
  if (actions) {
    actions.append(row);
    return row;
  }

  const own = document.createElement("div");
  own.className = "crm-timeline__card-action bct-own-row";
  own.append(row);
  card.append(own);
  return row;
}

function controls(src, info) {
  const transcribe = button("Расшифровать", "--style-filled", () =>
    ask({ type: "transcribe", url: src, info })
  );

  const save = button("Скачать", "--style-outline", async (btn) => {
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Скачиваю…";
    const answer = await ask({ type: "download", url: src, name: fileName(info) });
    btn.disabled = false;
    btn.textContent = answer && answer.ok ? "Скачано" : "Не вышло";
    setTimeout(() => (btn.textContent = label), 2500);
  });

  const link = document.createElement("div");
  link.className = ACTION_BTN_WRAP;
  const anchor = document.createElement("a");
  anchor.className = BTN_CLASS + " --style-plain bct-btn";
  anchor.href = src;
  anchor.target = "_blank";
  anchor.rel = "noopener";
  anchor.download = fileName(info).split("/").pop();
  anchor.textContent = "Ссылка";
  anchor.title = "Открыть файл записи: сохранить правой кнопкой или скопировать адрес";
  link.append(anchor);

  return [transcribe, save, link];
}

function button(text, style, onClick) {
  const wrap = document.createElement("div");
  wrap.className = ACTION_BTN_WRAP;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = BTN_CLASS + " " + style + " bct-btn";
  btn.textContent = text;
  btn.onclick = () => onClick(btn);
  wrap.append(btn);
  return wrap;
}

function callInfo(card) {
  const whole = (card.innerText || "").trim();
  const phone = (whole.match(/\+?\d[\d\s()-]{9,}\d/) || [""])[0].replace(/\D/g, "");
  const direction = /исходящ/i.test(whole) ? "исходящий" : /входящ/i.test(whole) ? "входящий" : "";
  const when = (whole.match(/\d{1,2}\s+[а-яё]+\s+\d{4}\s+\d{1,2}:\d{2}/i) || [""])[0];
  const entity = location.pathname.match(/\/crm\/(lead|deal|contact|company)\/details\/(\d+)/);
  return {
    phone,
    direction,
    when,
    entityType: entity ? entity[1] : "",
    entityId: entity ? entity[2] : "",
    portal: location.host,
  };
}

function fileName(info) {
  const parts = ["bitrix-calls/"];
  parts.push(info.entityType || "call");
  if (info.entityId) parts.push("-" + info.entityId);
  if (info.phone) parts.push("-" + info.phone);
  parts.push(".mp3");
  return parts.join("");
}

function ask(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (answer) => {
        void chrome.runtime.lastError;
        resolve(answer);
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}
