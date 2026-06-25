from utils.semantic_ranker import rank_paragraphs, best_sentence_for_paragraph
from utils.preprocessing import split_into_sentences


def build_interactive_support(paragraphs: list[str], max_cards: int = 3) -> list[dict]:
    ranked_paragraphs = rank_paragraphs(paragraphs)
    selected_paragraphs = ranked_paragraphs[:max_cards]

    support = []

    for paragraph, score in selected_paragraphs:
        key_sentence = best_sentence_for_paragraph(paragraph)
        sentences = split_into_sentences(paragraph)

        if len(sentences) >= 2:
            summary = f"{sentences[0]} {sentences[-1]}"
        else:
            summary = key_sentence

        explanation = (
            f"This passage highlights an important idea in the text: {key_sentence}"
        )

        guiding_question = (
            "What is the main takeaway from this passage, and how does it connect to the overall topic?"
        )

        support.append({
            "paragraph": paragraph,
            "key_sentence": key_sentence,
            "explanation": explanation,
            "guiding_question": guiding_question,
            "summary": summary,
            "score": round(float(score), 3)
        })

    return support