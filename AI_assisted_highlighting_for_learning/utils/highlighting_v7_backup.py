from utils.learning_logic import choose_learning_sentence, choose_static_paragraphs


def get_static_highlights(paragraphs: list[str], max_highlights: int = 12) -> list[str]:
    selected = choose_static_paragraphs(paragraphs, max_highlights=max_highlights)

    highlights = []
    seen = set()

    for idx, paragraph, score in selected:
        sentence = choose_learning_sentence(paragraph).strip()

        if not sentence:
            continue
        if sentence in seen:
            continue

        seen.add(sentence)
        highlights.append(sentence)

    return highlights
