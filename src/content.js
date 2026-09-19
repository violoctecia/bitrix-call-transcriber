const FILE_MARK = "crm_show_file.php";
const PANEL_MARK = "data-bct-panel";

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();

function scan() {
  for (const media of document.querySelectorAll("audio, video")) {
    const src = media.currentSrc || media.src || "";
    if (!src.includes(FILE_MARK)) continue;
    const host = hostFor(media);
    if (!host || host.hasAttribute(PANEL_MARK)) continue;
    host.setAttribute(PANEL_MARK, "1");
    host.append(panel(src, host));
  }
}

function hostFor(media) {
  let el = media.parentElement;
  for (let i = 0; i < 8 && el; i++) {
    if (el.clientHeight > 40 && el.clientWidth > 200) return el;
    el = el.parentElement;
  }
  return media.parentElement;
}

function panel(src, host) {
  const info = callInfo(host);
  const box = document.createElement("div");
  box.className = "bct-panel";

  const save = document.createElement("button");
  save.className = "bct-btn";
  save.type = "button";
  save.textContent = "Скачать запись";
  save.onclick = async () => {
    save.disabled = true;
    save.textContent = "Скачиваю…";
    const answer = await ask({ type: "download", url: src, name: fileName(info) });
    save.disabled = false;
    save.textContent = answer && answer.ok ? "Скачано" : "Не вышло скачать";
    setTimeout(() => (save.textContent = "Скачать запись"), 2500);
  };

  const text = document.createElement("button");
  text.className = "bct-btn bct-btn-main";
  text.type = "button";
  text.textContent = "Расшифровать";
  text.onclick = () => ask({ type: "transcribe", url: src, info });

  box.append(save, text);
  return box;
}

function callInfo(host) {
  const whole = (host.innerText || "").trim();
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
