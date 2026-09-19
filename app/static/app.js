const app = document.getElementById("app");
const toastEl = document.getElementById("toast");

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

function option(value, label) {
  return el("option", { value, text: label });
}

function field(labelText, input) {
  return el("label", { class: "field" }, [
    el("span", { class: "field-label", text: labelText }),
    input,
  ]);
}

function backButton(label, onClick) {
  const btn = el("button", { class: "back", text: label });
  btn.addEventListener("click", onClick);
  return btn;
}

function notify(message, kind = "ok") {
  toastEl.textContent = message;
  toastEl.className = `toast ${kind}`;
  clearTimeout(notify._timer);
  notify._timer = setTimeout(() => {
    toastEl.className = "toast hidden";
  }, 3200);
}

function showFormError(node, message) {
  node.textContent = message;
  node.className = "error";
}

async function readError(res) {
  try {
    const data = await res.json();
    if (data && data.detail) {
      return typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
    }
  } catch (_) {
    /* ignore */
  }
  return `${res.status} ${res.statusText}`;
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

async function apiSend(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.status === 204 ? null : res.json();
}

async function apiUpload(path, formData) {
  const res = await fetch(path, { method: "POST", body: formData });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

function renderError(err) {
  app.replaceChildren(
    el("p", { class: "error", text: `Failed to load: ${err.message}` })
  );
}

/* ---------------------------------------------------------------- Lists -- */

async function renderLists() {
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let lists;
  try {
    lists = await api("/api/lists");
  } catch (err) {
    renderError(err);
    return;
  }

  const newBtn = el("button", { class: "btn primary", text: "+ New list" });
  newBtn.addEventListener("click", renderNewList);

  const toolbar = el("div", { class: "toolbar" }, [
    el("div", { class: "section-title", text: "Vocabulary lists" }),
    newBtn,
  ]);

  if (lists.length === 0) {
    app.replaceChildren(
      toolbar,
      el("p", { class: "muted", text: "No lists yet. Create one or run: python -m app.seed" })
    );
    return;
  }

  const grid = el("div", { class: "grid" });
  for (const list of lists) {
    const card = el("div", { class: "card" }, [
      el("h3", { text: list.name }),
      el("div", { class: "meta" }, [
        el("span", { class: "pill", text: `${list.word_count} words` }),
        el("span", { class: "pill", text: `${list.deck_count} decks` }),
        el("span", { class: "pill", text: `deck size ${list.deck_size}` }),
      ]),
    ]);
    card.addEventListener("click", () => renderListDetail(list.id));
    grid.append(card);
  }

  app.replaceChildren(toolbar, grid);
}

/* ------------------------------------------------------------ New list -- */

function renderNewList() {
  const name = el("input", { type: "text", class: "input", placeholder: "e.g. French basics" });
  const deckSize = el("input", { type: "number", class: "input narrow", min: "1", value: "20" });
  const file = el("input", { type: "file", class: "input", accept: ".csv,text/csv,text/plain" });
  const headerSel = el("select", { class: "input" }, [
    option("auto", "Auto-detect"),
    option("true", "Has header row"),
    option("false", "No header row"),
  ]);

  const submit = el("button", { class: "btn primary", text: "Create list" });
  const cancel = el("button", { class: "btn", text: "Cancel" });
  const error = el("p", { class: "error hidden" });

  const form = el("form", { class: "form" }, [
    field("List name", name),
    field("Deck size (words per deck)", deckSize),
    field("CSV file (term, definition)", file),
    field("CSV header", headerSel),
    el("div", { class: "actions" }, [submit, cancel]),
    error,
  ]);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.className = "error hidden";
    if (!name.value.trim()) return showFormError(error, "Please enter a list name.");
    if (!file.files.length) return showFormError(error, "Please choose a CSV file.");

    const form_data = new FormData();
    form_data.append("name", name.value.trim());
    form_data.append("deck_size", deckSize.value || "20");
    form_data.append("has_header", headerSel.value);
    form_data.append("file", file.files[0]);

    submit.disabled = true;
    try {
      const result = await apiUpload("/api/lists/import", form_data);
      notify(`Imported ${result.imported} words into "${result.list.name}"`);
      renderLists();
    } catch (err) {
      showFormError(error, err.message);
    } finally {
      submit.disabled = false;
    }
  });

  cancel.addEventListener("click", renderLists);

  app.replaceChildren(
    backButton("← All lists", renderLists),
    el("h2", { text: "New vocabulary list" }),
    el("p", { class: "muted", text: "Upload a CSV with two columns: term and definition." }),
    form
  );
}

