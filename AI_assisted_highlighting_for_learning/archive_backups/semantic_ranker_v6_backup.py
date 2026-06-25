import re
import numpy as np
from sentence_transformers import SentenceTransformer
from utils.preprocessing import split_into_sentences


_MODEL = None


def get_model():
    global _MODEL
    if _MODEL is None:
        _MODEL = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    return _MODEL


def cosine(a, b) -> float:
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)

    a_norm = np.linalg.norm(a)
    b_norm = np.linalg.norm(b)

    if a_norm == 0 or b_norm == 0:
        return 0.0

    return float(np.dot(a, b) / (a_norm * b_norm))


def tokenize(text: str) -> list[str]:
    return re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿĀ-ž0-9']+", text.lower())


def sentence_quality_score(sentence: str, position: int = 0) -> float:
    words = tokenize(sentence)
    word_count = len(words)
    score = 0.0

    if 7 <= word_count <= 26:
        score += 2.0
    elif 27 <= word_count <= 36:
        score += 1.0
    elif word_count < 5:
        score -= 2.0
    elif word_count > 42:
        score -= 2.0

    if position == 0:
        score += 0.7

    lowered = sentence.lower()
    cue_phrases = [
        "este", "sunt", "înseamnă", "reprezintă", "se numește",
        "poate fi", "include", "conține", "because", "means",
        "refers to", "represents", "is", "are", "includes", "contains"
    ]
    if any(cue in lowered for cue in cue_phrases):
        score += 1.0

    bad_patterns = [
        r"\bedit\b", r"\bmodificare\b", r"\bsource\b", r"\bsursă\b",
        r"\bprivacy\b", r"\bcookie\b", r"\bfigure\b", r"\bimage\b",
        r"\bvideo\b", r"\bmeniu\b", r"\bmenu\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    return score


def paragraph_quality_score(paragraph: str, index: int = 0, total: int = 1) -> float:
    words = tokenize(paragraph)
    word_count = len(words)
    score = 0.0

    if 25 <= word_count <= 170:
        score += 2.0
    elif word_count < 15:
        score -= 1.5

    # bonus de început: introducerea este importantă pentru învățare
    if index == 0:
        score += 2.0
    elif index == 1:
        score += 1.2
    elif index == 2:
        score += 0.6

    # mic bonus și pentru zona mediană, ca să nu luăm doar începutul
    if total >= 6:
        middle = total // 2
        if abs(index - middle) <= 1:
            score += 0.4

    lowered = paragraph.lower()
    bad_patterns = [
        r"\bedit\b", r"\bmodificare\b", r"\bsursă\b", r"\bsource\b",
        r"\bprivacy\b", r"\bcookie\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    return score


def encode_texts(texts: list[str]):
    model = get_model()
    return model.encode(texts, normalize_embeddings=True)


def rank_paragraphs_with_index(paragraphs: list[str]) -> list[tuple[int, str, float]]:
    if not paragraphs:
        return []

    model = get_model()
    paragraph_embeddings = model.encode(paragraphs, normalize_embeddings=True)
    document_embedding = model.encode([" ".join(paragraphs)], normalize_embeddings=True)[0]

    ranked = []
    total = len(paragraphs)

    for idx, (paragraph, emb) in enumerate(zip(paragraphs, paragraph_embeddings)):
        similarity = cosine(emb, document_embedding)
        score = similarity * 4.0 + paragraph_quality_score(paragraph, idx, total)
        ranked.append((idx, paragraph, score))

    ranked.sort(key=lambda x: x[2], reverse=True)
    return ranked


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    return [(paragraph, score) for _, paragraph, score in ranked]


def best_sentence_for_paragraph(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph.strip()

    if len(sentences) == 1:
        return sentences[0].strip()

    model = get_model()
    sentence_embeddings = model.encode(sentences, normalize_embeddings=True)
    paragraph_embedding = model.encode([paragraph], normalize_embeddings=True)[0]

    ranked = []
    for idx, (sentence, emb) in enumerate(zip(sentences, sentence_embeddings)):
        similarity = cosine(emb, paragraph_embedding)
        score = similarity * 4.0 + sentence_quality_score(sentence, idx)
        ranked.append((sentence, score))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[0][0].strip()
