import { decodeToMono, speechSegments, toLPCM, TARGET_RATE } from "./lib/audio.js";
import { recognize, SpeechError } from "./lib/yandex.js";

const PARALLEL = 4;

const params = new URLSearchParams(location.search);
const src = params.get("src") || "";
const info = {
  phone: params.get("phone") || "",
  when: params.get("when") || "",
  direction: params.get("direction") || "",
  entityType: params.get("entityType") || "",
  entityId: params.get("entityId") || "",
  portal: params.get("portal") || "",
};

const el = {
  title: document.getElementById("title"),
  hint: document.getElementById("hint"),
  audio: document.getElementById("audio"),
  meta: document.getElementById("meta"),
  tools: document.getElementById("tools"),
  lines: document.getElementById("lines"),
  error: document.getElementById("error"),
  errorText: document.getElementById("error-text"),
  progress: document.getElementById("progress"),
  barFill: document.getElementById("bar-fill"),
  progressText: document.getElementById("progress-text"),
  saved: document.getElementById("saved"),
};

const metaFields = ["date", "city", "src", "dir", "res", "note"];
let rows = [];
let storeKey = "call:" + (src.match(/fileId=(\d+)/) || [, "unknown"])[1];

document.getElementById("open-options").onclick = () => chrome.runtime.openOptionsPage();
document.getElementById("swap").onclick = () => {
  rows.forEach((r) => (r.role = r.role === "О" ? "К" : r.role === "К" ? "О" : r.role));
  render();
  save();
};
document.getElementById("copy").onclick = async () => {
  await navigator.clipboard.writeText(asText());
  flash("скопировано");
};
document.getElementById("save").onclick = () => {
  const blob = new Blob([asText()], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (info.entityId ? "lead-" + info.entityId : "call") + ".txt";
  a.click();
};
// Выгрузка пар «услышано — сказано»: расшифровка нужна людям, а это —
// материал для настройки распознавания, и смешивать их в одном файле незачем.
document.getElementById("pairs").onclick = () => {
  const pairs = rows
    .filter((r) => (r.real || "").trim() && r.real.trim() !== (r.text || "").trim())
    .map((r) => ({ at: r.start, role: r.role || "?", heard: r.text.trim(), said: r.real.trim() }));
  if (!pairs.length) {
    flash("нечего выгружать: правок по услышанному нет");
    return;
  }
  const blob = new Blob([JSON.stringify({ call: storeKey, pairs }, null, 1)], {
    type: "application/json;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (info.entityId ? "lead-" + info.entityId : "call") + "-stt.json";
  a.click();
};

metaFields.forEach((k) => (document.getElementById("m-" + k).oninput = save));

start();

async function start() {
  el.title.textContent = titleFor();
  fillMetaFromCard();

  if (!src) return fail("Страница открыта без ссылки на запись. Нажмите «Расшифровать» в карточке звонка.");

  const settings = await chrome.storage.local.get(["apiKey", "folderId", "lang"]);

  try {
    step("Скачиваю запись с портала…", 0.05);
    const bytes = await download(src);
    el.audio.src = URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
    el.audio.hidden = false;

    const kept = await chrome.storage.local.get(storeKey);
    if (kept[storeKey] && kept[storeKey].rows && kept[storeKey].rows.length) {
      rows = kept[storeKey].rows;
      restoreMeta(kept[storeKey].meta);
      done("Черновик из прошлого раза. Распознавать заново не нужно.");
      return;
    }

    step("Раскладываю запись на реплики…", 0.15);
    const audio = await decodeToMono(bytes);
    const segments = speechSegments(audio.samples, audio.rate);
    if (!segments.length) return fail("В записи не нашлось речи — возможно, это гудки или тишина.");

    await transcribe(audio, segments, settings);
    done(
      "Роли расставлены через одного — это догадка, проверьте каждую строку. " +
        "Запись моно, поэтому голоса машиной не разделяются."
    );
    save();
  } catch (e) {
    fail(e instanceof SpeechError ? e.message : "Не получилось: " + e.message);
  }
}

async function download(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Портал не отдал запись: похоже, нет прав на прослушивание записей разговоров.");
    }
    throw new Error("Портал ответил кодом " + response.status + " на запрос записи.");
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength < 2048) throw new Error("Запись пустая — в карточке нет файла разговора.");
  return bytes;
}

async function transcribe(audio, segments, settings) {
  rows = segments.map((s) => ({ start: s.startMs, role: "", text: "" }));
  let ready = 0;

  const queue = segments.map((s, i) => ({ s, i }));
  const workers = Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    for (;;) {
      const job = queue.shift();
      if (!job) return;
      const lpcm = toLPCM(audio.samples, job.s.startMs, job.s.endMs, audio.rate);
      rows[job.i].text = await recognize(lpcm, {
        apiKey: settings.apiKey,
        folderId: settings.folderId,
        lang: settings.lang || "ru-RU",
        rate: TARGET_RATE,
      });
      ready++;
      step(`Распознано ${ready} из ${segments.length} реплик…`, 0.15 + (0.85 * ready) / segments.length);
    }
  });
  await Promise.all(workers);

  rows = rows.filter((r) => r.text);
  rows.forEach((r, i) => (r.role = i % 2 === 0 ? "К" : "О"));
}

