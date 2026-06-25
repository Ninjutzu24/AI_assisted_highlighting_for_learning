from utils.semantic_ranker import rank_paragraphs, best_sentence_for_paragraph


def get_static_highlights(paragraphs: list[str], max_highlights: int = 8) -> list[str]:
    ranked_paragraphs = rank_paragraphs(paragraphs)
    selected_paragraphs = ranked_paragraphs[:max_highlights]

    highlights = []
    seen = set()

    for paragraph, _ in selected_paragraphs:
        sentence = best_sentence_for_paragraph(paragraph).strip()

        if not sentence:
            continue

        if sentence in seen:
            continue

        seen.add(sentence)
        highlights.append(sentence)

    return highlights
