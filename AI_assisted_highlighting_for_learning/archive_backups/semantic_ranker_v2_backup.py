from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from utils.preprocessing import split_into_sentences


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    if not paragraphs:
        return []

    vectorizer = TfidfVectorizer(stop_words="english")
    paragraph_vectors = vectorizer.fit_transform(paragraphs)

    document_text = " ".join(paragraphs)
    document_vector = vectorizer.transform([document_text])

    similarities = cosine_similarity(paragraph_vectors, document_vector).flatten()

    ranked = list(zip(paragraphs, similarities))
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
    ranked = list(zip(sentences, similarities))
    ranked.sort(key=lambda x: x[1], reverse=True)

    return ranked[0][0]