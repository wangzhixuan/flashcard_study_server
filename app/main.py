from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .db import get_db, init_db
from .schemas import (
    DeckCards,
    ImportResult,
    ListCreate,
    ListDetail,
    ListSummary,
    ListUpdate,
    TestCreate,
    TestPayload,
    TestResult,
    TestSubmit,
)
from .services import csv_import
from .services import lists as lists_service
from .services import quiz

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="FlashCardTestV2", lifespan=lifespan)


def _parse_header_flag(value: str) -> bool | None:
    value = (value or "auto").strip().lower()
    if value in ("true", "1", "yes"):
        return True
    if value in ("false", "0", "no"):
        return False
    return None


async def _pairs_from_upload(file: UploadFile, has_header: str) -> list[tuple[str, str]]:
    raw = await file.read()
    text = raw.decode("utf-8-sig", errors="replace")
    pairs = csv_import.parse_csv(text, _parse_header_flag(has_header))
    if not pairs:
        raise HTTPException(status_code=400, detail="No word pairs found in the file")
    return pairs


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/lists", response_model=list[ListSummary])
def api_list_lists() -> list[dict]:
    with get_db() as conn:
        return lists_service.list_lists(conn)


@app.post("/api/lists", response_model=ListSummary, status_code=201)
def api_create_list(payload: ListCreate) -> dict:
    with get_db() as conn:
        list_id = lists_service.create_list(conn, payload.name, [], payload.deck_size)
        return lists_service.get_summary(conn, list_id)


@app.post("/api/lists/import", response_model=ImportResult, status_code=201)
async def api_import_new_list(
    file: UploadFile = File(...),
    name: str = Form(...),
    deck_size: int = Form(20),
    has_header: str = Form("auto"),
) -> dict:
    pairs = await _pairs_from_upload(file, has_header)
    with get_db() as conn:
        list_id = lists_service.create_list(conn, name, pairs, max(1, deck_size))
        summary = lists_service.get_summary(conn, list_id)
    return {"list": summary, "imported": len(pairs), "skipped": 0}


@app.get("/api/lists/{list_id}", response_model=ListDetail)
def api_get_list(list_id: int) -> dict:
    with get_db() as conn:
        result = lists_service.get_list(conn, list_id)
    if result is None:
        raise HTTPException(status_code=404, detail="List not found")
    return result


@app.get("/api/lists/{list_id}/cards", response_model=DeckCards)
def api_get_cards(list_id: int, decks: str | None = None) -> dict:
    deck_indices: list[int] | None = None
    if decks:
        try:
            deck_indices = [int(part) for part in decks.split(",") if part.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid decks parameter")
    with get_db() as conn:
        result = lists_service.get_cards(conn, list_id, deck_indices)
    if result is None:
        raise HTTPException(status_code=404, detail="List not found")
    return result


@app.patch("/api/lists/{list_id}", response_model=ListSummary)
def api_update_list(list_id: int, payload: ListUpdate) -> dict:
    with get_db() as conn:
        ok = lists_service.update_list(
            conn, list_id, name=payload.name, deck_size=payload.deck_size
        )
        if not ok:
            raise HTTPException(status_code=404, detail="List not found")
        return lists_service.get_summary(conn, list_id)


@app.post("/api/lists/{list_id}/import", response_model=ImportResult)
async def api_import_into_list(
    list_id: int,
    file: UploadFile = File(...),
    has_header: str = Form("auto"),
) -> dict:
    pairs = await _pairs_from_upload(file, has_header)
    with get_db() as conn:
        if lists_service.get_summary(conn, list_id) is None:
            raise HTTPException(status_code=404, detail="List not found")
        imported = lists_service.append_words(conn, list_id, pairs)
        summary = lists_service.get_summary(conn, list_id)
    return {"list": summary, "imported": imported, "skipped": 0}


@app.delete("/api/lists/{list_id}", status_code=204)
def api_delete_list(list_id: int) -> Response:
    with get_db() as conn:
        if not lists_service.delete_list(conn, list_id):
            raise HTTPException(status_code=404, detail="List not found")
    return Response(status_code=204)


@app.post("/api/tests", response_model=TestPayload, status_code=201)
def api_create_test(payload: TestCreate) -> dict:
    try:
        with get_db() as conn:
            result = quiz.generate_test(
                conn,
                payload.list_id,
                payload.decks,
                payload.question_types,
                payload.count,
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if result is None:
        raise HTTPException(status_code=404, detail="List not found")
    return result


@app.get("/api/tests/{test_id}", response_model=TestPayload)
def api_get_test(test_id: int) -> dict:
    with get_db() as conn:
        result = quiz.get_test_payload(conn, test_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return result


@app.post("/api/tests/{test_id}/submit", response_model=TestResult)
def api_submit_test(test_id: int, payload: TestSubmit) -> dict:
    with get_db() as conn:
        result = quiz.grade_test(
            conn, test_id, [answer.model_dump() for answer in payload.answers]
        )
    if result is None:
        raise HTTPException(status_code=404, detail="Test not found")
    return result


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
