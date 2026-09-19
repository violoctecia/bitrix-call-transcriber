const fields = ["apiKey", "folderId", "lang"];
const saved = document.getElementById("saved");

chrome.storage.local.get(fields).then((values) => {
  for (const key of fields) {
    if (values[key]) document.getElementById(key).value = values[key];
  }
  if (!values.lang) document.getElementById("lang").value = "ru-RU";
});

document.getElementById("save").onclick = async () => {
  const values = {};
  for (const key of fields) values[key] = document.getElementById(key).value.trim();
  if (!values.apiKey || !values.folderId) {
    flash("Нужны и ключ, и идентификатор каталога — без них распознавание не заработает.");
    return;
  }
  await chrome.storage.local.set(values);
  flash("Сохранено.");
};

document.getElementById("clear").onclick = async () => {
  await chrome.storage.local.remove(fields);
  for (const key of fields) document.getElementById(key).value = "";
  flash("Ключ стёрт.");
};

function flash(text) {
  saved.textContent = text;
  setTimeout(() => (saved.textContent = ""), 4000);
}
