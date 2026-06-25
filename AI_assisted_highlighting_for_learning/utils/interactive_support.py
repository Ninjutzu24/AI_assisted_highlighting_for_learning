from utils.learning_logic import (
    choose_interactive_paragraphs,
    choose_learning_sentences,
    compress_sentence,
)

from openai import OpenAI
import os
import json


api_key = os.getenv("OPENAI_API_KEY")

client = OpenAI(
    api_key=api_key
) if api_key else None


def build_fallback_panel(selected):
    main_ideas = []

    for idx, paragraph, score in selected[:4]:
        key_sentences = choose_learning_sentences(
            paragraph,
            max_sentences=1
        )

        key_sentence = (
            key_sentences[0]
            if key_sentences
            else paragraph
        )

        main_ideas.append({
            "title": compress_sentence(key_sentence, 14),
            "explanation": key_sentence
        })

    return [{
        "panel_type": "main_ideas",
        "article_overview": "This section contains important ideas from the article.",
        "reading_focus": "Focus on the main concepts and how they are connected.",
        "main_ideas": main_ideas,
        "key_terms": [],
        "final_takeaway": "Review the main ideas before continuing to the quiz."
    }]


def build_ai_panel(paragraphs, selected):
    if not client:
        return None

    article_sample = "\n\n".join(paragraphs[:12])[:7000]

    important_passages = []

    for number, item in enumerate(selected[:8], start=1):
        idx, paragraph, score = item

        important_passages.append({
            "number": number,
            "paragraph": paragraph[:1600]
        })

    prompt = f"""
You are an educational reading assistant.

Create ONE compact support panel for a student reading an article.

Do NOT create repeated cards.
Do NOT use generic phrases like:
- "This paragraph is useful for learning..."
- "This paragraph explains the meaning of an important concept."
- "This is important because it establishes the concept."

Use the actual content of the article.

Return ONLY valid JSON in this exact structure:

{{
  "article_overview": "One short sentence explaining what this article section is mainly about.",
  "reading_focus": "One short sentence telling the student what to pay attention to.",
  "main_ideas": [
    {{
      "title": "Short title of the idea",
      "explanation": "Simple explanation of this idea using article content."
    }}
  ],
  "key_terms": [
    {{
      "term": "Important term",
      "meaning": "Short meaning based on the article."
    }}
  ],
  "final_takeaway": "One concise takeaway that summarizes what the student should remember."
}}

Rules:
- Create exactly 4 main ideas.
- Create 3 to 5 key terms.
- Keep explanations short and student-friendly.
- Use simple English.
- Use only information from the article.
- Do not invent information.
- Do not mention scores or relevance.

ARTICLE SAMPLE:
{article_sample}

IMPORTANT PASSAGES:
{json.dumps(important_passages, ensure_ascii=False)}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": "You generate concise educational main-idea support panels."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.25,
        response_format={
            "type": "json_object"
        }
    )

    raw = response.choices[0].message.content
    data = json.loads(raw)

    return [{
        "panel_type": "main_ideas",
        "article_overview": data.get("article_overview", ""),
        "reading_focus": data.get("reading_focus", ""),
        "main_ideas": data.get("main_ideas", []),
        "key_terms": data.get("key_terms", []),
        "final_takeaway": data.get("final_takeaway", "")
    }]


def build_interactive_support(paragraphs: list[str], max_cards: int = 4) -> list[dict]:
    selected = choose_interactive_paragraphs(
        paragraphs,
        max_cards=8
    )

    if not selected:
        return []

    try:
        ai_panel = build_ai_panel(
            paragraphs,
            selected
        )

        if ai_panel:
            return ai_panel

    except Exception as e:
        print("[Interactive Support AI Error]", e)

    return build_fallback_panel(selected)