function render() {
  el.lines.textContent = "";
  rows.forEach((r, i) => {
    const line = document.createElement("div");
    line.className = "line";
    line.dataset.i = String(i);

    const time = document.createElement("div");
    time.className = "time";
    time.textContent = mmss(r.start);
    time.title = "Играть с этого места";
    time.onclick = () => {
      el.audio.currentTime = r.start / 1000;
      el.audio.play();
    };

    const role = document.createElement("button");
    role.className = "role " + (r.role === "О" ? "op" : r.role === "К" ? "cl" : "");
    role.textContent = r.role || "?";
    role.title = "Кто говорит: оператор или клиент";
    role.onclick = () => {
      r.role = r.role === "О" ? "К" : r.role === "К" ? "?" : "О";
      render();
      save();
    };

    const body = document.createElement("div");
    body.className = "body";

    const text = document.createElement("div");
    text.className = "text";
    text.contentEditable = "true";
    text.textContent = r.text;
    text.title = "Как услышало распознавание";
    text.oninput = () => {
      r.text = text.textContent;
      save();
    };
    text.onfocus = () => mark(i);
    body.append(text);

    // Второе поле у реплик клиента: слева остаётся то, что услышало
    // распознавание, справа человек пишет, что было сказано на самом деле.
    // Пара «услышано — сказано» нужна не расшифровке, а нам: по ней видно,
    // на каких словах распознавание врёт, и её можно скормить настройке STT.
    if (r.role === "К") {
      const real = document.createElement("div");
      real.className = "real" + (r.real ? " filled" : "");
      real.contentEditable = "true";
      real.dataset.placeholder = "как сказал на самом деле";
      real.textContent = r.real || "";
      real.title = "Как человек сказал на самом деле";
      real.oninput = () => {
        r.real = real.textContent.trim();
        real.classList.toggle("filled", Boolean(r.real));
        save();
      };
      real.onfocus = () => mark(i);
      body.append(real);
    }

    const act = document.createElement("div");
    act.className = "act";
    const up = document.createElement("button");
    up.textContent = "склеить вверх";
    up.title = "Присоединить к предыдущей реплике";
    up.onclick = () => {
      if (i === 0) return;
      rows[i - 1].text = (rows[i - 1].text + " " + r.text).trim();
      if (r.real) rows[i - 1].real = ((rows[i - 1].real || "") + " " + r.real).trim();
      rows.splice(i, 1);
      render();
      save();
    };
    const add = document.createElement("button");
    add.textContent = "+ реплика";
    add.title = "Добавить реплику после этой: распознавание пропускает тихие и короткие";
    add.onclick = () => insertAfter(i);
    const del = document.createElement("button");
    del.textContent = "убрать";
    del.onclick = () => {
      rows.splice(i, 1);
      render();
      save();
    };
    act.append(up, add, del);

    line.append(time, role, body, act);
    el.lines.append(line);
  });

  // Кнопка в конце: распознавание часто теряет последние слова — прощание,
  // «до свидания» вдогонку, — и дописать их иначе некуда.
  const tail = document.createElement("button");
  tail.className = "add-tail";
  tail.textContent = "+ реплика в конец";
  tail.onclick = () => insertAfter(rows.length - 1);
  el.lines.append(tail);
}

