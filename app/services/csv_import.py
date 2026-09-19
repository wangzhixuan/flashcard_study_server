from __future__ import annotations

import csv
import io

HEADER_KEYWORDS = {
    "term",
    "word",
    "vocab",
    "vocabulary",
    "front",
    "definition",
    "def",
    "meaning",
    "translation",
    "back",
    "answer",
}


def _looks_like_header(row: list[str]) -> bool:
    if len(row) < 2:
        return False
    first, second = row[0].strip().lower(), row[1].strip().lower()
    return first in HEADER_KEYWORDS and second in HEADER_KEYWORDS


def parse_csv(
    text: str,
    has_header: bool | None = None,
) -> list[tuple[str, str]]:
    """Parse a two-column vocabulary CSV into (term, definition) pairs.

    Delimiter is sniffed (comma, semicolon, tab, pipe). ``has_header`` forces
    header handling; ``None`` auto-detects.
    """
    text = text.lstrip("\ufeff")
    if not text.strip():
        return []

    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel

    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(cell.strip() for cell in r)]
    if not rows:
        return []

    if has_header is None:
        has_header = _looks_like_header(rows[0])
    data = rows[1:] if has_header else rows

    pairs: list[tuple[str, str]] = []
    for row in data:
        if len(row) < 2:
            continue
        term = row[0].strip()
        definition = ",".join(cell.strip() for cell in row[1:]).strip()
        if term or definition:
            pairs.append((term, definition))
    return pairs
