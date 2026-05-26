import re
from utils.preprocessing import split_into_sentences
from utils.language import detect_language
from utils.semantic_ranker import sentence_candidates_for_paragraph, rank_paragraphs_with_index


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


def extract_focus_terms(sentence: str, language: str) -> list[str]:
    words = re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9']+", sentence)
    words = [w for w in words if len(w) >= 5]

    stopwords = ROMANIAN_STOPWORDS if language == "ro" else ENGLISH_STOPWORDS

    result = []
    seen = set()
    for word in words:
        lw = word.lower()
        if lw in stopwords:
            continue
        if lw in seen:
            continue
        seen.add(lw)
        result.append(word)

    return result[:3]


def classify_paragraph_role(paragraph: str, language: str) -> str:
    text = paragraph.lower()

    year_count = len(re.findall(r"\b(1[0-9]{3}|20[0-9]{2})\b", text))
    if year_count >= 1:
        return "chronology"

    if any(cue in text for cue in [
        "deoarece", "pentru că", "astfel", "prin urmare",
        "because", "therefore", "thus", "as a result"
    ]):
        return "cause_effect"

    if any(cue in text for cue in [
        "include", "conține", "tipuri", "categorii", "componente",
        "includes", "contains", "types", "categories", "components"
    ]):
        return "structure"

    if any(cue in text for cue in [
        "este", "sunt", "înseamnă", "reprezintă", "se numește",
        "is", "are", "means", "refers to", "represents"
    ]):
        return "definition"

    if any(cue in text for cue in [
        "de exemplu", "cum ar fi", "for example", "such as"
    ]):
        return "example"

    return "main_idea"


def sentence_role_bonus(sentence: str, role: str, language: str, position: int) -> float:
    lowered = sentence.lower()
    bonus = 0.0

    if position == 0:
        bonus += 0.4

    if role == "definition":
        cues = ["este", "sunt", "înseamnă", "reprezintă", "se numește",
                "is", "are", "means", "refers to", "represents"]
        if any(c in lowered for c in cues):
            bonus += 2.2

    elif role == "cause_effect":
        cues = ["deoarece", "pentru că", "astfel", "prin urmare",
                "because", "therefore", "thus", "as a result"]
        if any(c in lowered for c in cues):
            bonus += 2.0

    elif role == "chronology":
        if re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", lowered):
            bonus += 1.8

    elif role == "structure":
        cues = ["include", "conține", "tipuri", "categorii", "componente",
                "includes", "contains", "types", "categories", "components"]
        if any(c in lowered for c in cues):
            bonus += 1.8

    elif role == "example":
        cues = ["de exemplu", "cum ar fi", "for example", "such as"]
        if any(c in lowered for c in cues):
            bonus += 1.5

    return bonus


def choose_learning_sentence(paragraph: str) -> str:
    language = detect_language(paragraph)
    role = classify_paragraph_role(paragraph, language)
    candidates = sentence_candidates_for_paragraph(paragraph)

    if not candidates:
        return paragraph.strip()

    rescored = []
    for idx, sentence, score, similarity in candidates:
        total = score + sentence_role_bonus(sentence, role, language, idx)
        rescored.append((sentence, total))

    rescored.sort(key=lambda x: x[1], reverse=True)
    return rescored[0][0].strip()


