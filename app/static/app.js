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
    const studyBtn = el("button", { class: "btn", text: "Study" });
    studyBtn.addEventListener("click", () => renderStudy(listId, [deck.index]));
    decks.append(
      el("div", { class: "deck-row" }, [
        el("span", { text: `Deck ${deck.index}` }),
        el("span", { class: "deck-actions" }, [
          el("span", { class: "muted", text: `${deck.word_count} words` }),
          studyBtn,
        ]),
      ])
    );
  }

  const studyAllBtn = el("button", { class: "btn primary", text: "Study all" });
  studyAllBtn.addEventListener("click", () => renderStudy(listId, null));

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
    el("div", { class: "toolbar" }, [
      el("div", { class: "section-title", text: "Decks" }),
      studyAllBtn,
    ]),
    decks,
    el("div", { class: "section-title", text: "Words" }),
    table
  );
}

/* ------------------------------------------------------------ Study -- */

async function renderStudy(listId, deckList) {
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));

  const query = deckList && deckList.length ? `?decks=${deckList.join(",")}` : "";
  let data;
  try {
    data = await api(`/api/lists/${listId}/cards${query}`);
  } catch (err) {
    renderError(err);
    return;
  }

  if (data.count === 0) {
    app.replaceChildren(
      backButton("← Back to list", () => renderListDetail(listId)),
      el("p", { class: "muted", text: "This selection has no words." })
    );
    return;
  }

  const deckLabel =
    deckList && deckList.length
      ? deckList.length === 1
        ? `Deck ${deckList[0]}`
        : `Decks ${deckList.join(", ")}`
      : "All decks";

  const state = {
    cards: data.cards,
    order: data.cards.map((_, index) => index),
    pos: 0,
    flipped: false,
  };

  const termEl = el("div", { class: "card-text" });
  const defEl = el("div", { class: "card-text" });
  const front = el("div", { class: "card-face front" }, [
    el("span", { class: "face-label", text: "term" }),
    termEl,
  ]);
  const back = el("div", { class: "card-face back" }, [
    el("span", { class: "face-label", text: "definition" }),
    defEl,
  ]);
  const flashcard = el("div", { class: "flashcard", role: "button", tabindex: "0" }, [
    el("div", { class: "flashcard-inner" }, [front, back]),
  ]);

  const counter = el("span", { class: "counter" });
  const deckTag = el("span", { text: deckLabel });

  const prevBtn = el("button", { class: "btn", text: "← Prev" });
  const flipBtn = el("button", { class: "btn", text: "Flip" });
  const nextBtn = el("button", { class: "btn", text: "Next →" });
  const shuffleBtn = el("button", { class: "btn", text: "Shuffle" });

  function currentCard() {
    return state.cards[state.order[state.pos]];
  }

  function update() {
    const card = currentCard();
    termEl.textContent = card.term;
    defEl.textContent = card.definition;
    counter.textContent = `${state.pos + 1} / ${state.order.length}`;
    flashcard.classList.toggle("flipped", state.flipped);
    prevBtn.disabled = state.pos === 0;
    nextBtn.disabled = state.pos === state.order.length - 1;
  }

  function flip() {
    state.flipped = !state.flipped;
    update();
  }

  function go(delta) {
    const target = state.pos + delta;
    if (target < 0 || target >= state.order.length) return;
    state.pos = target;
    state.flipped = false;
    update();
  }

  function shuffle() {
    const order = state.order;
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    state.pos = 0;
    state.flipped = false;
    update();
  }

  flashcard.addEventListener("click", flip);
  flashcard.addEventListener("keydown", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      flip();
    }
  });
  prevBtn.addEventListener("click", () => go(-1));
  nextBtn.addEventListener("click", () => go(1));
  flipBtn.addEventListener("click", flip);
  shuffleBtn.addEventListener("click", shuffle);

  function onKey(event) {
    if (!flashcard.isConnected) {
      document.removeEventListener("keydown", onKey);
      return;
    }
    if (event.key === "ArrowLeft") go(-1);
    else if (event.key === "ArrowRight") go(1);
    else if (event.key === " ") {
      event.preventDefault();
      flip();
    }
  }
  document.addEventListener("keydown", onKey);

  update();

  app.replaceChildren(
    backButton("← Back to list", () => renderListDetail(listId)),
    el("h2", { text: data.name }),
    el("div", { class: "study-meta" }, [deckTag, counter]),
    flashcard,
    el("div", { class: "study-controls" }, [prevBtn, flipBtn, nextBtn, shuffleBtn]),
    el("p", {
      class: "muted hint",
      text: "Click the card or press Space to flip · ← / → to navigate",
    })
  );
}

renderLists();