/* --------------------------------------------------------- List detail -- */

async function renderListDetail(listId) {
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let list;
  try {
    list = await api(`/api/lists/${listId}`);
  } catch (err) {
    renderError(err);
    return;
  }

  const nameInput = el("input", { type: "text", class: "input", value: list.name });
  const renameBtn = el("button", { class: "btn", text: "Rename" });
  renameBtn.addEventListener("click", async () => {
    const value = nameInput.value.trim();
    if (!value) return notify("Name cannot be empty", "error");
    try {
      await apiSend("PATCH", `/api/lists/${listId}`, { name: value });
      notify("Renamed");
      renderListDetail(listId);
    } catch (err) {
      notify(err.message, "error");
    }
  });

  const deckInput = el("input", {
    type: "number",
    class: "input narrow",
    min: "1",
    value: String(list.deck_size),
  });
  const deckBtn = el("button", { class: "btn", text: "Apply & re-deck" });
  deckBtn.addEventListener("click", async () => {
    const size = parseInt(deckInput.value, 10);
    if (!size || size < 1) return notify("Deck size must be at least 1", "error");
    try {
      await apiSend("PATCH", `/api/lists/${listId}`, { deck_size: size });
      notify("Decks recalculated");
      renderListDetail(listId);
    } catch (err) {
      notify(err.message, "error");
    }
  });

  const addFile = el("input", { type: "file", class: "input", accept: ".csv,text/csv,text/plain" });
  const addHeader = el("select", { class: "input" }, [
    option("auto", "Auto-detect"),
    option("true", "Has header row"),
    option("false", "No header row"),
  ]);
  const addBtn = el("button", { class: "btn", text: "Import CSV" });
  addBtn.addEventListener("click", async () => {
    if (!addFile.files.length) return notify("Choose a CSV file first", "error");
    const form_data = new FormData();
    form_data.append("has_header", addHeader.value);
    form_data.append("file", addFile.files[0]);
    try {
      const result = await apiUpload(`/api/lists/${listId}/import`, form_data);
      notify(`Imported ${result.imported} words`);
      renderListDetail(listId);
    } catch (err) {
      notify(err.message, "error");
    }
  });

  const deleteBtn = el("button", { class: "btn danger", text: "Delete list" });
  deleteBtn.addEventListener("click", async () => {
    if (!confirm(`Delete "${list.name}" and all its words?`)) return;
    try {
      await apiSend("DELETE", `/api/lists/${listId}`);
      notify("List deleted");
      renderLists();
    } catch (err) {
      notify(err.message, "error");
    }
  });

  const manage = el("div", { class: "panel" }, [
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Name" }),
      nameInput,
      renameBtn,
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Deck size" }),
      deckInput,
      deckBtn,
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Append words" }),
      addFile,
      addHeader,
      addBtn,
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Danger zone" }),
      deleteBtn,
    ]),
  ]);

  const decks = el("div", {});
  for (const deck of list.decks) {
    decks.append(
      el("div", { class: "deck-row" }, [
        el("span", { text: `Deck ${deck.index}` }),
        el("span", { class: "muted", text: `${deck.word_count} words` }),
      ])
    );
  }

  const rows = list.words.map((word) =>
    el("tr", {}, [
      el("td", { class: "deck", text: `${word.deck_index}` }),
      el("td", { text: word.term }),
      el("td", { text: word.definition }),
    ])
  );

  const table = el("table", { class: "words" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "Deck" }),
        el("th", { text: "Term" }),
        el("th", { text: "Definition" }),
      ]),
    ]),
    el("tbody", {}, rows),
  ]);

  app.replaceChildren(
    backButton("← All lists", renderLists),
    el("h2", { text: list.name }),
    el("div", { class: "meta" }, [
      el("span", { class: "pill", text: `${list.word_count} words` }),
      el("span", { class: "pill", text: `${list.deck_count} decks` }),
      el("span", { class: "pill", text: `deck size ${list.deck_size}` }),
    ]),
    el("div", { class: "section-title", text: "Manage" }),
    manage,
    el("div", { class: "section-title", text: "Decks" }),
    decks,
    el("div", { class: "section-title", text: "Words" }),
    table
  );
}

renderLists();
