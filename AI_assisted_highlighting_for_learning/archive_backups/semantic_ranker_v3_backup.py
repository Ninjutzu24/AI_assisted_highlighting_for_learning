from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from utils.preprocessing import split_into_sentences
import re


GENERIC_WORDS = {
    "text", "document", "passage", "section", "topic", "idea", "information"
}


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž']+", text.lower())


def sentence_quality_score(sentence: str, position: int = 0) -> float:
    score = 0.0
    words = tokenize(sentence)
    word_count = len(words)

    if 8 <= word_count <= 24:
        score += 2.0
    elif 25 <= word_count <= 34:
        score += 1.0
    elif word_count < 6:
        score -= 2.5
    elif word_count > 40:
        score -= 2.0

    lowered = sentence.lower()

    # favorizează propozițiile care par mai explicative / definitorii
    cue_phrases = [
        "is", "are", "refers to", "means", "can be", "consists of",
        "includes", "contains", "because", "therefore", "thus"
    ]
    if any(cue in lowered for cue in cue_phrases):
        score += 1.0

    # prima propoziție din paragraf primește un mic bonus
    if position == 0:
        score += 0.8

    # penalizări pentru propoziții prea "de interfață" sau prea descriptive
    bad_patterns = [
        r"\bclick\b", r"\bimage\b", r"\bvideo\b", r"\bfigure\b",
        r"\btable\b", r"\bsource\b", r"\bedit\b", r"\bmenu\b",
        r"\bprivacy\b", r"\bcookie\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    # penalizare ușoară dacă sunt multe cifre / simboluri
    digit_count = sum(ch.isdigit() for ch in sentence)
    if digit_count >= 6:
        score -= 1.2

    return score


def paragraph_quality_score(paragraph: str) -> float:
    lowered = paragraph.lower()
    score = 0.0

    word_count = len(tokenize(paragraph))

    if 35 <= word_count <= 140:
        score += 2.0
    elif word_count < 20:
        score -= 1.5

    bad_patterns = [
        r"\bclick\b", r"\bimage\b", r"\bvideo\b", r"\bfigure\b",
        r"\btable\b", r"\bsource\b", r"\bedit\b", r"\bmenu\b",
        r"\bprivacy\b", r"\bcookie\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    return score


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    if not paragraphs:
        return []

    vectorizer = TfidfVectorizer(stop_words="english")
    paragraph_vectors = vectorizer.fit_transform(paragraphs)

    document_text = " ".join(paragraphs)
    document_vector = vectorizer.transform([document_text])

    similarities = cosine_similarity(paragraph_vectors, document_vector).flatten()

    ranked = []
    for paragraph, sim in zip(paragraphs, similarities):
        total_score = float(sim) + paragraph_quality_score(paragraph)
        ranked.append((paragraph, total_score))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def best_sentence_for_paragraph(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph

    if len(sentences) == 1:
        return sentences[0]

    vectorizer = TfidfVectorizer(stop_words="english")
    sentence_vectors = vectorizer.fit_transform(sentences)
    paragraph_vector = vectorizer.transform([paragraph])

    similarities = cosine_similarity(sentence_vectors, paragraph_vector).flatten()

    ranked = []
    for idx, (sentence, sim) in enumerate(zip(sentences, similarities)):
        total_score = float(sim) * 3.0 + sentence_quality_score(sentence, idx)
        ranked.append((sentence, total_score))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[0][0]
