from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from utils.preprocessing import split_into_sentences
import re


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9']+", text.lower())


def sentence_quality_score(sentence: str, position: int = 0) -> float:
    words = tokenize(sentence)
    word_count = len(words)
    score = 0.0

    # propoziții de lungime medie sunt mai bune pentru highlight
    if 8 <= word_count <= 28:
        score += 2.0
    elif 29 <= word_count <= 38:
        score += 1.0
    elif word_count < 6:
        score -= 2.5
    elif word_count > 42:
        score -= 2.0

    # bonus mic pentru prima propoziție din paragraf
    if position == 0:
        score += 0.8

    lowered = sentence.lower()

    # propoziții definitorii / explicative
    cue_phrases = [
        "este", "sunt", "reprezintă", "înseamnă", "se numește",
        "poate fi", "include", "conține", "because", "therefore",
        "means", "refers to", "includes", "contains"
    ]
    if any(cue in lowered for cue in cue_phrases):
        score += 1.0

    # penalizări pentru propoziții de interfață / zgomot
    bad_patterns = [
        r"\bedit\b", r"\bmodificare\b", r"\bsource\b", r"\bsursă\b",
        r"\bprivacy\b", r"\bcookie\b", r"\bmenu\b", r"\bmeniu\b",
        r"\bvideo\b", r"\bimage\b", r"\bimagine\b", r"\bfigure\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    digit_count = sum(ch.isdigit() for ch in sentence)
    if digit_count >= 8:
        score -= 1.0

    return score


def paragraph_quality_score(paragraph: str, index: int = 0) -> float:
    lowered = paragraph.lower()
    words = tokenize(paragraph)
    word_count = len(words)
    score = 0.0

    if 35 <= word_count <= 160:
        score += 2.0
    elif word_count < 20:
        score -= 1.5

    # bonus pentru începutul documentului: introducerea e foarte importantă la învățare
    if index == 0:
        score += 2.0
    elif index == 1:
        score += 1.2
    elif index == 2:
        score += 0.6

    bad_patterns = [
        r"\bedit\b", r"\bmodificare\b", r"\bsource\b", r"\bsursă\b",
        r"\bprivacy\b", r"\bcookie\b", r"\bmenu\b", r"\bmeniu\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    return score


def rank_paragraphs_with_index(paragraphs: list[str]) -> list[tuple[int, str, float]]:
    if not paragraphs:
        return []

    # IMPORTANT: fără stop_words="english", ca să meargă mai bine și pe română / alte limbi
    vectorizer = TfidfVectorizer(ngram_range=(1, 2))
    paragraph_vectors = vectorizer.fit_transform(paragraphs)

    document_text = " ".join(paragraphs)
    document_vector = vectorizer.transform([document_text])

    similarities = cosine_similarity(paragraph_vectors, document_vector).flatten()

    ranked = []
    for idx, (paragraph, sim) in enumerate(zip(paragraphs, similarities)):
        total_score = float(sim) * 3.0 + paragraph_quality_score(paragraph, idx)
        ranked.append((idx, paragraph, total_score))

    ranked.sort(key=lambda x: x[2], reverse=True)
    return ranked


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    return [(paragraph, score) for _, paragraph, score in ranked]


def best_sentence_for_paragraph(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph

    if len(sentences) == 1:
        return sentences[0]

    vectorizer = TfidfVectorizer(ngram_range=(1, 2))
    sentence_vectors = vectorizer.fit_transform(sentences)
    paragraph_vector = vectorizer.transform([paragraph])

    similarities = cosine_similarity(sentence_vectors, paragraph_vector).flatten()

    ranked = []
    for idx, (sentence, sim) in enumerate(zip(sentences, similarities)):
        total_score = float(sim) * 3.0 + sentence_quality_score(sentence, idx)
        ranked.append((sentence, total_score))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[0][0]
