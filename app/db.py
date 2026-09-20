import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "app.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS lists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    deck_size   INTEGER NOT NULL DEFAULT 20,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS words (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    term        TEXT    NOT NULL,
    definition  TEXT    NOT NULL,
    position    INTEGER NOT NULL,
    deck_index  INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_words_list_pos ON words(list_id, position);

CREATE TABLE IF NOT EXISTS tests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id         INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    deck_indices    TEXT    NOT NULL DEFAULT '',
    question_types  TEXT    NOT NULL DEFAULT '',
    total           INTEGER NOT NULL DEFAULT 0,
    correct         INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tests_list ON tests(list_id);
"""


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(tests)")}
    if "total" not in columns:
        conn.execute("ALTER TABLE tests ADD COLUMN total INTEGER NOT NULL DEFAULT 0")
    if "correct" not in columns:
        conn.execute("ALTER TABLE tests ADD COLUMN correct INTEGER NOT NULL DEFAULT 0")
    conn.execute("DROP TABLE IF EXISTS answers")
    conn.execute("DROP TABLE IF EXISTS questions")


def init_db() -> None:
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        _migrate(conn)
        conn.commit()
    finally:
        conn.close()


@contextmanager
def get_db():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
