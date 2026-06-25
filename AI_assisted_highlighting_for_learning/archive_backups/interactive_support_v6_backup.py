import re
from utils.semantic_ranker import rank_paragraphs_with_index, best_sentence_for_paragraph
from utils.preprocessing import split_into_sentences
from utils.language import detect_language


ROMANIAN_STOPWORDS = {
    "acest", "aceasta", "aceste", "acestea", "care", "cum", "este", "sunt",
    "din", "de", "la", "în", "si", "și", "cu", "pentru", "prin", "după",
    "mai", "mult", "foarte", "sau", "iar", "dar", "un", "o", "unei", "unui",
    "al", "a", "ai", "ale", "pe", "se", "ca", "că", "ce", "fost", "fiind",
    "poate", "pot", "are", "au", "era", "erau", "text", "pasaj", "despre"
}

ENGLISH_STOPWORDS = {
    "this", "that", "these", "those", "the", "a", "an", "of", "to", "in",
    "on", "for", "with", "by", "from", "and", "or", "but", "is", "are",
    "was", "were", "be", "been", "being", "as", "at", "it", "its", "into",
    "about", "can", "could", "may", "might", "text", "passage", "about"
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


def short_summary(paragraph: str, key_sentence: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return compress_sentence(key_sentence, 22)

    first = sentences[0].strip()
    if first == key_sentence:
        return compress_sentence(first, 22)

    summary = f"{first} {key_sentence}"
    words = summary.split()
    if len(words) > 30:
        summary = " ".join(words[:30]) + "..."
    return summary


def infer_role(paragraph: str, language: str) -> str:
    lowered = paragraph.lower()

    if language == "ro":
        if any(cue in lowered for cue in ["este", "sunt", "înseamnă", "reprezintă", "se numește"]):
            return "definește sau clarifică un concept"
        if any(cue in lowered for cue in ["include", "conține", "tipuri", "categorii", "clase"]):
            return "prezintă o clasificare sau o structură"
        if any(cue in lowered for cue in ["deoarece", "pentru că", "astfel", "prin urmare"]):
            return "explică o relație de cauză sau efect"
        if re.search(r"\b\d{3,4}\b", lowered):
            return "oferă un fapt, un reper sau o valoare importantă"
        return "susține una dintre ideile centrale ale textului"

    else:
        if any(cue in lowered for cue in ["is", "are", "means", "refers to", "represents"]):
            return "defines or clarifies a concept"
        if any(cue in lowered for cue in ["includes", "contains", "types", "categories", "classes"]):
            return "presents a classification or structure"
        if any(cue in lowered for cue in ["because", "therefore", "thus", "as a result"]):
            return "explains a cause-and-effect relationship"
        if re.search(r"\b\d{3,4}\b", lowered):
            return "provides an important fact, reference point, or value"
        return "supports one of the central ideas of the text"


def make_explanation(paragraph: str, key_sentence: str, language: str) -> str:
    role = infer_role(paragraph, language)

    if language == "ro":
        return f"Pe scurt, acest paragraf {role} și ajută cititorul să înțeleagă de ce această idee este importantă în contextul textului."
    return f"In short, this paragraph {role} and helps the reader understand why this idea matters in the context of the text."


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
            return f"Cum ai explica, în cuvintele tale, ideea legată de {term} din acest paragraf?"
        return "Cum ai explica, în cuvintele tale, ideea principală din acest paragraf?"
    else:
        if term:
            return f"How would you explain, in your own words, the idea related to {term} in this paragraph?"
        return "How would you explain, in your own words, the main idea of this paragraph?"


def choose_interactive_paragraphs(paragraphs: list[str], max_cards: int = 4) -> list[tuple[int, str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    selected = []
    selected_indexes = set()

    # obligatoriu începutul
    first_item = next((item for item in ranked if item[0] == 0), None)
    if first_item is not None:
        selected.append(first_item)
        selected_indexes.add(0)

    # restul, distribuite în document
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
    selected = choose_interactive_paragraphs(paragraphs, max_cards=max_cards)
    support = []

    for idx, paragraph, score in selected:
        language = detect_language(paragraph)
        key_sentence_raw = best_sentence_for_paragraph(paragraph)
        key_idea = compress_sentence(key_sentence_raw, 16)
        summary = short_summary(paragraph, key_sentence_raw)
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
