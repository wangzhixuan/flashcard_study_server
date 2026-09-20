from __future__ import annotations

import json
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
) -> dict:
    distractors = _distractors(
        target, pool, all_words, rng, "definition", MAX_OPTIONS - 1
    )
    options = [
        {
            "id": f"{target['id']}:{target['id']}",
            "text": f"{target['term']} — {target['definition']}",
        }
    ]
    for word in distractors:
        options.append(
            {
                "id": f"{target['id']}:{word['id']}",
                "text": f"{target['term']} — {word['definition']}",
            }
        )
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
    others = _distractors(target, pool, all_words, rng, "definition", MAX_OPTIONS - 1)
    if len(others) < MAX_OPTIONS - 1:
        return None
    first, second, wrong = others[0], others[1], others[2]
    incorrect_id = f"{wrong['id']}:{target['id']}"
    options = [
        {
            "id": f"{target['id']}:{target['id']}",
            "text": f"{target['term']} — {target['definition']}",
        },
        {
            "id": f"{first['id']}:{first['id']}",
            "text": f"{first['term']} — {first['definition']}",
        },
        {
            "id": f"{second['id']}:{second['id']}",
            "text": f"{second['term']} — {second['definition']}",
        },
        {
            "id": incorrect_id,
            "text": f"{wrong['term']} — {target['definition']}",
        },
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
        "SELECT id FROM lists WHERE id = ?", (list_id,)
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
    if any(t.startswith("pair_") for t in types) and len(all_words) < MAX_OPTIONS:
        raise ValueError("Pair questions need at least 4 words")

    combos = [(qtype, word) for qtype in types for word in pool]
    rng = random.Random()
    rng.shuffle(combos)
    if count is None:
        count = min(len(combos), DEFAULT_COUNT)
    count = max(1, min(count, len(combos)))
    combos = combos[:count]

    built: list[dict] = []
    for qtype, target in combos:
        question = _BUILDERS[qtype](target, pool, all_words, rng)
        if question is not None:
            built.append(question)
    if not built:
        raise ValueError("Could not build any questions for this selection")

    cur = conn.execute(
        "INSERT INTO tests (list_id, deck_indices, question_types) VALUES (?, ?, ?)",
        (list_id, ",".join(str(d) for d in sorted(deck_indices)), ",".join(types)),
    )
    test_id = cur.lastrowid
    for position, question in enumerate(built):
        conn.execute(
            "INSERT INTO questions "
            "(test_id, word_id, question_type, prompt, options_json, "
            "correct_option_id, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                test_id,
                question["word_id"],
                question["question_type"],
                question["prompt"],
                json.dumps(question["options"]),
                question["correct_option_id"],
                position,
            ),
        )
    return get_test_payload(conn, test_id)


def get_test_payload(conn: sqlite3.Connection, test_id: int) -> dict | None:
    test = conn.execute(
        "SELECT id, list_id, deck_indices, question_types FROM tests WHERE id = ?",
        (test_id,),
    ).fetchone()
    if test is None:
        return None

    name_row = conn.execute(
        "SELECT name FROM lists WHERE id = ?", (test["list_id"],)
    ).fetchone()
    rows = conn.execute(
        "SELECT id, word_id, question_type, prompt, options_json, "
        "correct_option_id, position FROM questions "
        "WHERE test_id = ? ORDER BY position",
        (test_id,),
    ).fetchall()

    return {
        "id": test["id"],
        "list_id": test["list_id"],
        "name": name_row["name"] if name_row is not None else "",
        "decks": [int(x) for x in test["deck_indices"].split(",") if x.strip()],
        "question_types": [x for x in test["question_types"].split(",") if x],
        "questions": [
            {
                "id": row["id"],
                "word_id": row["word_id"],
                "position": row["position"],
                "question_type": row["question_type"],
                "prompt": row["prompt"],
                "options": json.loads(row["options_json"]),
                "correct_option_id": row["correct_option_id"],
            }
            for row in rows
        ],
    }


def grade_test(
    conn: sqlite3.Connection, test_id: int, answers: list[dict]
) -> dict | None:
    payload = get_test_payload(conn, test_id)
    if payload is None:
        return None

    submitted: dict[int, str | None] = {}
    for answer in answers:
        question_id = answer.get("question_id")
        if question_id is not None:
            submitted[question_id] = answer.get("option_id")

    conn.execute("DELETE FROM answers WHERE test_id = ?", (test_id,))

    results: list[dict] = []
    correct_count = 0
    for question in payload["questions"]:
        chosen = submitted.get(question["id"])
        is_correct = chosen is not None and chosen == question["correct_option_id"]
        if is_correct:
            correct_count += 1
        conn.execute(
            "INSERT INTO answers (test_id, word_id, question_type, is_correct) "
            "VALUES (?, ?, ?, ?)",
            (test_id, question["word_id"], question["question_type"], is_correct),
        )
        texts = {option["id"]: option["text"] for option in question["options"]}
        results.append(
            {
                "question_id": question["id"],
                "question_type": question["question_type"],
                "prompt": question["prompt"],
                "option_id": chosen,
                "chosen_text": texts.get(chosen),
                "correct_option_id": question["correct_option_id"],
                "correct_text": texts.get(question["correct_option_id"]),
                "is_correct": is_correct,
            }
        )

    total = len(payload["questions"])
    return {
        "test_id": test_id,
        "total": total,
        "correct": correct_count,
        "score": (correct_count / total) if total else 0.0,
        "answers": results,
    }
