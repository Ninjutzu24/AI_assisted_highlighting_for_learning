import re
from utils.language import detect_language
from utils.preprocessing import split_into_sentences
from utils.semantic_ranker import (
    sentence_candidates_for_paragraph,
    rank_paragraphs_with_index,
)


ROMANIAN_STOPWORDS = {
    "acest", "aceasta", "aceste", "acestea", "care", "cum", "este", "sunt",
    "din", "de", "la", "în", "si", "și", "cu", "pentru", "prin", "după",
    "mai", "mult", "foarte", "sau", "iar", "dar", "un", "o", "unei", "unui",
    "al", "a", "ai", "ale", "pe", "se", "ca", "că", "ce", "fost", "fiind",
    "poate", "pot", "are", "au", "era", "erau", "text", "pasaj", "despre",
    "aceea", "acela", "acelor", "acestei", "acestui"
}

ENGLISH_STOPWORDS = {
    "this", "that", "these", "those", "the", "a", "an", "of", "to", "in",
    "on", "for", "with", "by", "from", "and", "or", "but", "is", "are",
    "was", "were", "be", "been", "being", "as", "at", "it", "its", "into",
    "about", "can", "could", "may", "might", "text", "passage", "there",
    "their", "them", "than"
}


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9']+", text)


def compress_sentence(sentence: str, max_words: int = 18) -> str:
    sentence = sentence.strip()
    if not sentence:
        return sentence
    parts = re.split(r"[;:—-]", sentence)
    first = parts[0].strip()
    if 6 <= len(first.split()) <= max_words:
        return first
    words = sentence.split()
    if len(words) > max_words:
        return " ".join(words[:max_words]).rstrip(",;:-") + "..."
    return sentence


def classify_paragraph_role(paragraph: str, language: str) -> str:
    text = paragraph.lower()

    if re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", text):
        return "chronology"

    if any(cue in text for cue in [
        "deoarece", "pentru că", "astfel", "prin urmare", "rezultă",
        "because", "therefore", "thus", "as a result", "leads to", "results in"
    ]):
        return "cause_effect"

    if any(cue in text for cue in [
        "include", "conține", "cuprinde", "tipuri", "categorii", "componente",
        "includes", "contains", "types", "categories", "components", "consists of"
    ]):
        return "structure"

    if any(cue in text for cue in [
        "de exemplu", "cum ar fi", "de pildă",
        "for example", "such as", "for instance"
    ]):
        return "example"

    if any(cue in text for cue in [
        "este", "sunt", "înseamnă", "reprezintă", "se numește", "se definește",
        "is", "are", "means", "refers to", "represents", "is defined as"
    ]):
        return "definition"

    return "main_idea"


def sentence_role_bonus(sentence: str, role: str, language: str, position: int) -> float:
    lowered = sentence.lower()
    bonus = 0.0

    if position == 0:
        bonus += 0.5

    if role == "definition":
        cues = [
            "este", "sunt", "înseamnă", "reprezintă", "se numește", "se definește",
            "is", "are", "means", "refers to", "represents", "is defined as"
        ]
        if any(c in lowered for c in cues):
            bonus += 2.5

    elif role == "cause_effect":
        cues = [
            "deoarece", "pentru că", "astfel", "prin urmare", "rezultă",
            "because", "therefore", "thus", "as a result", "leads to", "results in"
        ]
        if any(c in lowered for c in cues):
            bonus += 2.2

    elif role == "chronology":
        if re.search(r"\b(1[0-9]{3}|20[0-9]{2})\b", lowered):
            bonus += 2.0

    elif role == "structure":
        cues = [
            "include", "conține", "cuprinde", "tipuri", "categorii", "componente",
            "includes", "contains", "types", "categories", "components", "consists of"
        ]
        if any(c in lowered for c in cues):
            bonus += 2.0

    elif role == "example":
        cues = [
            "de exemplu", "cum ar fi", "de pildă",
            "for example", "such as", "for instance"
        ]
        if any(c in lowered for c in cues):
            bonus += 1.5

    word_count = len(sentence.split())
    if word_count < 5:
        bonus -= 1.5
    elif word_count > 42:
        bonus -= 1.2

    return bonus


