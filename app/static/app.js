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

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
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
  setActiveNav("lists");
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
  const shuffle = checkboxRow("true", "Shuffle words into decks (recommended)", true);

  const form = el("form", { class: "form" }, [
    field("List name", name),
    field("Deck size (words per deck)", deckSize),
    field("CSV file (term, definition)", file),
    field("CSV header", headerSel),
    el("div", { class: "field" }, [shuffle.node]),
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
    form_data.append("shuffle", shuffle.cb.checked ? "true" : "false");
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
  const deckShuffle = checkboxRow("true", "shuffle", true);
  const deckBtn = el("button", { class: "btn", text: "Apply & re-deck" });
  deckBtn.addEventListener("click", async () => {
    const size = parseInt(deckInput.value, 10);
    if (!size || size < 1) return notify("Deck size must be at least 1", "error");
    try {
      await apiSend("PATCH", `/api/lists/${listId}`, {
        deck_size: size,
        shuffle: deckShuffle.cb.checked,
      });
      notify("Decks recalculated");
      renderListDetail(listId);
    } catch (err) {
      notify(err.message, "error");
    }
  });

  const shuffleBtn = el("button", { class: "btn", text: "Shuffle decks" });
  shuffleBtn.addEventListener("click", async () => {
    try {
      await apiSend("POST", `/api/lists/${listId}/shuffle`);
      notify("Decks shuffled");
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
  const addShuffle = checkboxRow("true", "shuffle", true);
  const addBtn = el("button", { class: "btn", text: "Import CSV" });
  addBtn.addEventListener("click", async () => {
    if (!addFile.files.length) return notify("Choose a CSV file first", "error");
    const form_data = new FormData();
    form_data.append("has_header", addHeader.value);
    form_data.append("shuffle", addShuffle.cb.checked ? "true" : "false");
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
      deckShuffle.node,
      deckBtn,
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Deck order" }),
      shuffleBtn,
      el("span", { class: "muted", text: "Randomly spread words across decks." }),
    ]),
    el("div", { class: "row" }, [
      el("span", { class: "row-label", text: "Append words" }),
      addFile,
      addHeader,
      addShuffle.node,
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
  studyAllBtn.addEventListener("click", () => renderStudySetup(listId));

  const testBtn = el("button", { class: "btn primary", text: "Test" });
  testBtn.addEventListener("click", () => renderTestSetup(listId));

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
      el("div", { class: "toolbar-actions" }, [studyAllBtn, testBtn]),
    ]),
    decks,
    el("div", { class: "section-title", text: "Words" }),
    table
  );
}

/* ------------------------------------------------------------ Study -- */

function renderListPicker(navKey, title, subtitle, onPick) {
  setActiveNav(navKey);
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  api("/api/lists")
    .then((lists) => {
      const header = [
        el("h2", { text: title }),
        el("p", { class: "muted", text: subtitle }),
      ];
      if (!lists.length) {
        app.replaceChildren(...header, el("p", { class: "muted", text: "No lists yet." }));
        return;
      }
      const grid = el("div", { class: "grid" });
      for (const list of lists) {
        const card = el("div", { class: "card" }, [
          el("h3", { text: list.name }),
          el("div", { class: "meta" }, [
            el("span", { class: "pill", text: `${list.word_count} words` }),
            el("span", { class: "pill", text: `${list.deck_count} decks` }),
          ]),
        ]);
        card.addEventListener("click", () => onPick(list.id));
        grid.append(card);
      }
      app.replaceChildren(...header, grid);
    })
    .catch(renderError);
}

function renderStudyHome() {
  renderListPicker("study", "Study", "Choose a list to study", renderStudySetup);
}

async function renderStudySetup(listId) {
  setActiveNav("study");
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let list;
  try {
    list = await api(`/api/lists/${listId}`);
  } catch (err) {
    renderError(err);
    return;
  }

  if (list.word_count === 0) {
    app.replaceChildren(
      backButton("← Study", renderStudyHome),
      el("p", { class: "muted", text: "This list has no words to study." })
    );
    return;
  }

  const boxes = list.decks.map((deck) => ({
    index: deck.index,
    ...checkboxRow(String(deck.index), `Deck ${deck.index} (${deck.word_count} words)`),
  }));

  const error = el("p", { class: "error hidden" });
  const startBtn = el("button", { class: "btn primary", text: "Start studying" });
  startBtn.addEventListener("click", () => {
    error.className = "error hidden";
    const selected = boxes.filter((box) => box.cb.checked).map((box) => box.index);
    if (!selected.length) return showFormError(error, "Select at least one deck.");
    const decks = selected.length === list.decks.length ? null : selected;
    renderStudy(listId, decks);
  });

  app.replaceChildren(
    backButton("← Study", renderStudyHome),
    el("h2", { text: list.name }),
    el("div", { class: "panel" }, [
      el("div", { class: "section-title", text: "Decks" }),
      el("div", { class: "checks" }, boxes.map((box) => box.node)),
    ]),
    el("div", { class: "actions" }, [startBtn]),
    error
  );
}

async function renderStudy(listId, deckList) {
  setActiveNav("study");
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
      backButton("← Decks", () => renderStudySetup(listId)),
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
    backButton("← Decks", () => renderStudySetup(listId)),
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

/* -------------------------------------------------------------- Test -- */

const QUESTION_TYPE_DEFS = [
  ["word_to_def", "Word → correct definition"],
  ["def_to_word", "Definition → correct word"],
  ["pair_correct", "Pick the correct word–definition pair"],
  ["pair_incorrect", "Spot the incorrect word–definition pair"],
];

const QUESTION_TYPE_LABELS = Object.fromEntries(QUESTION_TYPE_DEFS);

function checkboxRow(value, labelText, checked = true) {
  const cb = el("input", { type: "checkbox", value });
  cb.checked = checked;
  return {
    cb,
    node: el("label", { class: "check" }, [cb, el("span", { text: labelText })]),
  };
}

function renderTestHome() {
  renderListPicker("test", "Test", "Choose a list to test", renderTestSetup);
}

async function renderTestSetup(listId) {
  setActiveNav("test");
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let list;
  try {
    list = await api(`/api/lists/${listId}`);
  } catch (err) {
    renderError(err);
    return;
  }

  if (list.word_count < 2) {
    app.replaceChildren(
      backButton("← Test", renderTestHome),
      el("p", { class: "muted", text: "Add at least 2 words before creating a test." })
    );
    return;
  }

  const deckBoxes = list.decks.map((deck) => ({
    index: deck.index,
    ...checkboxRow(String(deck.index), `Deck ${deck.index} (${deck.word_count} words)`),
  }));
  const typeBoxes = QUESTION_TYPE_DEFS.map(([value, label]) => checkboxRow(value, label));

  const countInput = el("input", {
    type: "number",
    class: "input narrow",
    min: "1",
    value: String(Math.min(list.word_count, 20)),
  });

  const error = el("p", { class: "error hidden" });
  const startBtn = el("button", { class: "btn primary", text: "Start test" });
  const cancelBtn = el("button", { class: "btn", text: "Cancel" });
  cancelBtn.addEventListener("click", renderTestHome);

  startBtn.addEventListener("click", async () => {
    error.className = "error hidden";
    const decks = deckBoxes.filter((box) => box.cb.checked).map((box) => box.index);
    const types = typeBoxes.filter((box) => box.cb.checked).map((box) => box.cb.value);
    if (!decks.length) return showFormError(error, "Select at least one deck.");
    if (!types.length) return showFormError(error, "Select at least one question type.");
    const count = parseInt(countInput.value, 10) || undefined;

    startBtn.disabled = true;
    try {
      const test = await apiSend("POST", "/api/tests/generate", {
        list_id: listId,
        decks,
        question_types: types,
        count,
      });
      renderTestRun(test, listId);
    } catch (err) {
      showFormError(error, err.message);
      startBtn.disabled = false;
    }
  });

  app.replaceChildren(
    backButton("← Test", renderTestHome),
    el("h2", { text: `Test: ${list.name}` }),
    el("div", { class: "panel" }, [
      el("div", { class: "section-title", text: "Decks" }),
      el("div", { class: "checks" }, deckBoxes.map((box) => box.node)),
      el("div", { class: "section-title", text: "Question types" }),
      el("div", { class: "checks" }, typeBoxes.map((box) => box.node)),
      el("div", { class: "section-title", text: "Number of questions" }),
      countInput,
    ]),
    el("div", { class: "actions" }, [startBtn, cancelBtn]),
    error
  );
}

function renderTestRun(test, listId) {
  setActiveNav("test");
  const state = { index: 0, correct: 0, review: [] };

  const progress = el("span", { class: "counter" });
  const typeTag = el("span", { text: "" });
  const promptEl = el("div", { class: "test-prompt" });
  const optionsEl = el("div", { class: "options" });
  const feedback = el("div", { class: "feedback hidden" });
  const nextBtn = el("button", { class: "btn primary", text: "Next question" });
  const quitBtn = backButton("← Quit test", () => renderTestSetup(listId));

  function renderQuestion() {
    const question = test.questions[state.index];
    progress.textContent = `Question ${state.index + 1} / ${test.questions.length}`;
    typeTag.textContent = QUESTION_TYPE_LABELS[question.question_type] || question.question_type;
    promptEl.textContent = question.prompt;
    feedback.className = "feedback hidden";
    feedback.textContent = "";
    nextBtn.disabled = true;
    nextBtn.textContent =
      state.index === test.questions.length - 1 ? "Finish & see results" : "Next question";

    optionsEl.replaceChildren(
      ...question.options.map((option) => {
        const btn = el("button", { class: "option", text: option.text });
        btn.dataset.optionId = option.id;
        btn.addEventListener("click", () => choose(option));
        return btn;
      })
    );
  }

  function choose(option) {
    const question = test.questions[state.index];
    const isCorrect = option.id === question.correct_option_id;
    for (const btn of optionsEl.children) {
      btn.disabled = true;
      if (btn.dataset.optionId === question.correct_option_id) btn.classList.add("correct");
    }
    if (!isCorrect) {
      for (const btn of optionsEl.children) {
        if (btn.dataset.optionId === option.id) btn.classList.add("wrong");
      }
    }
    if (isCorrect) state.correct += 1;
    state.review.push({
      question_type: question.question_type,
      prompt: question.prompt,
      chosen_text: option.text,
      correct_text: question.options.find((o) => o.id === question.correct_option_id).text,
      is_correct: isCorrect,
    });
    feedback.textContent = isCorrect ? "Correct!" : "Incorrect";
    feedback.className = `feedback ${isCorrect ? "ok" : "bad"}`;
    nextBtn.disabled = false;
    nextBtn.focus();
  }

  nextBtn.addEventListener("click", async () => {
    if (state.index < test.questions.length - 1) {
      state.index += 1;
      renderQuestion();
      return;
    }
    nextBtn.disabled = true;
    try {
      const result = await apiSend("POST", "/api/tests/results", {
        list_id: test.list_id,
        decks: test.decks,
        question_types: test.question_types,
        total: test.questions.length,
        correct: state.correct,
      });
      renderTestResults(result, state.review, listId);
    } catch (err) {
      notify(err.message, "error");
      nextBtn.disabled = false;
    }
  });

  renderQuestion();

  app.replaceChildren(
    quitBtn,
    el("div", { class: "study-meta" }, [typeTag, progress]),
    promptEl,
    optionsEl,
    el("div", { class: "test-footer" }, [nextBtn]),
    feedback
  );
}

function renderTestResults(result, review, listId) {
  const pct = Math.round(result.score * 100);

  const summary = el("div", { class: "panel result-summary" }, [
    el("div", { class: "score", text: `${pct}%` }),
    el("div", { class: "muted", text: `${result.correct} / ${result.total} correct` }),
    el("div", { class: "muted", text: "Score saved." }),
  ]);

  const items = review.map((answer) =>
    el("div", { class: `review ${answer.is_correct ? "ok" : "bad"}` }, [
      el("div", { class: "review-head" }, [
        el("span", { class: "badge", text: answer.is_correct ? "✓" : "✗" }),
        el("span", { text: answer.prompt }),
      ]),
      el("div", {
        class: "review-line muted",
        text: `Your answer: ${answer.chosen_text ?? "—"}`,
      }),
      ...(answer.is_correct
        ? []
        : [
            el("div", {
              class: "review-line",
              text: `Correct: ${answer.correct_text ?? "—"}`,
            }),
          ]),
    ])
  );

  const retakeBtn = el("button", { class: "btn primary", text: "New test" });
  retakeBtn.addEventListener("click", () => renderTestSetup(listId));
  const studyBtn = el("button", { class: "btn", text: "Study this list" });
  studyBtn.addEventListener("click", () => renderStudy(listId, null));

  app.replaceChildren(
    backButton("← Test", renderTestHome),
    el("h2", { text: "Results" }),
    summary,
    el("div", { class: "section-title", text: "Review (not saved)" }),
    ...items,
    el("div", { class: "actions" }, [retakeBtn, studyBtn])
  );
}

/* ---------------------------------------------------------- Progress -- */

function setActiveNav(view) {
  for (const id of ["lists", "study", "test", "play", "progress"]) {
    document.getElementById(`nav-${id}`).classList.toggle("active", view === id);
  }
}

function fmtScore(summary) {
  return summary.tests ? `${Math.round(summary.score * 100)}%` : "—";
}

function metric(value, label) {
  return el("span", { class: "metric" }, [
    el("b", { text: value }),
    el("span", { class: "muted", text: label }),
  ]);
}

function scoreColor(score) {
  const hue = Math.round(120 * Math.max(0, Math.min(1, score)));
  return `hsl(${hue}, 65%, 45%)`;
}

function scoreBar(history) {
  const bar = el("div", { class: "score-bar" });
  const last = history.slice(-5);
  for (let i = last.length; i < 5; i += 1) bar.append(el("span", { class: "seg empty" }));
  for (const point of last) {
    const seg = el("span", { class: "seg" });
    seg.style.background = scoreColor(point.score);
    seg.title = `${Math.round(point.score * 100)}% (${point.correct}/${point.total}) · ${point.created_at}`;
    bar.append(seg);
  }
  return bar;
}

function shortDate(value) {
  return value ? value.slice(5, 16) : "";
}

function lineChart(history) {
  if (!history.length) return el("p", { class: "muted", text: "No tests yet." });

  const W = 660;
  const H = 220;
  const padL = 44;
  const padR = 18;
  const padT = 16;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = history.length;
  const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (score) => padT + (1 - score) * plotH;

  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "line-chart" });

  for (const level of [0, 0.25, 0.5, 0.75, 1]) {
    svg.append(svgEl("line", { x1: padL, y1: y(level), x2: W - padR, y2: y(level), class: "grid" }));
    svg.append(
      svgEl("text", { x: padL - 8, y: y(level) + 4, class: "axis-label", "text-anchor": "end" },
        `${Math.round(level * 100)}%`)
    );
  }

  svg.append(
    svgEl("polyline", {
      points: history.map((point, i) => `${x(i)},${y(point.score)}`).join(" "),
      class: "line",
    })
  );

  history.forEach((point, i) => {
    const dot = svgEl("circle", {
      cx: x(i), cy: y(point.score), r: 5, class: "dot", fill: scoreColor(point.score),
    });
    dot.append(
      svgEl("title", {}, `${Math.round(point.score * 100)}% (${point.correct}/${point.total}) — ${point.created_at}`)
    );
    svg.append(dot);
  });

  svg.append(
    svgEl("text", { x: padL, y: H - 10, class: "axis-label", "text-anchor": "start" },
      shortDate(history[0].created_at))
  );
  if (n > 1) {
    svg.append(
      svgEl("text", { x: W - padR, y: H - 10, class: "axis-label", "text-anchor": "end" },
        shortDate(history[n - 1].created_at))
    );
  }

  return el("div", { class: "chart-wrap" }, [svg]);
}

function swatch(score) {
  const node = el("span", { class: "swatch" });
  node.style.background = scoreColor(score);
  return node;
}

async function renderProgress() {
  setActiveNav("progress");
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let overview;
  let deckData;
  try {
    [overview, deckData] = await Promise.all([
      api("/api/progress"),
      api("/api/progress/decks"),
    ]);
  } catch (err) {
    renderError(err);
    return;
  }

  const overall = overview.overall;
  const summary = el("div", { class: "panel result-summary" }, [
    el("div", { class: "score", text: overall.tests ? `${Math.round(overall.score * 100)}%` : "—" }),
    el("div", {
      class: "muted",
      text: overall.tests
        ? `${overall.correct} / ${overall.total} correct across ${overall.tests} test${overall.tests === 1 ? "" : "s"}`
        : "No tests taken yet.",
    }),
  ]);

  const children = [el("div", { class: "section-title", text: "Overall" }), summary];

  if (!deckData.decks.length) {
    children.push(el("p", { class: "muted", text: "No lists yet." }));
    app.replaceChildren(...children);
    return;
  }

  let currentList = null;
  let listEl = null;
  for (const deck of deckData.decks) {
    if (deck.list_id !== currentList) {
      currentList = deck.list_id;
      children.push(el("div", { class: "section-title", text: deck.list_name }));
      listEl = el("div", { class: "progress-list" });
      children.push(listEl);
    }
    const row = el("div", { class: "progress-row" }, [
      el("div", { class: "progress-main" }, [
        el("div", { class: "progress-name", text: `Deck ${deck.deck_index}` }),
        el("div", { class: "muted", text: `${deck.word_count} words` }),
      ]),
      scoreBar(deck.history),
      el("div", { class: "progress-stats" }, [
        metric(fmtScore(deck), "avg"),
        metric(deck.tests ? String(deck.tests) : "—", "tests"),
        metric(deck.tests ? `${Math.round(deck.best * 100)}%` : "—", "best"),
      ]),
    ]);
    row.addEventListener("click", () => renderDeckProgress(deck));
    listEl.append(row);
  }

  app.replaceChildren(...children);
}

function renderDeckProgress(deck) {
  setActiveNav("progress");

  const summary = el("div", { class: "panel result-summary" }, [
    el("div", { class: "score", text: fmtScore(deck) }),
    el("div", {
      class: "muted",
      text: deck.tests
        ? `${deck.correct} / ${deck.total} correct across ${deck.tests} test${deck.tests === 1 ? "" : "s"}`
        : "No tests yet.",
    }),
  ]);

  const historyNewestFirst = [...deck.history].reverse();
  const rows = historyNewestFirst.map((point) =>
    el("tr", {}, [
      el("td", { text: point.created_at }),
      el("td", { text: `${point.correct} / ${point.total}` }),
      el("td", { text: `${Math.round(point.score * 100)}%` }),
      el("td", {}, [swatch(point.score)]),
    ])
  );

  const table = el("table", { class: "words" }, [
    el("thead", {}, [
      el("tr", {}, [
        el("th", { text: "When" }),
        el("th", { text: "Score" }),
        el("th", { text: "%" }),
        el("th", { text: "" }),
      ]),
    ]),
    el("tbody", {},
      rows.length
        ? rows
        : [el("tr", {}, [el("td", { colspan: "4", class: "muted", text: "No tests yet." })])]
    ),
  ]);

  const studyBtn = el("button", { class: "btn", text: "Study this deck" });
  studyBtn.addEventListener("click", () => renderStudy(deck.list_id, [deck.deck_index]));
  const testBtn = el("button", { class: "btn primary", text: "Test this list" });
  testBtn.addEventListener("click", () => renderTestSetup(deck.list_id));

  app.replaceChildren(
    backButton("← Progress", renderProgress),
    el("h2", { text: `${deck.list_name} · Deck ${deck.deck_index}` }),
    summary,
    el("div", { class: "section-title", text: "Score over time" }),
    lineChart(deck.history),
    el("div", { class: "actions" }, [studyBtn, testBtn]),
    el("div", { class: "section-title", text: "History" }),
    table
  );
}

/* --------------------------------------------------------------- Play -- */

const GAME_FONT = "'Segoe UI', system-ui, sans-serif";
const CANNON_ZONE = 92;
const BULLET_SPEED = 9;
const LEVEL_UP_EVERY = 4;
const MAX_ANGLE = 1.31;

function renderPlayHome() {
  renderListPicker("play", "Play", "Choose a list to play", renderPlaySetup);
}

async function renderPlaySetup(listId) {
  setActiveNav("play");
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));
  let list;
  try {
    list = await api(`/api/lists/${listId}`);
  } catch (err) {
    renderError(err);
    return;
  }

  if (list.word_count < 2) {
    app.replaceChildren(
      backButton("← Play", renderPlayHome),
      el("p", { class: "muted", text: "Add at least 2 words to play." })
    );
    return;
  }

  const boxes = list.decks.map((deck) => ({
    index: deck.index,
    ...checkboxRow(String(deck.index), `Deck ${deck.index} (${deck.word_count} words)`),
  }));

  const error = el("p", { class: "error hidden" });
  const startBtn = el("button", { class: "btn primary", text: "Start game" });
  startBtn.addEventListener("click", () => {
    error.className = "error hidden";
    const selected = boxes.filter((box) => box.cb.checked).map((box) => box.index);
    if (!selected.length) return showFormError(error, "Select at least one deck.");
    const decks = selected.length === list.decks.length ? null : selected;
    renderGame(listId, decks);
  });

  app.replaceChildren(
    backButton("← Play", renderPlayHome),
    el("h2", { text: `Shoot: ${list.name}` }),
    el("p", { class: "muted", text: "Load a word, aim the cannon, and hit its matching definition." }),
    el("div", { class: "panel" }, [
      el("div", { class: "section-title", text: "Decks" }),
      el("div", { class: "checks" }, boxes.map((box) => box.node)),
    ]),
    el("div", { class: "actions" }, [startBtn]),
    error
  );
}

