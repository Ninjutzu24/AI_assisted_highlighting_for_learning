from sentence_transformers import SentenceTransformer, util
from utils.preprocessing import split_into_sentences
import torch

MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
_model = None


def get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def rank_paragraphs(paragraphs: list[str]) -> list[tuple[str, float]]:
    if not paragraphs:
        return []

    model = get_model()

    document_text = " ".join(paragraphs)
    doc_embedding = model.encode(document_text, convert_to_tensor=True)
    para_embeddings = model.encode(paragraphs, convert_to_tensor=True)

    scores = util.cos_sim(para_embeddings, doc_embedding).squeeze(-1)

    ranked = []
    for paragraph, score in zip(paragraphs, scores):
        ranked.append((paragraph, float(score)))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked


def best_sentence_for_paragraph(paragraph: str) -> str:
    sentences = split_into_sentences(paragraph)
    if not sentences:
        return paragraph

    if len(sentences) == 1:
        return sentences[0]

    model = get_model()

    para_embedding = model.encode(paragraph, convert_to_tensor=True)
    sent_embeddings = model.encode(sentences, convert_to_tensor=True)

    scores = util.cos_sim(sent_embeddings, para_embedding).squeeze(-1)

    ranked = []
    for sentence, score in zip(sentences, scores):
        ranked.append((sentence, float(score)))

    ranked.sort(key=lambda x: x[1], reverse=True)
    return ranked[0][0]