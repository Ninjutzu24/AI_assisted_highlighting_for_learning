from utils.semantic_ranker import best_sentence_for_paragraph
from utils.preprocessing import split_into_sentences


def choose_learning_sentence(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph.strip()

    if len(sentences) == 1:
        return sentences[0].strip()

    best = best_sentence_for_paragraph(paragraph).strip()
    first = sentences[0].strip()

    # Dacă prima propoziție pare definitorie, o preferăm pentru învățare
    lowered = first.lower()
    definitional_cues = [
        "este", "sunt", "înseamnă", "se numește", "reprezintă",
        "refers to", "means", "is", "are"
    ]
    if any(cue in lowered for cue in definitional_cues) and 6 <= len(first.split()) <= 30:
        return first

    return best


def get_static_highlights(paragraphs: list[str], max_highlights: int = 12) -> list[str]:
    if not paragraphs:
        return []

    highlights = []
    seen = set()

    # Ideea: aproape un highlight per paragraf relevant, în ordinea documentului
    for paragraph in paragraphs:
        if len(highlights) >= max_highlights:
            break

        sentence = choose_learning_sentence(paragraph).strip()

        if not sentence:
            continue

        if sentence in seen:
            continue

        seen.add(sentence)
        highlights.append(sentence)

    return highlights
