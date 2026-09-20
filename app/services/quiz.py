from __future__ import annotations

import random
import sqlite3

QUESTION_TYPES = (
    "word_to_def",
    "def_to_word",
    "pair_correct",
    "pair_incorrect",
)
DEFAULT_COUNT = 20
MAX_OPTIONS = 4


def _fetch_words(
    conn: sqlite3.Connection, list_id: int, decks: list[int]
) -> list[dict]:
    sql = (
        "SELECT id, term, definition, position, deck_index FROM words "
        "WHERE list_id = ?"
    )
    params: list[int] = [list_id]
    if decks:
        placeholders = ",".join("?" for _ in decks)
        sql += f" AND deck_index IN ({placeholders})"
        params.extend(decks)
    sql += " ORDER BY position"
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def _distractors(
    target: dict,
    pool: list[dict],
    all_words: list[dict],
    rng: random.Random,
    text_key: str,
    count: int,
) -> list[dict]:
    """Pick up to ``count`` words distinct from ``target`` by id and text."""
    seen_ids = {target["id"]}
    seen_text = {target[text_key]}
    picked: list[dict] = []
    for source in (pool, all_words):
        candidates = list(source)
        rng.shuffle(candidates)
        for word in candidates:
            if word["id"] in seen_ids or word[text_key] in seen_text:
                continue
            picked.append(word)
            seen_ids.add(word["id"])
            seen_text.add(word[text_key])
            if len(picked) >= count:
                return picked
    return picked


def _pick_distinct(
    pool: list[dict],
    all_words: list[dict],
    rng: random.Random,
    count: int,
) -> list[dict]:
    """Pick words that are pairwise distinct by id, term and definition."""
    seen_ids: set[int] = set()
    seen_terms: set[str] = set()
    seen_defs: set[str] = set()
    picked: list[dict] = []
    for source in (pool, all_words):
        candidates = list(source)
        rng.shuffle(candidates)
        for word in candidates:
            if (
                word["id"] in seen_ids
                or word["term"] in seen_terms
                or word["definition"] in seen_defs
            ):
                continue
            picked.append(word)
            seen_ids.add(word["id"])
            seen_terms.add(word["term"])
            seen_defs.add(word["definition"])
            if len(picked) >= count:
                return picked
    return picked


def _without(word: dict, words: list[dict]) -> list[dict]:
    return [item for item in words if item["id"] != word["id"]]


def _pair(term_word: dict, def_word: dict) -> dict:
    return {
        "id": f"{term_word['id']}:{def_word['id']}",
        "text": f"{term_word['term']} — {def_word['definition']}",
    }


def _build_word_to_def(
    target: dict, pool: list[dict], all_words: list[dict], rng: random.Random
) -> dict:
    options_words = [target] + _distractors(
        target, pool, all_words, rng, "definition", MAX_OPTIONS - 1
    )
    rng.shuffle(options_words)
    return {
        "word_id": target["id"],
        "question_type": "word_to_def",
        "prompt": target["term"],
        "options": [
            {"id": str(w["id"]), "text": w["definition"]} for w in options_words
        ],
        "correct_option_id": str(target["id"]),
    }


def _build_def_to_word(
    target: dict, pool: list[dict], all_words: list[dict], rng: random.Random
) -> dict:
    options_words = [target] + _distractors(
        target, pool, all_words, rng, "term", MAX_OPTIONS - 1
    )
    rng.shuffle(options_words)
    return {
        "word_id": target["id"],
        "question_type": "def_to_word",
        "prompt": target["definition"],
        "options": [{"id": str(w["id"]), "text": w["term"]} for w in options_words],
        "correct_option_id": str(target["id"]),
    }


def _build_pair_correct(
    target: dict, pool: list[dict], all_words: list[dict], rng: random.Random
) -> dict | None:
    others = _pick_distinct(
        _without(target, pool), _without(target, all_words), rng, MAX_OPTIONS - 1
    )
    if len(others) < MAX_OPTIONS - 1:
        return None

    options = [_pair(target, target)]
    for index, term_word in enumerate(others):
        def_word = others[(index + 1) % len(others)]
        options.append(_pair(term_word, def_word))
    rng.shuffle(options)
    return {
        "word_id": target["id"],
        "question_type": "pair_correct",
        "prompt": "Which word–definition pair is CORRECT?",
        "options": options,
        "correct_option_id": f"{target['id']}:{target['id']}",
    }


