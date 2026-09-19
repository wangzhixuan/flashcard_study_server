from __future__ import annotations

import sqlite3
from typing import Iterable


def deck_index_for(position: int, deck_size: int) -> int:
    if deck_size < 1:
        deck_size = 1
    return position // deck_size + 1


def _insert_words(
    conn: sqlite3.Connection,
    list_id: int,
    pairs: Iterable[tuple[str, str]],
    start_position: int,
    deck_size: int,
) -> int:
    rows = [
        (
            list_id,
            term,
            definition,
            start_position + offset,
            deck_index_for(start_position + offset, deck_size),
        )
        for offset, (term, definition) in enumerate(pairs)
    ]
    if not rows:
        return 0
    conn.executemany(
        "INSERT INTO words (list_id, term, definition, position, deck_index) "
        "VALUES (?, ?, ?, ?, ?)",
        rows,
    )
    return len(rows)


def create_list(
    conn: sqlite3.Connection,
    name: str,
    pairs: Iterable[tuple[str, str]],
    deck_size: int = 20,
) -> int:
    deck_size = max(1, deck_size)
    cur = conn.execute(
        "INSERT INTO lists (name, deck_size) VALUES (?, ?)",
        (name, deck_size),
    )
    list_id = cur.lastrowid
    _insert_words(conn, list_id, pairs, start_position=0, deck_size=deck_size)
    return list_id


def _next_position(conn: sqlite3.Connection, list_id: int) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(position), -1) AS p FROM words WHERE list_id = ?",
        (list_id,),
    ).fetchone()
    return row["p"] + 1


def append_words(
    conn: sqlite3.Connection, list_id: int, pairs: Iterable[tuple[str, str]]
) -> int:
    row = conn.execute(
        "SELECT deck_size FROM lists WHERE id = ?", (list_id,)
    ).fetchone()
    if row is None:
        raise KeyError("List not found")
    start = _next_position(conn, list_id)
    return _insert_words(conn, list_id, pairs, start, row["deck_size"])


def set_deck_size(conn: sqlite3.Connection, list_id: int, deck_size: int) -> int:
    deck_size = max(1, deck_size)
    conn.execute("UPDATE lists SET deck_size = ? WHERE id = ?", (deck_size, list_id))
    rows = conn.execute(
        "SELECT id FROM words WHERE list_id = ? ORDER BY position, id",
        (list_id,),
    ).fetchall()
    conn.executemany(
        "UPDATE words SET position = ?, deck_index = ? WHERE id = ?",
        [
            (pos, deck_index_for(pos, deck_size), row["id"])
            for pos, row in enumerate(rows)
        ],
    )
    return len(rows)


def update_list(
    conn: sqlite3.Connection,
    list_id: int,
    name: str | None = None,
    deck_size: int | None = None,
) -> bool:
    if conn.execute("SELECT 1 FROM lists WHERE id = ?", (list_id,)).fetchone() is None:
        return False
    if name is not None:
        conn.execute("UPDATE lists SET name = ? WHERE id = ?", (name, list_id))
    if deck_size is not None:
        set_deck_size(conn, list_id, deck_size)
    return True


_SUMMARY_SQL = """
    SELECT l.id, l.name, l.deck_size, l.created_at,
           COUNT(w.id) AS word_count,
           COALESCE(MAX(w.deck_index), 0) AS deck_count
    FROM lists l
    LEFT JOIN words w ON w.list_id = l.id
"""


def list_lists(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        _SUMMARY_SQL + " GROUP BY l.id ORDER BY l.id"
    ).fetchall()
    return [dict(r) for r in rows]


def get_summary(conn: sqlite3.Connection, list_id: int) -> dict | None:
    row = conn.execute(
        _SUMMARY_SQL + " WHERE l.id = ? GROUP BY l.id", (list_id,)
    ).fetchone()
    return dict(row) if row is not None else None


def get_list(conn: sqlite3.Connection, list_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, name, deck_size, created_at FROM lists WHERE id = ?",
        (list_id,),
    ).fetchone()
    if row is None:
        return None

    words = conn.execute(
        "SELECT id, term, definition, position, deck_index FROM words "
        "WHERE list_id = ? ORDER BY position",
        (list_id,),
    ).fetchall()
    word_dicts = [dict(w) for w in words]

    decks: dict[int, int] = {}
    for word in word_dicts:
        decks[word["deck_index"]] = decks.get(word["deck_index"], 0) + 1

    result = dict(row)
    result["word_count"] = len(word_dicts)
    result["deck_count"] = max(decks) if decks else 0
    result["decks"] = [
        {"index": idx, "word_count": count} for idx, count in sorted(decks.items())
    ]
    result["words"] = word_dicts
    return result


def delete_list(conn: sqlite3.Connection, list_id: int) -> bool:
    cur = conn.execute("DELETE FROM lists WHERE id = ?", (list_id,))
    return cur.rowcount > 0


def get_cards(
    conn: sqlite3.Connection,
    list_id: int,
    deck_indices: list[int] | None = None,
) -> dict | None:
    row = conn.execute(
        "SELECT id, name, deck_size FROM lists WHERE id = ?", (list_id,)
    ).fetchone()
    if row is None:
        return None

    sql = (
        "SELECT id, term, definition, position, deck_index FROM words "
        "WHERE list_id = ?"
    )
    params: list[int] = [list_id]
    if deck_indices:
        placeholders = ",".join("?" for _ in deck_indices)
        sql += f" AND deck_index IN ({placeholders})"
        params.extend(deck_indices)
    sql += " ORDER BY position"

    cards = [dict(w) for w in conn.execute(sql, params).fetchall()]
    return {
        "list_id": row["id"],
        "name": row["name"],
        "deck_size": row["deck_size"],
        "decks": sorted({c["deck_index"] for c in cards}),
        "count": len(cards),
        "cards": cards,
    }
