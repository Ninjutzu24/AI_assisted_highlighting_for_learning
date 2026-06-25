from utils.semantic_ranker import rank_paragraphs_with_index, best_sentence_for_paragraph
from utils.preprocessing import split_into_sentences


def choose_learning_sentence(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph.strip()

    if len(sentences) == 1:
        return sentences[0].strip()

    first = sentences[0].strip()
    best = best_sentence_for_paragraph(paragraph).strip()

    lowered = first.lower()
    definitional_cues = [
        "este", "sunt", "înseamnă", "reprezintă", "se numește",
        "is", "are", "means", "refers to", "represents"
    ]

    if any(cue in lowered for cue in definitional_cues) and 6 <= len(first.split()) <= 28:
        return first

    return best


def get_static_highlights(paragraphs: list[str], max_highlights: int = 12) -> list[str]:
    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    total = len(paragraphs)
    target_count = min(max_highlights, max(6, int(total * 0.75)))

    selected = []
    selected_indexes = set()

    # 1. Include obligatoriu introducerea
    first_item = next((item for item in ranked if item[0] == 0), None)
    if first_item is not None:
        selected.append(first_item)
        selected_indexes.add(0)

    # 2. Alege paragrafe bine scorate, dar răspândite
    for idx, paragraph, score in ranked:
        if len(selected) >= target_count:
            break

        if idx in selected_indexes:
            continue

        # evită apropierea excesivă doar la început
        too_close = any(abs(idx - chosen_idx) <= 1 for chosen_idx in selected_indexes)
        if too_close and len(selected) < max(4, target_count // 2):
            continue

        selected.append((idx, paragraph, score))
        selected_indexes.add(idx)

    # 3. Completează dacă nu sunt suficiente
    if len(selected) < target_count:
        for idx, paragraph, score in ranked:
            if len(selected) >= target_count:
                break
            if idx in selected_indexes:
                continue
            selected.append((idx, paragraph, score))
            selected_indexes.add(idx)

    # 4. Ordine naturală în document
    selected.sort(key=lambda x: x[0])

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