async function renderGame(listId, deckList) {
  setActiveNav("play");
  app.replaceChildren(el("p", { class: "muted", text: "Loading…" }));

  const query = deckList && deckList.length ? `?decks=${deckList.join(",")}` : "";
  let data;
  try {
    data = await api(`/api/lists/${listId}/cards${query}`);
  } catch (err) {
    renderError(err);
    return;
  }
  const cards = data.cards;
  const distinct = new Set(cards.map((card) => card.definition)).size;
  if (cards.length < 2 || distinct < 2) {
    app.replaceChildren(
      backButton("← Decks", () => renderPlaySetup(listId)),
      el("p", { class: "muted", text: "Need at least 2 words with different definitions to play." })
    );
    return;
  }

  const canvas = el("canvas", { class: "game-canvas" });
  const ctx = canvas.getContext("2d");
  const overlay = el("div", { class: "game-overlay" });
  const hudLeft = el("span", { class: "hud-item" });
  const hudWord = el("span", { class: "hud-item hud-word" });
  const hudRight = el("span", { class: "hud-item hud-item-right" });
  const wrap = el("div", { class: "game-wrap" }, [canvas, overlay]);

  app.replaceChildren(
    backButton("← Decks", () => renderPlaySetup(listId)),
    el("div", { class: "game-hud" }, [hudLeft, hudWord, hudRight]),
    wrap,
    el("p", { class: "muted hint", text: "Move the mouse to aim · click or Space to fire · ← / → to adjust" })
  );

  const state = {
    status: "ready",
    level: 1,
    score: 0,
    lives: 3,
    streak: 0,
    correctInLevel: 0,
    angle: 0,
    bubbles: [],
    bullet: null,
    target: null,
    flash: null,
    reveal: null,
  };

  let W = 800;
  let H = 520;
  let raf = 0;
  let last = 0;
  let disposed = false;

  function cannonPos() {
    return { x: W / 2, y: H - 30 };
  }

  function bubbleCount() {
    return state.level >= 3 ? 5 : 4;
  }

  function bubbleSpeed() {
    return Math.min(2.2, 0.35 + state.level * 0.13);
  }

  function bubbleRadius() {
    return Math.max(44, 72 - state.level * 2.4);
  }

  function shuffle(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  }

  function resize() {
    const width = Math.max(320, Math.round(wrap.getBoundingClientRect().width));
    W = width;
    H = Math.min(560, Math.max(360, Math.round(width * 0.62)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const bubble of state.bubbles) {
      bubble.x = Math.max(bubble.r, Math.min(W - bubble.r, bubble.x));
      bubble.y = Math.max(bubble.r, Math.min(H - CANNON_ZONE - bubble.r, bubble.y));
    }
  }

  function updateHud() {
    hudLeft.textContent = `Level ${state.level} · Score ${state.score} · Streak ${state.streak}`;
    hudWord.textContent = state.target ? `Shoot: ${state.target.term}` : "";
    hudRight.textContent = state.lives > 0 ? "♥".repeat(state.lives) : "—";
  }

  function makeRound() {
    const target = cards[Math.floor(Math.random() * cards.length)];
    const options = [target];
    const seen = new Set([target.definition]);
    for (const card of shuffle(cards.slice())) {
      if (options.length >= bubbleCount()) break;
      if (seen.has(card.definition)) continue;
      seen.add(card.definition);
      options.push(card);
    }
    return { target, options: shuffle(options) };
  }

  function spawnBubbles(options) {
    const radius = bubbleRadius();
    const speed = bubbleSpeed();
    const top = radius + 8;
    const bottom = H - CANNON_ZONE - radius - 8;
    const bubbles = [];
    for (const option of options) {
      let x = 0;
      let y = 0;
      let tries = 0;
      do {
        x = radius + 12 + Math.random() * Math.max(1, W - 2 * radius - 24);
        y = top + Math.random() * Math.max(1, bottom - top);
        tries += 1;
      } while (
        tries < 40 &&
        bubbles.some((b) => Math.hypot(b.x - x, b.y - y) < b.r + radius + 6)
      );
      const heading = Math.random() * Math.PI * 2;
      bubbles.push({
        wordId: option.id,
        definition: option.definition,
        r: radius,
        x,
        y,
        vx: Math.cos(heading) * speed,
        vy: Math.sin(heading) * speed,
        phase: Math.random() * Math.PI * 2,
        hit: null,
      });
    }
    state.bubbles = bubbles;
  }

  function newRound() {
    const round = makeRound();
    state.target = round.target;
    spawnBubbles(round.options);
    state.bullet = null;
    state.reveal = null;
    state.flash = null;
    state.status = "playing";
    updateHud();
  }

  function fire() {
    if (state.status !== "playing" || state.bullet) return;
    const cannon = cannonPos();
    const dirX = Math.sin(state.angle);
    const dirY = -Math.cos(state.angle);
    state.bullet = {
      x: cannon.x + dirX * 38,
      y: cannon.y + dirY * 38,
      vx: dirX * BULLET_SPEED,
      vy: dirY * BULLET_SPEED,
      text: state.target.term,
    };
  }

  function aimFromPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cannon = cannonPos();
    const angle = Math.atan2(x - cannon.x, -(y - cannon.y));
    state.angle = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, angle));
  }

  function onCorrect(bubble) {
    state.status = "transition";
    state.score += 10 + state.streak * 2;
    state.streak += 1;
    state.correctInLevel += 1;
    bubble.hit = "ok";
    state.bullet = null;
    state.flash = { color: "rgba(63,191,127,0.22)", until: performance.now() + 350 };
    if (state.correctInLevel % LEVEL_UP_EVERY === 0) state.level += 1;
    updateHud();
    setTimeout(() => {
      if (!disposed) newRound();
    }, 600);
  }

  function onWrong(bubble) {
    state.status = "transition";
    state.lives -= 1;
    state.streak = 0;
    bubble.hit = "bad";
    state.reveal = state.target.id;
    state.bullet = null;
    state.flash = { color: "rgba(179,69,83,0.26)", until: performance.now() + 500 };
    updateHud();
    setTimeout(() => {
      if (disposed) return;
      if (state.lives <= 0) gameOver();
      else newRound();
    }, 1000);
  }

  function gameOver() {
    state.status = "gameover";
    showOverlay("Game over", `Score ${state.score} · reached level ${state.level}`, "Play again", startGame);
  }

  function showOverlay(title, subtitle, buttonLabel, onClick) {
    const button = el("button", { class: "btn primary", text: buttonLabel });
    button.addEventListener("click", onClick);
    overlay.replaceChildren(
      el("div", { class: "overlay-card" }, [
        el("div", { class: "overlay-title", text: title }),
        el("div", { class: "muted", text: subtitle }),
        button,
      ])
    );
    overlay.classList.remove("hidden");
  }

  function startGame() {
    state.level = 1;
    state.score = 0;
    state.lives = 3;
    state.streak = 0;
    state.correctInLevel = 0;
    state.angle = 0;
    state.bullet = null;
    overlay.classList.add("hidden");
    newRound();
  }

  function update(dtFactor) {
    if (state.status !== "playing") return;

    const bottomEdge = H - CANNON_ZONE;
    for (const bubble of state.bubbles) {
      bubble.phase += 0.02 * dtFactor * (1 + state.level * 0.1);
      bubble.x += bubble.vx * dtFactor;
      bubble.y += bubble.vy * dtFactor;
      if (state.level >= 2) bubble.x += Math.sin(bubble.phase) * state.level * 0.07 * dtFactor;

      if (bubble.x - bubble.r < 0) {
        bubble.x = bubble.r;
        bubble.vx = Math.abs(bubble.vx);
      }
      if (bubble.x + bubble.r > W) {
        bubble.x = W - bubble.r;
        bubble.vx = -Math.abs(bubble.vx);
      }
      if (bubble.y - bubble.r < 0) {
        bubble.y = bubble.r;
        bubble.vy = Math.abs(bubble.vy);
      }
      if (bubble.y + bubble.r > bottomEdge) {
        bubble.y = bottomEdge - bubble.r;
        bubble.vy = -Math.abs(bubble.vy);
      }
    }

    const bullet = state.bullet;
    if (!bullet) return;
    bullet.x += bullet.vx * dtFactor;
    bullet.y += bullet.vy * dtFactor;
    if (bullet.x < -24 || bullet.x > W + 24 || bullet.y < -24 || bullet.y > H + 24) {
      state.bullet = null;
      return;
    }
    for (const bubble of state.bubbles) {
      if (Math.hypot(bubble.x - bullet.x, bubble.y - bullet.y) < bubble.r + 8) {
        if (bubble.wordId === state.target.id) onCorrect(bubble);
        else onWrong(bubble);
        return;
      }
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function wrapText(text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      if (ctx.measureText(word).width > maxWidth) {
        if (line) {
          lines.push(line);
          line = "";
        }
        let chunk = "";
        for (const char of word) {
          if (chunk && ctx.measureText(chunk + char).width > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        line = chunk;
        continue;
      }
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [String(text)];
  }

  function fitText(text, maxWidth, maxHeight, maxFont, minFont) {
    for (let size = maxFont; size >= minFont; size -= 1) {
      ctx.font = `600 ${size}px ${GAME_FONT}`;
      const lines = wrapText(text, maxWidth);
      const lineH = size * 1.25;
      if (lines.length * lineH <= maxHeight) return { size, lines, lineH };
    }
    ctx.font = `600 ${minFont}px ${GAME_FONT}`;
    return { size: minFont, lines: wrapText(text, maxWidth), lineH: minFont * 1.25 };
  }

  function drawBubble(bubble) {
    const isCorrect = bubble.hit === "ok" || (state.reveal !== null && bubble.wordId === state.reveal);
    const isWrong = bubble.hit === "bad";
    ctx.beginPath();
    ctx.arc(bubble.x, bubble.y, bubble.r, 0, Math.PI * 2);
    ctx.fillStyle = isCorrect
      ? "rgba(63,191,127,0.22)"
      : isWrong
        ? "rgba(179,69,83,0.26)"
        : "rgba(91,141,239,0.12)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isCorrect ? "#3fbf7f" : isWrong ? "#b34553" : "rgba(91,141,239,0.6)";
    ctx.stroke();

    const fit = fitText(bubble.definition, bubble.r * 1.55, bubble.r * 1.5, Math.max(11, Math.round(bubble.r / 4)), 10);
    ctx.font = `600 ${fit.size}px ${GAME_FONT}`;
    ctx.fillStyle = "#e8ecf5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const startY = bubble.y - (fit.lines.length * fit.lineH) / 2 + fit.lineH / 2;
    fit.lines.forEach((line, index) => {
      ctx.fillText(line, bubble.x, startY + index * fit.lineH);
    });
  }

  function drawCannon() {
    const cannon = cannonPos();
    ctx.save();
    ctx.translate(cannon.x, cannon.y);

    const dirX = Math.sin(state.angle);
    const dirY = -Math.cos(state.angle);
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = "rgba(232,236,245,0.16)";
    ctx.beginPath();
    ctx.moveTo(dirX * 30, dirY * 30);
    ctx.lineTo(dirX * H, dirY * H);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.save();
    ctx.rotate(state.angle);
    ctx.fillStyle = "#5b8def";
    roundRect(-7, -40, 14, 44, 5);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(0, 0, 16, Math.PI, 0);
    ctx.closePath();
    ctx.fillStyle = "#26324d";
    ctx.fill();
    ctx.strokeStyle = "rgba(91,141,239,0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawBullet(bullet) {
    ctx.save();
    ctx.translate(bullet.x, bullet.y);
    ctx.rotate(Math.atan2(bullet.vy, bullet.vx));
    ctx.font = `700 12px ${GAME_FONT}`;
    let text = bullet.text;
    while (text.length > 3 && ctx.measureText(text).width > 150) {
      text = `${text.slice(0, -2)}…`;
    }
    const width = Math.max(26, ctx.measureText(text).width + 18);
    ctx.fillStyle = "#f0c14b";
    roundRect(-width / 2, -11, width, 22, 11);
    ctx.fill();
    ctx.fillStyle = "#1a1408";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  function draw() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, "#0f1420");
    gradient.addColorStop(1, "#131a28");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    if (state.flash && performance.now() < state.flash.until) {
      ctx.fillStyle = state.flash.color;
      ctx.fillRect(0, 0, W, H);
    }

    for (const bubble of state.bubbles) drawBubble(bubble);
    drawCannon();
    if (state.bullet) drawBullet(state.bullet);
  }

  function frame(now) {
    if (disposed || !canvas.isConnected) {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("keydown", onKey);
      return;
    }
    const dtFactor = last ? Math.min(3, (now - last) / 16.6667) : 1;
    last = now;
    update(dtFactor);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function onKey(event) {
    if (event.key === "ArrowLeft") {
      state.angle = Math.max(-MAX_ANGLE, state.angle - 0.06);
    } else if (event.key === "ArrowRight") {
      state.angle = Math.min(MAX_ANGLE, state.angle + 0.06);
    } else if (event.key === " ") {
      event.preventDefault();
      fire();
    }
  }

  canvas.addEventListener("mousemove", aimFromPointer);
  canvas.addEventListener("mousedown", (event) => {
    aimFromPointer(event);
    fire();
  });
  canvas.addEventListener(
    "touchstart",
    (event) => {
      event.preventDefault();
      aimFromPointer(event.touches[0]);
      fire();
    },
    { passive: false }
  );
  window.addEventListener("resize", resize);
  document.addEventListener("keydown", onKey);

  resize();
  showOverlay(
    "Shoot the word",
    "Aim at the bubble with the matching definition and fire. Misses are free; wrong hits cost a life.",
    "Start",
    startGame
  );
  raf = requestAnimationFrame(frame);
}

document.getElementById("nav-lists").addEventListener("click", renderLists);
document.getElementById("nav-study").addEventListener("click", renderStudyHome);
document.getElementById("nav-test").addEventListener("click", renderTestHome);
document.getElementById("nav-play").addEventListener("click", renderPlayHome);
document.getElementById("nav-progress").addEventListener("click", renderProgress);

renderLists();
