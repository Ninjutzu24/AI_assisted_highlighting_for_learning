import re


def clean_text(text: str) -> str:
    text = re.sub(r"\[[^\]]*\]", "", text)   # scoate [12], [9], etc.
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def is_meaningful_paragraph(paragraph: str) -> bool:
    p = paragraph.strip()

    if len(p) < 80:
        return False

    if len(p.split()) < 12:
        return False

    alpha_count = sum(1 for ch in p if ch.isalpha())
    if alpha_count < 50:
        return False

    return True


def split_into_paragraphs(text: str) -> list[str]:
    raw_paragraphs = [p.strip() for p in text.split("\n") if p.strip()]
    cleaned = []

    for p in raw_paragraphs:
        cp = clean_text(p)
        if is_meaningful_paragraph(cp):
            cleaned.append(cp)

    return cleaned


def split_into_sentences(text: str) -> list[str]:
    text = clean_text(text)
    if not text:
        return []

    sentences = re.split(r'(?<=[.!?])\s+', text)
    sentences = [s.strip() for s in sentences if s.strip()]

    return sentences