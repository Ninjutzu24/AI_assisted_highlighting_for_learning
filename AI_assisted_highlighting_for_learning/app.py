from pathlib import Path
from dotenv import load_dotenv

load_dotenv(
    dotenv_path=Path(__file__).resolve().parent / ".env"
)

from flask import Flask, render_template, request, jsonify, redirect, url_for
from utils.preprocessing import split_into_paragraphs
from utils.highlighting import get_static_highlights
from utils.interactive_support import build_interactive_support
from utils.language import detect_language
from utils.quiz_generator import generate_quiz
from utils.chatbot import ask_chatbot
from export_results import export_results_to_excel
import json
import os


app = Flask(__name__)
with open("articles.json", "r", encoding="utf-8") as f:
    ARTICLES = json.load(f)

with open("quizzes.json", "r", encoding="utf-8") as f:
    QUIZZES = json.load(f)


def get_articles_for_participant(participant_id):
    return ARTICLES[:3]


CURRENT_DATA = {
    "text": "",
    "mode": "static",
    "language": "unknown",
    "paragraphs": [],
    "rendered_paragraphs": [],
    "static_highlights": [],
    "interactive_data": [],
}

def extract_participant_number(participant_id):
    digits = "".join(ch for ch in str(participant_id) if ch.isdigit())

    if digits:
        return int(digits)

    return 1


def get_counterbalanced_articles(participant_id, articles):
    participant_number = extract_participant_number(participant_id)

    group_index = ((participant_number - 1) // 6) % 3

    article_orders = [
        [1, 2, 3],
        [2, 3, 1],
        [3, 1, 2],
    ]

    selected_order = article_orders[group_index]

    articles_by_id = {
        int(article["id"]): article
        for article in articles
    }

    return [
        articles_by_id[article_id]
        for article_id in selected_order
        if article_id in articles_by_id
    ]


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response

def build_image_context(images):
    if not isinstance(images, list) or not images:
        return "\n\nNo image or figure context was detected on this page."

    lines = [
        "\n\nIMAGE AND FIGURE CONTEXT:",
        "The user may ask about images using expressions such as 'image 1', 'first image', 'figure 1', or 'the diagram'.",
        "Use only the caption, alt text, and nearby article text provided below. Do not pretend to visually inspect the image pixels.",
        ""
    ]

    for image in images[:8]:
        index = image.get("index", "?")
        alt = image.get("alt", "")
        caption = image.get("caption", "")
        nearby_text = image.get("nearbyText", "")

        lines.append(f"[Image {index}]")

        if alt:
            lines.append(f"Alt text: {alt}")

        if caption:
            lines.append(f"Caption: {caption}")

        if nearby_text:
            lines.append(f"Nearby article text: {nearby_text}")

        lines.append("")

    return "\n".join(lines)

def apply_inline_highlights(paragraphs, highlights):
    rendered = []

    for paragraph in paragraphs:
        updated = paragraph
        for h in highlights:
            if h in updated:
                updated = updated.replace(
                    h,
                    f'<span class="inline-highlight">{h}</span>'
                )
        rendered.append(updated)

    return rendered


@app.route("/", methods=["GET"])
def index():
    return redirect(url_for("experiment"))


@app.route("/start", methods=["POST"])
def start():
    text = request.form.get("text", "").strip()
    mode = request.form.get("mode", "static")

    if not text:
        return render_template("index.html", error="Please enter a text before starting.")

    language = detect_language(text)
    paragraphs = split_into_paragraphs(text)

    if not paragraphs:
        return render_template(
            "index.html",
            error="The text could not be processed into meaningful paragraphs. Please paste a cleaner text."
        )

    static_highlights = get_static_highlights(paragraphs)
    interactive_data = build_interactive_support(paragraphs)
    rendered_paragraphs = apply_inline_highlights(paragraphs, static_highlights)

    CURRENT_DATA["text"] = text
    CURRENT_DATA["mode"] = mode
    CURRENT_DATA["language"] = language
    CURRENT_DATA["paragraphs"] = paragraphs
    CURRENT_DATA["rendered_paragraphs"] = rendered_paragraphs
    CURRENT_DATA["static_highlights"] = static_highlights
    CURRENT_DATA["interactive_data"] = interactive_data

    return render_template(
        "reading.html",
        mode=mode,
        language=language,
        paragraphs=paragraphs,
        rendered_paragraphs=rendered_paragraphs,
        static_highlights=static_highlights,
        interactive_data=interactive_data,
    )


@app.route("/api/analyze", methods=["POST", "OPTIONS"])
def api_analyze():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}
    
    text = data.get("text", "").strip()
    mode = data.get("mode", "static")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    language = detect_language(text)
    paragraphs = split_into_paragraphs(text)

    if not paragraphs:  
        return jsonify({
            "error": "The text could not be processed into meaningful paragraphs."
        }), 400

    static_highlights = get_static_highlights(paragraphs)
    interactive_data = build_interactive_support(paragraphs)

    return jsonify({
        "language": language,
        "mode": mode,
        "paragraph_count": len(paragraphs),
        "paragraphs": paragraphs,
        "highlights": static_highlights,
        "interactive_support": interactive_data
    })


