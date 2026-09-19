from .db import get_db, init_db
from .services import lists as lists_service

SEED_NAME = "Squares"
SEED_FROM = 1
SEED_TO = 25
SEED_DECK_SIZE = 20


def seed() -> int | None:
    init_db()
    pairs = [(f"word{i}", str(i * i)) for i in range(SEED_FROM, SEED_TO + 1)]
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM lists WHERE name = ?", (SEED_NAME,)
        ).fetchone()
        if existing is not None:
            print(f"Seed list '{SEED_NAME}' already exists (id={existing['id']}). Skipping.")
            return existing["id"]
        list_id = lists_service.create_list(
            conn, SEED_NAME, pairs, deck_size=SEED_DECK_SIZE
        )
    print(
        f"Seeded list '{SEED_NAME}' (id={list_id}) with {len(pairs)} words, "
        f"deck size {SEED_DECK_SIZE}."
    )
    return list_id


if __name__ == "__main__":
    seed()
