from pydantic import BaseModel, Field


class ListSummary(BaseModel):
    id: int
    name: str
    deck_size: int
    word_count: int
    deck_count: int
    created_at: str


class Word(BaseModel):
    id: int
    term: str
    definition: str
    position: int
    deck_index: int


class DeckInfo(BaseModel):
    index: int
    word_count: int


class ListDetail(BaseModel):
    id: int
    name: str
    deck_size: int
    word_count: int
    deck_count: int
    created_at: str
    decks: list[DeckInfo]
    words: list[Word]


class ListCreate(BaseModel):
    name: str = Field(min_length=1)
    deck_size: int = Field(default=20, ge=1)


class ListUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1)
    deck_size: int | None = Field(default=None, ge=1)


class ImportResult(BaseModel):
    list: ListSummary
    imported: int
    skipped: int = 0