@app.route("/api/quiz", methods=["POST", "OPTIONS"])
def api_quiz():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    article_id = (
        data.get("articleId")
        or data.get("articleIndex")
        or data.get("id")
    )

    if article_id is None:
        return jsonify({
            "error": "No articleId provided"
        }), 400

    article_id = str(article_id)

    if article_id not in QUIZZES:
        return jsonify({
            "error": f"No predefined quiz found for article {article_id}"
        }), 404

    return jsonify({
        "quiz": QUIZZES[article_id]
    })


@app.route("/quiz", methods=["GET", "POST"])
def quiz():
    return render_template("quiz.html")


@app.route("/results", methods=["GET"])
def results():
    return render_template("results.html")

@app.route("/api/save_result", methods=["POST", "OPTIONS"])
def save_result():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    result_entry = {
    "participantId": data.get("participantId"),
    "mode": data.get("mode"),

    "articleId": data.get("articleId"),
    "articleIndex": data.get("articleIndex"),

    "correct": data.get("correct"),
    "total": data.get("total"),
    "score": data.get("score"),

    "startedAt": data.get("startedAt"),
    "quizOpenedAt": data.get("quizOpenedAt"),
    "submittedAt": data.get("submittedAt"),

    "readingTimeSeconds": data.get("readingTimeSeconds"),
    "totalTaskTimeSeconds": data.get("totalTaskTimeSeconds"),

    "timeLimitSeconds": data.get("timeLimitSeconds"),
    "timeLimitReached": data.get("timeLimitReached"),

    "manualHighlightCount": data.get("manualHighlightCount"),
    "manualHighlightRemoveCount": data.get("manualHighlightRemoveCount"),
    "aiHighlightCount": data.get("aiHighlightCount"),
    "interactiveCardsShown": data.get("interactiveCardsShown"),
    "chatbotQuestionCount": data.get("chatbotQuestionCount"),

    "quizQuestionCount": data.get("quizQuestionCount"),
    "quizAnsweredCount": data.get("quizAnsweredCount")
}

    results_file = "results.json"

    if os.path.exists(results_file):
        try:
            with open(results_file, "r", encoding="utf-8") as f:
                results = json.load(f)
        except:
            results = []
    else:
        results = []

    results.append(result_entry)

    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4, ensure_ascii=False)

    try:
        export_results_to_excel()
    except Exception as e:
        print("[Excel Export] Error:", e)

    return jsonify({
        "success": True
    })


@app.route("/api/save_sus_nasa", methods=["POST", "OPTIONS"])
def save_sus_nasa():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    sus_entry = {
        "participantId": data.get("participantId"),
        "taskNumber": data.get("taskNumber"),
        "articleId": data.get("articleId"),
        "articleIndex": data.get("articleIndex"),
        "mode": data.get("mode"),
        "modeLabel": data.get("modeLabel"),
        "responses": data.get("responses", {}),
        "comment": data.get("comment", ""),
        "submittedAt": data.get("submittedAt")
    }

    sus_file = "sus_nasa_results.json"

    if os.path.exists(sus_file):
        try:
            with open(sus_file, "r", encoding="utf-8") as f:
                sus_results = json.load(f)
        except:
            sus_results = []
    else:
        sus_results = []

    sus_results.append(sus_entry)

    with open(sus_file, "w", encoding="utf-8") as f:
        json.dump(sus_results, f, indent=4, ensure_ascii=False)

    try:
        export_results_to_excel()
    except Exception as e:
        print("[Excel Export] Error after SUS/NASA save:", e)

    return jsonify({
        "success": True
    })

    
@app.route("/api/chat", methods=["POST", "OPTIONS"])
def api_chat():

    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    article = data.get("article", "")
    question = data.get("question", "")
    images = data.get("images", [])

    if not article:
        return jsonify({
            "error": "No article provided"
        }), 400

    if not question:
        return jsonify({
            "error": "No question provided"
        }), 400

    image_context = build_image_context(images)

    enriched_article = f"""
ARTICLE TEXT:
{article}

{image_context}
"""

    enriched_question = f"""
User question:
{question}

Answer clearly and simply. If the user asks about an image or figure, explain it using the IMAGE AND FIGURE CONTEXT when available.
"""

    answer = ask_chatbot(
        enriched_article,
        enriched_question
    )

    return jsonify({
        "answer": answer
    })

@app.route("/experiment")
def experiment():
    return render_template("experiment.html")

@app.route("/api/participant/<participant_id>")
def participant_articles(participant_id):

    ordered_articles = get_counterbalanced_articles(participant_id, ARTICLES)

    return jsonify({
        "participantId": participant_id,
        "articles": ordered_articles
    })

if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=8000)


