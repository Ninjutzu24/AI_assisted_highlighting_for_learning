from utils.semantic_ranker import rank_paragraphs_with_index, best_sentence_for_paragraph
from utils.preprocessing import split_into_sentences
from utils.language import detect_language
import re


ROMANIAN_STOPWORDS = {
    "acest", "aceasta", "aceste", "acestea", "acei", "acele", "care", "cum",
    "este", "sunt", "fi", "fie", "din", "de", "la", "în", "si", "și", "cu",
    "pentru", "prin", "după", "mai", "mult", "foarte", "sau", "iar", "dar",
    "un", "o", "unei", "unui", "niște", "al", "a", "ai", "ale", "pe", "se",
    "ca", "că", "ce", "doar", "tot", "toate", "toată", "toți", "toate",
    "fost", "fiind", "poate", "pot", "are", "au", "era", "erau", "înainte",
    "după", "acolo", "aici", "această", "acestui", "acestei", "text", "pasaj"
}

ENGLISH_STOPWORDS = {
    "this", "that", "these", "those", "the", "a", "an", "of", "to", "in",
    "on", "for", "with", "by", "from", "and", "or", "but", "is", "are",
    "was", "were", "be", "been", "being", "as", "at", "it", "its", "into",
    "about", "can", "could", "may", "might", "text", "passage"
}


def compress_sentence(sentence: str, max_words: int = 16) -> str:
    sentence = sentence.strip()
    parts = re.split(r",|;|—|-", sentence)
    first = parts[0].strip()

    if 5 <= len(first.split()) <= max_words:
        return first

    words = sentence.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]).rstrip(",;:-") + "..."
    return sentence


def short_summary(paragraph: str, key_sentence: str, language: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return compress_sentence(key_sentence, 20)

    if len(sentences) == 1:
        return compress_sentence(sentences[0], 20)

    first = sentences[0].strip()
    if first != key_sentence:
        combined = f"{first} {key_sentence}"
    else:
        combined = key_sentence

    words = combined.split()
    if len(words) > 26:
        combined = " ".join(words[:26]) + "..."

    return combined


def make_explanation(paragraph: str, key_sentence: str, language: str) -> str:
    lowered = paragraph.lower()

    if language == "ro":
        if any(cue in lowered for cue in ["este", "sunt", "înseamnă", "se numește", "reprezintă"]):
            return "Acest pasaj definește sau clarifică un concept important."
        if any(cue in lowered for cue in ["deoarece", "pentru că", "astfel", "prin urmare"]):
            return "Acest pasaj explică o relație de cauză, efect sau consecință."
        if re.search(r"\b\d{3,4}\b", lowered):
            return "Acest pasaj oferă un fapt, o valoare sau un reper important."
        return "Acest pasaj exprimă una dintre ideile centrale ale textului."

    else:
        if any(cue in lowered for cue in ["is", "are", "means", "refers to", "represents"]):
            return "This passage defines or clarifies an important concept."
        if any(cue in lowered for cue in ["because", "therefore", "thus", "as a result"]):
            return "This passage explains a cause, effect, or consequence."
        if re.search(r"\b\d{3,4}\b", lowered):
            return "This passage provides an important fact, value, or reference point."
        return "This passage expresses one of the central ideas of the text."


def extract_focus_term(sentence: str, language: str) -> str | None:
    words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9']+", sentence)
    words = [w for w in words if len(w) >= 5]

    stopwords = ROMANIAN_STOPWORDS if language == "ro" else ENGLISH_STOPWORDS

    for word in words:
        if word.lower() not in stopwords:
            return word
    return None


def make_guiding_question(key_sentence: str, language: str) -> str:
    term = extract_focus_term(key_sentence, language)

    if language == "ro":
        if term:
            return f"Ce spune acest pasaj despre {term}?"
        return "Care este ideea principală pe care trebuie să o reții din acest pasaj?"
    else:
        if term:
            return f"What does this passage say about {term}?"
        return "What is the main idea the reader should remember from this passage?"


def choose_interactive_paragraphs(paragraphs: list[str], max_cards: int = 4) -> list[tuple[int, str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    selected = []
    selected_indexes = set()

    # Include începutul, dacă există
    first_item = next((item for item in ranked if item[0] == 0), None)
    if first_item is not None:
        selected.append(first_item)
        selected_indexes.add(0)

    # Adaugă restul paragrafelor bine clasate, dar răspândite
    for idx, paragraph, score in ranked:
        if len(selected) >= max_cards:
            break

        if idx in selected_indexes:
            continue

        too_close = any(abs(idx - chosen_idx) <= 1 for chosen_idx in selected_indexes)
        if too_close:
            continue

        selected.append((idx, paragraph, score))
        selected_indexes.add(idx)

    # Completează dacă nu sunt destule
    if len(selected) < max_cards:
        for idx, paragraph, score in ranked:
            if len(selected) >= max_cards:
                break
            if idx in selected_indexes:
                continue
            selected.append((idx, paragraph, score))
            selected_indexes.add(idx)

    selected.sort(key=lambda x: x[0])
    return selected


def build_interactive_support(paragraphs: list[str], max_cards: int = 4) -> list[dict]:
    selected_paragraphs = choose_interactive_paragraphs(paragraphs, max_cards=max_cards)
    support = []

    for idx, paragraph, score in selected_paragraphs:
        language = detect_language(paragraph)
        key_sentence_raw = best_sentence_for_paragraph(paragraph)
        key_idea = compress_sentence(key_sentence_raw, 16)
        summary = short_summary(paragraph, key_sentence_raw, language)
        explanation = make_explanation(paragraph, key_sentence_raw, language)
        guiding_question = make_guiding_question(key_sentence_raw, language)

        support.append({
            "paragraph": paragraph,
            "key_sentence": key_idea,
            "explanation": explanation,
            "guiding_question": guiding_question,
            "summary": summary,
            "score": round(float(score), 3)
        })

    return support
