# FlashCardStudyServer

A small, local Quizlet-style service for studying vocabulary. Import word lists,
break them into fixed-size decks, study with flashcards, take auto-generated
tests, and track your progress over time.

Everything runs locally with no external services: a FastAPI backend, a SQLite
database, and a no-build vanilla-JS single-page UI.

## Features

1. **Lists & decks** — import a list from CSV, then split it into persistent,
   fixed-size decks (e.g. a 200-word list into 10 decks of 20). Rename lists,
   change deck size (words are re-decked), append more words, or delete.
2. **Study** — flip through flashcards for a deck (or all decks), with
   next/previous, flip, shuffle, and keyboard shortcuts.
3. **Test** — pick one or more decks, choose question types, and set the number
   of questions. Four question types:
   - word → correct definition
   - definition → correct word
   - pick the correct word–definition pair
   - spot the incorrect word–definition pair

   You get instant feedback per question, and the final score is saved.
4. **Progress** — per-deck progress with a color bar for the last 5 test scores
   and a line chart of score over time.
5. **Play** — a shooting game. The current word is loaded as a projectile;
   floating bubbles hold definitions and you aim a cannon to hit the matching
   one. Difficulty ramps up with each level (more bubbles, faster movement,
   smaller targets). Three lives; misses are free.

## Tech stack

- Python 3.13 + FastAPI + Uvicorn
- SQLite (Python standard library `sqlite3`) — no ORM
- Vanilla HTML/CSS/JS (no build step)

## Quick start

```powershell
# 1. Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt

# 3. Seed a sample list (word1 -> 1, word2 -> 4, ... word25 -> 625)
python -m app.seed

# 4. Run the server
python -m uvicorn app.main:app --reload
```

Then open http://127.0.0.1:8000.

## CSV format

Two columns — `term,definition` — with an optional header row. The comma,
semicolon, tab, and pipe delimiters are auto-detected, and commas inside
definitions are supported. A header is detected when both columns look like
labels (e.g. `term,definition`, `word,meaning`, `front,back`); you can also
force it from the import UI.

```csv
term,definition
bonjour,hello
merci,thank you
au revoir,goodbye
```

## Configuration

The SQLite database defaults to `data/app.db`. Override it with the
`FLASHCARD_DB` environment variable (useful for tests or multiple profiles):

```powershell
$env:FLASHCARD_DB = "C:\path\to\my.db"
```

## Project structure

```
app/
  main.py              FastAPI app, routes, static mount
  db.py                SQLite connection, schema, lightweight migrations
  schemas.py           Pydantic request/response models
  seed.py              Seeds the sample "Squares" list
  services/
    lists.py           List/word CRUD, deck assignment, card queries
    csv_import.py      CSV parsing (delimiter + header detection)
    quiz.py            Question generation and score recording
    progress.py        Progress aggregation per list and per deck
  static/              index.html, app.js, styles.css
data/app.db            SQLite database (git-ignored)
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/lists` | List all lists (with word/deck counts) |
| POST | `/api/lists` | Create an empty list |
| POST | `/api/lists/import` | Create a list from an uploaded CSV |
| GET | `/api/lists/{id}` | List detail: words + deck summary |
| PATCH | `/api/lists/{id}` | Rename and/or change deck size (re-decks) |
| POST | `/api/lists/{id}/import` | Append words from a CSV |
| DELETE | `/api/lists/{id}` | Delete a list and its words/tests |
| GET | `/api/lists/{id}/cards` | Cards for `?decks=1,2` (omit for all) |
| POST | `/api/tests/generate` | Generate a test (questions are not stored) |
| POST | `/api/tests/results` | Save a test score |
| GET | `/api/tests` | List saved scores (optional `?list_id=`) |
| GET | `/api/progress` | Overall + per-list progress |
| GET | `/api/progress/lists/{id}` | Per-deck progress for a list |
| GET | `/api/progress/decks` | Every deck with aggregates + score history |

## Data model

- `lists(id, name, deck_size, created_at)`
- `words(id, list_id, term, definition, position, deck_index)`
- `tests(id, list_id, deck_indices, question_types, total, correct, created_at)`

Progress is derived entirely from the saved test scores. Only the score of each
test (and which list/decks it covered) is stored — not individual questions.