def choose_learning_sentences(paragraph: str, max_sentences: int = 2) -> list[str]:
    """
    Returnează cele mai bune propoziții dintr-un paragraf,
    distribuite echilibrat (prima jumătate + a doua jumătate).
    """
    language = detect_language(paragraph)
    role = classify_paragraph_role(paragraph, language)
    candidates = sentence_candidates_for_paragraph(paragraph)

    if not candidates:
        return [paragraph.strip()]

    if len(candidates) <= 1:
        return [candidates[0][1].strip()]

    rescored = []
    for idx, sentence, score, similarity in candidates:
        total = score + sentence_role_bonus(sentence, role, language, idx)
        rescored.append((idx, sentence, total))

    rescored.sort(key=lambda x: x[2], reverse=True)

    mid = len(rescored) // 2
    first_half = [x for x in rescored if x[0] < mid]
    second_half = [x for x in rescored if x[0] >= mid]

    best_first = first_half[0] if first_half else rescored[0]
    best_second = second_half[0] if second_half else None

    selected = [best_first[1].strip()]
    if best_second and best_second[0] != best_first[0]:
        selected.append(best_second[1].strip())

    return selected



def _divide_into_zones(total: int, num_zones: int) -> list[tuple[int, int]]:
    """
    Împarte intervalul [0, total) în num_zones zone cât mai egale.
    Returnează lista de (start_idx, end_idx) pentru fiecare zonă.
    """
    zones = []
    zone_size = total / num_zones
    for z in range(num_zones):
        start = int(round(z * zone_size))
        end = int(round((z + 1) * zone_size))
        end = min(end, total)
        if start < end:
            zones.append((start, end))
    return zones


def _best_in_zone(
    ranked_items: list[tuple[int, str, float]],
    start: int,
    end: int,
    used: set,
    n: int = 1
) -> list[tuple[int, str, float]]:
    """
    Returnează primele n paragrafe cu cel mai mare scor din zona [start, end),
    care nu sunt deja folosite.
    """
    zone_items = [
        item for item in ranked_items
        if start <= item[0] < end and item[0] not in used and item[2] > -50
    ]
    zone_items.sort(key=lambda x: x[2], reverse=True)
    return zone_items[:n]


