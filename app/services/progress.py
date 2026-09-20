from __future__ import annotations

import sqlite3

from . import quiz


def _aggregate(records: list[dict]) -> dict:
    total = sum(r["total"] for r in records)
    correct = sum(r["correct"] for r in records)
    scores = [r["correct"] / r["total"] for r in records if r["total"]]
    return {
        "tests": len(records),
        "total": total,
        "correct": correct,
        "score": (correct / total) if total else 0.0,
        "best": max(scores) if scores else 0.0,
        "last_score": scores[0] if scores else 0.0,
        "last_at": records[0]["created_at"] if records else None,
    }


def overview(conn: sqlite3.Connection) -> dict:
    list_rows = conn.execute(
        "SELECT id, name, deck_size FROM lists ORDER BY id"
    ).fetchall()
    word_rows = conn.execute(
        "SELECT list_id, COUNT(*) AS word_count, "
        "COALESCE(MAX(deck_index), 0) AS deck_count "
        "FROM words GROUP BY list_id"
    ).fetchall()
    word_stats = {row["list_id"]: row for row in word_rows}

    tests = quiz.list_results(conn)
    by_list: dict[int, list[dict]] = {}
    for test in tests:
        by_list.setdefault(test["list_id"], []).append(test)

    lists = []
    for row in list_rows:
        stats = word_stats.get(row["id"])
        lists.append(
            {
                "list_id": row["id"],
                "name": row["name"],
                "deck_size": row["deck_size"],
                "word_count": stats["word_count"] if stats else 0,
                "deck_count": stats["deck_count"] if stats else 0,
                **_aggregate(by_list.get(row["id"], [])),
            }
        )

    return {"overall": _aggregate(tests), "lists": lists}


def list_detail(conn: sqlite3.Connection, list_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, name, deck_size FROM lists WHERE id = ?", (list_id,)
    ).fetchone()
    if row is None:
        return None

    deck_word_rows = conn.execute(
        "SELECT deck_index, COUNT(*) AS word_count FROM words "
        "WHERE list_id = ? GROUP BY deck_index",
        (list_id,),
    ).fetchall()
    deck_words = {r["deck_index"]: r["word_count"] for r in deck_word_rows}

    tests = quiz.list_results(conn, list_id)

    buckets: dict[int, list[dict]] = {index: [] for index in deck_words}
    for test in tests:
        for deck_index in test["decks"]:
            buckets.setdefault(deck_index, []).append(test)

    decks = [
        {
            "deck_index": index,
            "word_count": deck_words.get(index, 0),
            **_aggregate(buckets[index]),
        }
        for index in sorted(buckets)
    ]

    list_progress = {
        "list_id": row["id"],
        "name": row["name"],
        "deck_size": row["deck_size"],
        "word_count": sum(deck_words.values()),
        "deck_count": len(deck_words),
        **_aggregate(tests),
    }
    return {"list": list_progress, "decks": decks, "recent": tests[:10]}


def deck_overview(conn: sqlite3.Connection, list_id: int | None = None) -> dict:
    name_rows = conn.execute("SELECT id, name FROM lists ORDER BY id").fetchall()
    names = {row["id"]: row["name"] for row in name_rows}

    sql = (
        "SELECT list_id, deck_index, COUNT(*) AS word_count FROM words "
        "WHERE 1 = 1"
    )
    params: list[int] = []
    if list_id is not None:
        sql += " AND list_id = ?"
        params.append(list_id)
    sql += " GROUP BY list_id, deck_index ORDER BY list_id, deck_index"
    word_rows = conn.execute(sql, params).fetchall()

    tests = quiz.list_results(conn, list_id)
    buckets: dict[tuple[int, int], list[dict]] = {}
    for test in tests:
        for deck_index in test["decks"]:
            buckets.setdefault((test["list_id"], deck_index), []).append(test)

    decks = []
    for row in word_rows:
        records = buckets.get((row["list_id"], row["deck_index"]), [])
        decks.append(
            {
                "list_id": row["list_id"],
                "list_name": names.get(row["list_id"], ""),
                "deck_index": row["deck_index"],
                "word_count": row["word_count"],
                **_aggregate(records),
                "history": [
                    {
                        "score": (r["correct"] / r["total"]) if r["total"] else 0.0,
                        "correct": r["correct"],
                        "total": r["total"],
                        "created_at": r["created_at"],
                    }
                    for r in reversed(records)
                ],
            }
        )
    return {"decks": decks}
