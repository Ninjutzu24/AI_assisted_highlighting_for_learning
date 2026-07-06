from openai import OpenAI
import os

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY")
)

def ask_chatbot(article_text, question):

    prompt = f"""
You are an educational reading assistant.

Answer ONLY using information from the article below.

ARTICLE:
{article_text}

QUESTION:
{question}
"""

    response = client.chat.completions.create(
        model="gpt-5.4",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.3
    )

    return response.choices[0].message.content
