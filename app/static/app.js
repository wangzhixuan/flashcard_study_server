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

function renderListPicker(title, subtitle, onPick) {
  setActiveNav(title.toLowerCase() === "test" ? "test" : "study");
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
  renderListPicker("Study", "Choose a list to study", renderStudySetup);
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

function checkboxRow(value, labelText) {
  const cb = el("input", { type: "checkbox", value });
  cb.checked = true;
  return {
    cb,
    node: el("label", { class: "check" }, [cb, el("span", { text: labelText })]),
  };
}

function renderTestHome() {
  renderListPicker("Test", "Choose a list to test", renderTestSetup);
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
  for (const id of ["lists", "study", "test", "progress"]) {
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

document.getElementById("nav-lists").addEventListener("click", renderLists);
document.getElementById("nav-study").addEventListener("click", renderStudyHome);
document.getElementById("nav-test").addEventListener("click", renderTestHome);
document.getElementById("nav-progress").addEventListener("click", renderProgress);

renderLists();
