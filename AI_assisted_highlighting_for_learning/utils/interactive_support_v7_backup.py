from utils.language import detect_language
from utils.learning_logic import (
    choose_interactive_paragraphs,
    choose_learning_sentence,
    compress_sentence,
    build_summary,
    build_explanation,
    build_guiding_question,
)


def build_interactive_support(paragraphs: list[str], max_cards: int = 4) -> list[dict]:
    selected = choose_interactive_paragraphs(paragraphs, max_cards=max_cards)
    support = []

    for idx, paragraph, score in selected:
        language = detect_language(paragraph)
        key_sentence_raw = choose_learning_sentence(paragraph)
        key_idea = compress_sentence(key_sentence_raw, 16)
        summary = build_summary(paragraph, key_sentence_raw, language)
        explanation = build_explanation(paragraph, key_sentence_raw, language)
        guiding_question = build_guiding_question(paragraph, key_sentence_raw, language)

        support.append({
            "paragraph": paragraph,
            "key_sentence": key_idea,
            "explanation": explanation,
            "guiding_question": guiding_question,
            "summary": summary,
            "score": round(float(score), 3)
        })

    return support
