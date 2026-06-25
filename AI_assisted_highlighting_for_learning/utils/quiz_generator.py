import json
import re
from openai import OpenAI
import os
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def extract_json(text):
    try:
        return json.loads(text)
    except:
        pass

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except:
            return []

    return []


def generate_quiz(paragraphs):

    text = "\n\n".join(paragraphs[:8])

    prompt = f"""
Create 5 multiple choice questions based on this article.

IMPORTANT:
Return ONLY valid JSON array.
No explanations. No extra text.

Format:
[
  {{
    "question": "...",
    "options": ["A", "B", "C", "D"],
    "correct_answer": "A"
  }}
]

ARTICLE:
{text}
"""

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "user", "content": prompt}
        ],
        temperature=0.4
    )

    content = response.choices[0].message.content

    return extract_json(content)