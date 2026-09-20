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
    shuffle: bool = False


class ImportResult(BaseModel):
    list: ListSummary
    imported: int
    skipped: int = 0


class Card(BaseModel):
    id: int
    term: str
    definition: str
    deck_index: int


class DeckCards(BaseModel):
    list_id: int
    name: str
    deck_size: int
    decks: list[int]
    count: int
    cards: list[Card]


class TestCreate(BaseModel):
    list_id: int
    decks: list[int] | None = None
    question_types: list[str]
    count: int | None = Field(default=None, ge=1)


class TestOption(BaseModel):
    id: str
    text: str


class TestQuestion(BaseModel):
    question_type: str
    prompt: str
    options: list[TestOption]
    correct_option_id: str


class GeneratedTest(BaseModel):
    list_id: int
    name: str
    decks: list[int]
    question_types: list[str]
    questions: list[TestQuestion]


class TestResultCreate(BaseModel):
    list_id: int
    decks: list[int] = []
    question_types: list[str] = []
    total: int = Field(ge=0)
    correct: int = Field(ge=0)


class TestRecord(BaseModel):
    id: int
    list_id: int
    decks: list[int]
    question_types: list[str]
    total: int
    correct: int
    score: float
    created_at: str


class ProgressSummary(BaseModel):
    tests: int
    total: int
    correct: int
    score: float
    best: float
    last_score: float
    last_at: str | None = None


class ListProgress(ProgressSummary):
    list_id: int
    name: str
    deck_size: int
    word_count: int
    deck_count: int


class ProgressOverview(BaseModel):
    overall: ProgressSummary
    lists: list[ListProgress]


class DeckProgress(ProgressSummary):
    deck_index: int
    word_count: int


class ListProgressDetail(BaseModel):
    list: ListProgress
    decks: list[DeckProgress]
    recent: list[TestRecord]


class DeckScorePoint(BaseModel):
    score: float
    correct: int
    total: int
    created_at: str


class DeckProgressEntry(ProgressSummary):
    list_id: int
    list_name: str
    deck_index: int
    word_count: int
    history: list[DeckScorePoint]


class DeckOverview(BaseModel):
    decks: list[DeckProgressEntry]
