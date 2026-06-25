from utils.semantic_ranker import rank_paragraphs, best_sentence_for_paragraph


def get_static_highlights(paragraphs: list[str], max_highlights: int = 5) -> list[str]:
    ranked_paragraphs = rank_paragraphs(paragraphs)
    selected_paragraphs = ranked_paragraphs[:max_highlights]

    highlights = []
    for paragraph, _ in selected_paragraphs:
        sentence = best_sentence_for_paragraph(paragraph)
        if sentence not in highlights:
            highlights.append(sentence)

    return highlights