def _build_pair_incorrect(
    target: dict, pool: list[dict], all_words: list[dict], rng: random.Random
) -> dict | None:
    others = _pick_distinct(
        _without(target, pool), _without(target, all_words), rng, MAX_OPTIONS
    )
    if len(others) < MAX_OPTIONS:
        return None

    first, second, term_word, def_word = others[0], others[1], others[2], others[3]
    incorrect_id = f"{term_word['id']}:{def_word['id']}"
    options = [
        _pair(target, target),
        _pair(first, first),
        _pair(second, second),
        _pair(term_word, def_word),
    ]
    rng.shuffle(options)
    return {
        "word_id": target["id"],
        "question_type": "pair_incorrect",
        "prompt": "Which word–definition pair is INCORRECT?",
        "options": options,
        "correct_option_id": incorrect_id,
    }


_BUILDERS = {
    "word_to_def": _build_word_to_def,
    "def_to_word": _build_def_to_word,
    "pair_correct": _build_pair_correct,
    "pair_incorrect": _build_pair_incorrect,
}


def generate_test(
    conn: sqlite3.Connection,
    list_id: int,
    decks: list[int] | None,
    question_types: list[str],
    count: int | None = None,
) -> dict | None:
    list_row = conn.execute(
        "SELECT id, name FROM lists WHERE id = ?", (list_id,)
    ).fetchone()
    if list_row is None:
        return None

    deck_indices = [int(d) for d in decks] if decks else []
    types = [t for t in (question_types or []) if t in QUESTION_TYPES]
    if not types:
        raise ValueError("Select at least one valid question type")

    pool = _fetch_words(conn, list_id, deck_indices)
    all_words = _fetch_words(conn, list_id, []) if deck_indices else pool
    if not pool:
        raise ValueError("The selected decks have no words")
    if len(all_words) < 2:
        raise ValueError("Need at least 2 words to build a test")
    if "pair_correct" in types and len(all_words) < MAX_OPTIONS:
        raise ValueError("'Pick the correct pair' needs at least 4 words")
    if "pair_incorrect" in types and len(all_words) < MAX_OPTIONS + 1:
        raise ValueError("'Spot the incorrect pair' needs at least 5 words")

    combos = [(qtype, word) for qtype in types for word in pool]
    rng = random.Random()
    rng.shuffle(combos)
    if count is None:
        count = min(len(combos), DEFAULT_COUNT)
    count = max(1, min(count, len(combos)))
    combos = combos[:count]

    questions: list[dict] = []
    for qtype, target in combos:
        question = _BUILDERS[qtype](target, pool, all_words, rng)
        if question is not None:
            questions.append(question)
    if not questions:
        raise ValueError("Could not build any questions for this selection")

    return {
        "list_id": list_row["id"],
        "name": list_row["name"],
        "decks": sorted({word["deck_index"] for _, word in combos}),
        "question_types": types,
        "questions": [
            {
                "question_type": question["question_type"],
                "prompt": question["prompt"],
                "options": question["options"],
                "correct_option_id": question["correct_option_id"],
            }
            for question in questions
        ],
    }


def _result_dict(row: sqlite3.Row) -> dict:
    total = row["total"]
    correct = row["correct"]
    return {
        "id": row["id"],
        "list_id": row["list_id"],
        "decks": [int(x) for x in row["deck_indices"].split(",") if x.strip()],
        "question_types": [x for x in row["question_types"].split(",") if x],
        "total": total,
        "correct": correct,
        "score": (correct / total) if total else 0.0,
        "created_at": row["created_at"],
    }


def record_result(
    conn: sqlite3.Connection,
    list_id: int,
    decks: list[int],
    question_types: list[str],
    total: int,
    correct: int,
) -> dict | None:
    if conn.execute("SELECT 1 FROM lists WHERE id = ?", (list_id,)).fetchone() is None:
        return None

    total = max(0, total)
    correct = max(0, min(correct, total))
    cur = conn.execute(
        "INSERT INTO tests (list_id, deck_indices, question_types, total, correct) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            list_id,
            ",".join(str(d) for d in sorted(set(decks))),
            ",".join(question_types),
            total,
            correct,
        ),
    )
    return get_result(conn, cur.lastrowid)


def get_result(conn: sqlite3.Connection, test_id: int) -> dict | None:
    row = conn.execute(
        "SELECT id, list_id, deck_indices, question_types, total, correct, created_at "
        "FROM tests WHERE id = ?",
        (test_id,),
    ).fetchone()
    return _result_dict(row) if row is not None else None


def list_results(
    conn: sqlite3.Connection, list_id: int | None = None
) -> list[dict]:
    sql = (
        "SELECT id, list_id, deck_indices, question_types, total, correct, created_at "
        "FROM tests"
    )
    params: list[int] = []
    if list_id is not None:
        sql += " WHERE list_id = ?"
        params.append(list_id)
    sql += " ORDER BY id DESC"
    return [_result_dict(row) for row in conn.execute(sql, params).fetchall()]