def choose_static_paragraphs(
    paragraphs: list[str],
    max_highlights: int = None
) -> list[tuple[int, str, float]]:
    """
    Selectează paragrafe pentru highlight static, cu distribuție GARANTAT echilibrată.

    Strategie:
    1. Împarte textul în zone egale (proporțional cu lungimea textului).
    2. Din fiecare zonă alege obligatoriu cel puțin `min_per_zone` paragrafe.
    3. Completează până la max_highlights cu cele mai bune rămase din orice zonă.
    4. Rezultatul final e sortat după poziția originală.

    Astfel NICIODATĂ nu se poate întâmpla ca o zonă să fie complet ignorată.
    """
    if not paragraphs:
        return []

    total_p = len(paragraphs)

    if max_highlights is None:
        max_highlights = max(10, min(40, int(total_p * 0.30)))

    ranked_all = rank_paragraphs_with_index(paragraphs)
    if not ranked_all:
        return []

    ranked = [p for p in ranked_all if p[2] > -50]
    if len(ranked) < max(5, total_p // 10):
        ranked = [p for p in ranked_all if p[2] > -100]

    
    num_zones = max(4, min(12, total_p // 4))
    zones = _divide_into_zones(total_p, num_zones)

    
    min_per_zone = max(1, max_highlights // num_zones)

    selected = []
    used_indices = set()

    
    for start, end in zones:
        best = _best_in_zone(ranked, start, end, used_indices, n=min_per_zone)
        for item in best:
            selected.append(item)
            used_indices.add(item[0])

  
    for item in ranked:
        if len(selected) >= max_highlights:
            break
        if item[0] not in used_indices:
            selected.append(item)
            used_indices.add(item[0])

    
    selected.sort(key=lambda x: x[0])
    return selected


def choose_interactive_paragraphs(
    paragraphs: list[str],
    max_cards: int = 4
) -> list[tuple[int, str, float]]:
    """
    Selectează paragrafe pentru carduri interactive.
    Garantează reprezentare din: început, mijloc, final + cele mai bune rămase.
    """
    if not paragraphs:
        return []

    ranked = rank_paragraphs_with_index(paragraphs)
    if not ranked:
        return []

    total = len(paragraphs)
    selected = []
    used = set()

    
    zones = _divide_into_zones(total, max_cards)
    for start, end in zones:
        best = _best_in_zone(ranked, start, end, used, n=1)
        for item in best:
            selected.append(item)
            used.add(item[0])

    
    for item in ranked:
        if len(selected) >= max_cards:
            break
        if item[0] not in used:
            selected.append(item)
            used.add(item[0])

    selected.sort(key=lambda x: x[0])
    return selected[:max_cards]





def extract_focus_terms(sentence: str, language: str) -> list[str]:
    words = tokenize(sentence)
    stopwords = ROMANIAN_STOPWORDS if language == "ro" else ENGLISH_STOPWORDS

    result = []
    seen = set()

    for word in words:
        lw = word.lower()
        if len(lw) < 5:
            continue
        if lw in stopwords:
            continue
        if lw in seen:
            continue
        seen.add(lw)
        result.append(word)

    return result[:3]


def build_summary(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)
    focus_terms = extract_focus_terms(key_sentence, language)

    if language == "ro":
        if role == "definition":
            return "Acest paragraf explică sensul unui concept important."
        if role == "structure":
            return "Acest paragraf organizează subiectul în elemente sau categorii importante."
        if role == "chronology":
            return "Acest paragraf prezintă o etapă sau o evoluție importantă în timp."
        if role == "cause_effect":
            return "Acest paragraf arată de ce apare un fenomen și ce efect are."
        if role == "example":
            return "Acest paragraf folosește un exemplu sau un detaliu pentru a face ideea mai clară."
        if focus_terms:
            return f"Acest paragraf susține o idee importantă despre {focus_terms[0]}."
        return "Acest paragraf susține una dintre ideile importante ale textului."
    else:
        if role == "definition":
            return "This paragraph explains the meaning of an important concept."
        if role == "structure":
            return "This paragraph organizes the topic into important elements or categories."
        if role == "chronology":
            return "This paragraph presents an important stage or development over time."
        if role == "cause_effect":
            return "This paragraph shows why something happens and what effect it has."
        if role == "example":
            return "This paragraph uses an example or detail to make the idea clearer."
        if focus_terms:
            return f"This paragraph supports an important idea about {focus_terms[0]}."
        return "This paragraph supports one of the important ideas in the text."


def build_explanation(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)
    focus_terms = extract_focus_terms(key_sentence, language)

    if language == "ro":
        if role == "definition":
            return "Acest paragraf este util pentru învățare deoarece stabilește clar ce înseamnă conceptul prezentat."
        if role == "structure":
            return "Acest paragraf este util pentru învățare deoarece arată cum este organizat subiectul și ce componente trebuie reținute."
        if role == "chronology":
            return "Acest paragraf este util pentru învățare deoarece evidențiază o schimbare, o etapă sau o evoluție importantă."
        if role == "cause_effect":
            return "Acest paragraf este util pentru învățare deoarece explică legătura dintre cauză și efect în cadrul subiectului."
        if role == "example":
            return "Acest paragraf este util pentru învățare deoarece transformă ideea generală într-un exemplu mai ușor de înțeles."
        if focus_terms:
            return f"Acest paragraf este util pentru învățare deoarece scoate în evidență o idee centrală legată de {focus_terms[0]}."
        return "Acest paragraf este util pentru învățare deoarece exprimă una dintre ideile centrale ale textului."
    else:
        if role == "definition":
            return "This paragraph is useful for learning because it clearly establishes the meaning of the concept being discussed."
        if role == "structure":
            return "This paragraph is useful for learning because it shows how the topic is organized and which components matter."
        if role == "chronology":
            return "This paragraph is useful for learning because it highlights an important stage, change, or development."
        if role == "cause_effect":
            return "This paragraph is useful for learning because it explains the relationship between cause and effect."
        if role == "example":
            return "This paragraph is useful for learning because it turns a general idea into a clearer example."
        if focus_terms:
            return f"This paragraph is useful for learning because it highlights a central idea related to {focus_terms[0]}."
        return "This paragraph is useful for learning because it expresses one of the central ideas in the text."


def build_guiding_question(paragraph: str, key_sentence: str, language: str) -> str:
    role = classify_paragraph_role(paragraph, language)
    focus_terms = extract_focus_terms(key_sentence, language)
    term = focus_terms[0] if focus_terms else None

    if language == "ro":
        if role == "definition":
            return f"Cum ai defini {term} pe baza acestui paragraf?" if term else "Cum ai defini ideea principală din acest paragraf?"
        if role == "structure":
            return "Ce elemente sau categorii importante sunt prezentate aici?"
        if role == "chronology":
            return "Ce schimbare sau etapă importantă trebuie reținută din acest paragraf?"
        if role == "cause_effect":
            return "Care este relația de cauză și efect explicată aici?"
        if role == "example":
            return "Cum ajută exemplul din acest paragraf la înțelegerea ideii principale?"
        return "Care este ideea principală pe care trebuie să o reții din acest paragraf?"
    else:
        if role == "definition":
            return f"How would you define {term} based on this paragraph?" if term else "How would you define the main idea in this paragraph?"
        if role == "structure":
            return "What important elements or categories are presented here?"
        if role == "chronology":
            return "What important stage or change should be remembered from this paragraph?"
        if role == "cause_effect":
            return "What cause-and-effect relationship is explained here?"
        if role == "example":
            return "How does the example in this paragraph help explain the main idea?"
        return "What is the main idea the reader should remember from this paragraph?"