// insertAfter — новая пустая реплика после указанной.
//
// Роль ставится противоположная соседней, время берётся от неё же: строки
// держатся временем, и без него новая уехала бы в начало разговора.
function insertAfter(index) {
  const near = rows[index];
  const role = near ? (near.role === "К" ? "О" : "К") : "К";
  const start = near ? near.start : 0;
  rows.splice(index + 1, 0, { start, role, text: "", real: "" });
  render();
  save();
  const line = el.lines.querySelector(`.line[data-i="${index + 1}"] .text`);
  if (line) line.focus();
}

el.audio.ontimeupdate = () => {
  const ms = el.audio.currentTime * 1000;
  let cur = -1;
  rows.forEach((r, i) => {
    if (r.start <= ms) cur = i;
  });
  mark(cur);
};

function mark(i) {
  el.lines.querySelectorAll(".line").forEach((l) => l.classList.toggle("now", Number(l.dataset.i) === i));
}

function asText() {
  const v = (k) => document.getElementById("m-" + k).value.trim();
  const head = [
    "Дата, время: " + v("date"),
    "Город: " + v("city"),
    "Источник: " + v("src"),
    "Направление: " + v("dir"),
    "Длительность: " + mmss((el.audio.duration || 0) * 1000),
    "Итог: " + v("res"),
    "",
  ].join("\n");
  const body = rows
    .map((r) => {
      const said = (r.real || "").trim();
      const heard = (r.text || "").trim();
      if (said && said !== heard) return `${r.role || "?"}: ${said}\n   [распознано: ${heard}]`;
      return `${r.role || "?"}: ${heard}`;
    })
    .join("\n");
  return head + body + "\n\nЧем интересен: " + v("note") + "\n";
}

function save() {
  const meta = {};
  metaFields.forEach((k) => (meta[k] = document.getElementById("m-" + k).value));
  chrome.storage.local.set({ [storeKey]: { rows, meta, savedAt: Date.now() } });
  flash("черновик сохранён");
}

function restoreMeta(meta) {
  if (!meta) return;
  metaFields.forEach((k) => {
    if (meta[k]) document.getElementById("m-" + k).value = meta[k];
  });
}

function fillMetaFromCard() {
  if (info.when) document.getElementById("m-date").value = info.when;
  if (info.direction) document.getElementById("m-dir").value = info.direction;
}

function titleFor() {
  const parts = [];
  if (info.direction) parts.push(info.direction[0].toUpperCase() + info.direction.slice(1) + " звонок");
  else parts.push("Звонок");
  if (info.phone) parts.push(info.phone);
  if (info.entityId) parts.push("лид " + info.entityId);
  return parts.join(", ");
}

function step(text, ratio) {
  el.progress.hidden = false;
  el.progressText.textContent = text;
  el.barFill.style.width = Math.round(ratio * 100) + "%";
}

function done(hint) {
  el.progress.hidden = true;
  el.hint.textContent = hint;
  el.meta.hidden = false;
  el.tools.hidden = false;
  render();
}

function fail(message) {
  el.progress.hidden = true;
  el.hint.textContent = "";
  el.error.hidden = false;
  el.errorText.textContent = message;
}

function flash(text) {
  el.saved.textContent = text;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => (el.saved.textContent = ""), 2000);
}

function mmss(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
}