def choose_static_paragraphs(paragraphs: list[str], max_highlights: int = 12) -> list[tuple[int, str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    total = len(paragraphs)
    target_count = min(max_highlights, max(6, int(total * 0.85)))

    # pentru texte scurte sau medii: aproape toate paragrafele
    if total <= 12:
        ordered = sorted(ranked, key=lambda x: x[0])
        return ordered[:target_count]

    selected = []
    selected_indexes = set()

    first_item = next((item for item in ranked if item[0] == 0), None)
    if first_item is not None:
        selected.append(first_item)
        selected_indexes.add(0)

    for idx, paragraph, score in ranked:
        if len(selected) >= target_count:
            break
        if idx in selected_indexes:
            continue

        too_close = any(abs(idx - chosen_idx) <= 1 for chosen_idx in selected_indexes)
        if too_close and len(selected) < target_count - 2:
            continue

        selected.append((idx, paragraph, score))
        selected_indexes.add(idx)

    if len(selected) < target_count:
        for idx, paragraph, score in ranked:
            if len(selected) >= target_count:
                break
            if idx in selected_indexes:
                continue
            selected.append((idx, paragraph, score))
            selected_indexes.add(idx)

    selected.sort(key=lambda x: x[0])
    return selected


def choose_interactive_paragraphs(paragraphs: list[str], max_cards: int = 4) -> list[tuple[int, str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    selected = []
    selected_indexes = set()

    first_item = next((item for item in ranked if item[0] == 0), None)
    if first_item is not None:
        selected.append(first_item)
        selected_indexes.add(0)

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


def build_summary(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)
    terms = extract_focus_terms(key_sentence, language)
    term = terms[0] if terms else None

    if language == "ro":
        if role == "definition":
            return f"Rezumat: paragraful introduce și clarifică ideea de {term}." if term else "Rezumat: paragraful introduce și clarifică un concept."
        if role == "cause_effect":
            return "Rezumat: paragraful explică de ce apare fenomenul și ce efect produce."
        if role == "chronology":
            return "Rezumat: paragraful descrie o etapă sau o evoluție importantă în timp."
        if role == "structure":
            return "Rezumat: paragraful organizează subiectul în elemente sau componente principale."
        if role == "example":
            return "Rezumat: paragraful oferă un exemplu sau un detaliu care face ideea mai ușor de înțeles."
        return "Rezumat: paragraful susține una dintre ideile principale ale textului."

    else:
        if role == "definition":
            return f"Summary: the paragraph introduces and clarifies the idea of {term}." if term else "Summary: the paragraph introduces and clarifies a concept."
        if role == "cause_effect":
            return "Summary: the paragraph explains why something happens and what effect it has."
        if role == "chronology":
            return "Summary: the paragraph describes an important stage or development over time."
        if role == "structure":
            return "Summary: the paragraph organizes the topic into main elements or components."
        if role == "example":
            return "Summary: the paragraph gives an example or detail that makes the idea easier to understand."
        return "Summary: the paragraph supports one of the main ideas of the text."


def build_explanation(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)

    if language == "ro":
        if role == "definition":
            return "Explicație: acest pasaj este important pentru învățare deoarece fixează sensul unui concept de bază."
        if role == "cause_effect":
            return "Explicație: acest pasaj ajută la înțelegerea legăturii dintre cauză și efect din text."
        if role == "chronology":
            return "Explicație: acest pasaj arată o schimbare sau o etapă importantă care trebuie reținută."
        if role == "structure":
            return "Explicație: acest pasaj organizează informația și arată cum este alcătuit subiectul."
        if role == "example":
            return "Explicație: acest pasaj face ideea mai clară printr-un exemplu sau printr-un detaliu concret."
        return "Explicație: acest pasaj exprimă una dintre ideile centrale pe care cititorul trebuie să le rețină."

    else:
        if role == "definition":
            return "Explanation: this passage is important for learning because it fixes the meaning of a core concept."
        if role == "cause_effect":
            return "Explanation: this passage helps the reader understand the cause-and-effect relationship in the text."
        if role == "chronology":
            return "Explanation: this passage shows an important stage or change that should be remembered."
        if role == "structure":
            return "Explanation: this passage organizes the information and shows how the topic is structured."
        if role == "example":
            return "Explanation: this passage makes the idea clearer through an example or a concrete detail."
        return "Explanation: this passage expresses one of the central ideas the reader should keep in mind."


def build_guiding_question(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)
    terms = extract_focus_terms(key_sentence, language)
    term = terms[0] if terms else None

    if language == "ro":
        if role == "definition":
            return f"Cum ai defini {term} pe baza acestui paragraf?" if term else "Cum ai defini ideea prezentată în acest paragraf?"
        if role == "cause_effect":
            return "Ce relație de cauză și efect este descrisă în acest paragraf?"
        if role == "chronology":
            return "Ce etapă sau schimbare importantă este prezentată aici?"
        if role == "structure":
            return "Ce elemente sau componente importante sunt prezentate în acest paragraf?"
        if role == "example":
            return "Cum ajută exemplul din acest paragraf la înțelegerea ideii principale?"
        return "Care este ideea principală pe care trebuie să o reții din acest paragraf?"

    else:
        if role == "definition":
            return f"How would you define {term} based on this paragraph?" if term else "How would you define the idea presented in this paragraph?"
        if role == "cause_effect":
            return "What cause-and-effect relationship is described in this paragraph?"
        if role == "chronology":
            return "What important stage or change is presented here?"
        if role == "structure":
            return "What important elements or components are presented in this paragraph?"
        if role == "example":
            return "How does the example in this paragraph help explain the main idea?"
        return "What is the main idea the reader should remember from this paragraph?"
