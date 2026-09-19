const FILE_MARK = "crm_show_file.php";
const PANEL_MARK = "data-bct-panel";

const BTN_CLASS = "ui-btn --air ui-btn-md ui-btn-no-caps ui-btn-round";
const CARD = ".crm-timeline__card";
const ACTION_ROW = ".crm-timeline__card-action";
const ACTION_MENU = ".crm-timeline__card-action_menu";
const MENU_ITEM = "crm-timeline__card-action_menu-item";

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();

function scan() {
  for (const media of document.querySelectorAll("audio, video")) {
    const src = media.currentSrc || media.src || "";
    if (!src.includes(FILE_MARK)) continue;

    const card = media.closest(CARD) || fallbackCard(media);
    if (!card || card.hasAttribute(PANEL_MARK)) continue;

    const menu = menuOf(card);
    if (!menu) continue;

    card.setAttribute(PANEL_MARK, "1");
    const info = callInfo(card);
    const first = menu.firstChild;
    for (const node of controls(src, info)) {
      menu.insertBefore(node, first);
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

function menuOf(card) {
  const existing = card.querySelector(ACTION_MENU);
  if (existing) return existing;

  const menu = document.createElement("div");
  menu.className = "crm-timeline__card-action_menu";

  const actions = card.querySelector(ACTION_ROW);
  if (actions) {
    actions.prepend(menu);
    return menu;
  }

  const own = document.createElement("div");
  own.className = "crm-timeline__card-action bct-own-row";
  own.append(menu);
  card.append(own);
  return menu;
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

  save.querySelector("button").title = "Сохранить mp3. Сам файл лежит по адресу " + src;

  return [transcribe, save];
}

function button(text, style, onClick) {
  const wrap = document.createElement("div");
  wrap.className = MENU_ITEM;
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
