import re
import numpy as np
from sentence_transformers import SentenceTransformer
from utils.preprocessing import split_into_sentences

_MODEL = None


def get_model():
    global _MODEL
    if _MODEL is None:
        print("--- [AI] Se încarcă modelul în memoria RAM... Te rog așteaptă ---")
        _MODEL = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        print("--- [AI] Model încărcat cu succes și gata de utilizare! ---")
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
    """
    Scor de calitate pentru o propoziție, fără bonus de poziție exagerat.
    """
    words = tokenize(sentence)
    word_count = len(words)
    score = 0.0

    if 7 <= word_count <= 30:
        score += 2.0
    elif 31 <= word_count <= 42:
        score += 1.0
    elif word_count < 5:
        score -= 2.0
    elif word_count > 48:
        score -= 2.0

    # Bonus mic pentru prima propoziție (topic sentence)
    if position == 0:
        score += 0.3

    lowered = sentence.lower()
    bad_patterns = [
        r"\bedit\b", r"\bmodificare\b", r"\bsource\b", r"\bsursă\b",
        r"\bprivacy\b", r"\bcookie\b", r"\bfigure\b", r"\bimage\b",
        r"\bvideo\b", r"\bmenu\b", r"\bmeniu\b"
    ]
    for pattern in bad_patterns:
        if re.search(pattern, lowered):
            score -= 2.5

    return score


def paragraph_quality_score(paragraph: str, index: int = 0, total: int = 1) -> float:
    """
    Scor de calitate pentru un paragraf.
    IMPORTANT: fără bonus de poziție absolută — distribuția echilibrată
    se face în funcțiile de selecție, nu aici.
    """
    words = tokenize(paragraph)
    word_count = len(words)
    score = 10.0

    if 15 <= word_count <= 150:
        score += 5.0
    elif word_count < 8:
        score -= 3.0

    # Filtru anti-gunoi
    lowered = paragraph.lower()
    trash_patterns = [
        r"\bedit\b", r"\bmodifică\b", r"\bsursă\b", r"\bvezi și\b",
        r"\bbibliografie\b", r"\breferințe\b", r"\blectură suplimentară\b",
        r"\blegături externe\b", r"\bnotă\b", r"\bcoordonate\b",
        r"\bcookie\b", r"\bprivacy\b", r"\bmeniu\b"
    ]
    for pattern in trash_patterns:
        if re.search(pattern, lowered):
            return -100.0

    return score


def _build_global_topic_embedding(paragraphs: list[str], model) -> np.ndarray:
    """
    Construiește un embedding reprezentativ pentru întregul text,
    eșantionând uniform din toate zonele (început, mijloc, final).
    Astfel nicio zonă nu domină scorul de similaritate.
    """
    n = len(paragraphs)
    if n == 0:
        return model.encode([""], normalize_embeddings=True)[0]

    # Alegem maxim 9 paragrafe eșantionate uniform
    num_samples = min(9, n)
    indices = [int(round(i * (n - 1) / (num_samples - 1))) for i in range(num_samples)] if num_samples > 1 else [0]
    # Eliminăm duplicate
    indices = sorted(set(indices))

    sampled_text = " ".join(paragraphs[i] for i in indices)
    return model.encode([sampled_text], normalize_embeddings=True)[0]


def rank_paragraphs_with_index(paragraphs: list[str]) -> list[tuple[int, str, float]]:
    """
    Returnează paragrafele cu scor semantic, sortate descrescător.
    Scorul reflectă relevanța față de tema GLOBALĂ a textului,
    fără bias spre început sau final.
    """
    if not paragraphs:
        return []

    model = get_model()
    paragraph_embeddings = model.encode(paragraphs, normalize_embeddings=True)

    # Topic global — eșantionat uniform din tot textul
    topic_embedding = _build_global_topic_embedding(paragraphs, model)

    ranked = []
    for idx, (paragraph, emb) in enumerate(zip(paragraphs, paragraph_embeddings)):
        similarity = cosine(emb, topic_embedding)
        q_score = paragraph_quality_score(paragraph, idx, len(paragraphs))
        # Similaritatea contribuie cu 2.5x (importantă dar nu dominantă)
        score = similarity * 2.5 + q_score
        ranked.append((idx, paragraph, score))

    ranked.sort(key=lambda x: x[2], reverse=True)
    return ranked


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    ranked = rank_paragraphs_with_index(paragraphs)
    return [(paragraph, score) for _, paragraph, score in ranked]


def sentence_candidates_for_paragraph(paragraph: str) -> list[tuple[int, str, float, float]]:
    """
    Returnează propozițiile unui paragraf sortate după relevanță față de paragraf.
    """
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return []

    if len(sentences) == 1:
        return [(0, sentences[0].strip(), 10.0, 1.0)]

    model = get_model()
    sentence_embeddings = model.encode(sentences, normalize_embeddings=True)
    paragraph_embedding = model.encode([paragraph], normalize_embeddings=True)[0]

    ranked = []
    for idx, (sentence, emb) in enumerate(zip(sentences, sentence_embeddings)):
        similarity = cosine(emb, paragraph_embedding)
        score = similarity * 4.0 + sentence_quality_score(sentence, idx)
        ranked.append((idx, sentence.strip(), score, similarity))

    ranked.sort(key=lambda x: x[2], reverse=True)
    return ranked


def best_sentence_for_paragraph(paragraph: str) -> str:
    ranked = sentence_candidates_for_paragraph(paragraph)
    if not ranked:
        return paragraph.strip()
    return ranked[0][1]


get_model()