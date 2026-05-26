from utils.learning_logic import (
    choose_learning_sentences,
    _divide_into_zones,
    _best_in_zone,
)
from utils.semantic_ranker import rank_paragraphs_with_index
import re

# ─────────────────────────────────────────────
# CONSTANTE CENTRALE — ajustează după nevoie
# ─────────────────────────────────────────────
MIN_HIGHLIGHTS = 25     # niciodată sub acest număr, indiferent de text
MAX_HIGHLIGHTS = 120     # plafon pentru texte foarte lungi
COVERAGE_RATIO = 0.65    # vrem ~65% din paragrafe acoperite → ~24 pentru 37 paragrafe


def get_static_highlights(
    paragraphs: list[str],
    max_total_highlights: int = None
) -> list[str]:
    """
    Returnează propoziții de subliniat, GARANTAT distribuite echilibrat.

    Pasul 1 — Garanție de acoperire:
        Împarte textul în zone egale și ia OBLIGATORIU cel puțin un
        highlight din fiecare zonă, indiferent de scor.

    Pasul 2 — Completare controlată:
        Adaugă highlights suplimentare distribuindu-le per zonă,
        cu un plafon ca să nu se acumuleze într-un singur loc.

    Pasul 3 — Fallback global:
        Dacă tot suntem sub MIN_HIGHLIGHTS, adăugăm fără restricții
        până atingem minimul garantat.
    """
    if not paragraphs:
        print("[DEBUG static_highlights] Nu există paragrafe de procesat.")
        return []

    total_p = len(paragraphs)
    print(f"[DEBUG static_highlights] Total paragrafe primite: {total_p}")

    # ── Target de highlights ──────────────────────────────────────────
    if max_total_highlights is not None:
        target = max(MIN_HIGHLIGHTS, max_total_highlights)
    else:
        target = max(MIN_HIGHLIGHTS, min(MAX_HIGHLIGHTS, int(total_p * COVERAGE_RATIO)))

    print(f"[DEBUG static_highlights] Target highlights: {target}")

    # ── Ranking semantic ──────────────────────────────────────────────
    ranked_all = rank_paragraphs_with_index(paragraphs)
    if not ranked_all:
        print("[DEBUG static_highlights] rank_paragraphs_with_index a returnat gol.")
        return []

    # Filtrare: scoatem doar gunoiul clar (< -50)
    ranked = [item for item in ranked_all if item[2] > -50]
    print(f"[DEBUG static_highlights] Paragrafe după filtrare scor > -50: {len(ranked)}")

    # Relaxăm dacă au rămas prea puține
    if len(ranked) < MIN_HIGHLIGHTS // 2:
        ranked = [item for item in ranked_all if item[2] > -100]
        print(f"[DEBUG static_highlights] Relaxat la > -100: {len(ranked)}")

    # Dacă tot nu sunt destule, luăm tot ce există
    if len(ranked) < 3:
        ranked = ranked_all
        print(f"[DEBUG static_highlights] Folosim toate paragrafele: {len(ranked)}")

    # ── Zone egale ────────────────────────────────────────────────────
    # 1 zonă la ~3 paragrafe, între 5 și 20, dar nu mai multe zone decât paragrafe
    num_zones = max(5, min(20, total_p // 3))
    num_zones = min(num_zones, len(ranked))
    zones = _divide_into_zones(total_p, num_zones)
    print(f"[DEBUG static_highlights] Zone: {num_zones}")

    # Buget de highlights extra după ce garantăm câte 1 per zonă
    extra_budget = max(0, target - num_zones)
    max_extra_per_zone = max(1, extra_budget // max(1, num_zones))

    selected = []           # (poziție_originală, propoziție)
    seen_sentences = set()
    used_par_indices = set()

    # ── PASUL 1: Un highlight garantat din fiecare zonă ───────────────
    for start, end in zones:
        # Încearcă top 5 din zonă
        candidates = _best_in_zone(ranked, start, end, used_par_indices, n=5)

        # Dacă zona e goală, luăm cel mai apropiat paragraf disponibil global
        if not candidates:
            for item in ranked:
                if item[0] not in used_par_indices:
                    candidates = [item]
                    break

        for idx, paragraph, score in candidates:
            sentence = _safe_extract_sentence(paragraph)
            if sentence and sentence not in seen_sentences:
                selected.append((idx, sentence))
                seen_sentences.add(sentence)
                used_par_indices.add(idx)
                break

    print(f"[DEBUG static_highlights] După Pasul 1: {len(selected)} highlights")

    # ── PASUL 2: Completare cu densitate controlată per zonă ──────────
    for start, end in zones:
        if len(selected) >= target:
            break

        already_in_zone = sum(1 for pos, _ in selected if start <= pos < end)
        room = max_extra_per_zone - already_in_zone
        if room <= 0:
            continue

        extra_candidates = _best_in_zone(
            ranked, start, end, used_par_indices, n=room + 3
        )

        added = 0
        for idx, paragraph, score in extra_candidates:
            if len(selected) >= target or added >= room:
                break
            sentence = _safe_extract_sentence(paragraph)
            if sentence and sentence not in seen_sentences:
                selected.append((idx, sentence))
                seen_sentences.add(sentence)
                used_par_indices.add(idx)
                added += 1

    print(f"[DEBUG static_highlights] După Pasul 2: {len(selected)} highlights")

    # ── PASUL 3: Fallback global dacă suntem sub minimum ─────────────
    if len(selected) < MIN_HIGHLIGHTS:
        print(f"[DEBUG static_highlights] Sub minimum ({MIN_HIGHLIGHTS}), activăm fallback global.")
        for idx, paragraph, score in ranked:
            if len(selected) >= target:
                break
            if idx in used_par_indices:
                continue
            sentence = _safe_extract_sentence(paragraph)
            if sentence and sentence not in seen_sentences:
                selected.append((idx, sentence))
                seen_sentences.add(sentence)
                used_par_indices.add(idx)

    # ── Ordonare după poziția de citire ───────────────────────────────
    selected.sort(key=lambda x: x[0])
    result = [sentence for _, sentence in selected]

    print(f"[DEBUG static_highlights] TOTAL finale: {len(result)} highlights")
    return result


def _safe_extract_sentence(paragraph: str) -> str:
    """
    Extrage cea mai bună propoziție dintr-un paragraf.
    3 niveluri de fallback — nu returnează niciodată string gol dintr-un paragraf valid.
    """
    # Nivel 1: logica semantică normală
    try:
        sentences = choose_learning_sentences(paragraph, max_sentences=1)
        if sentences and sentences[0].strip():
            return sentences[0].strip()
    except Exception as e:
        print(f"[DEBUG] choose_learning_sentences a eșuat: {e}")

    # Nivel 2: prima propoziție suficient de lungă
    try:
        parts = re.split(r'(?<=[.!?])\s+', paragraph.strip())
        for part in parts:
            if len(part.split()) >= 5:
                return part.strip()
    except Exception:
        pass

    # Nivel 3: primele 20 de cuvinte din paragraf
    words = paragraph.split()
    if not words:
        return ""
    snippet = " ".join(words[:20]).strip().rstrip(",;:—-")
    return snippet + ("..." if len(words) > 20 else "")