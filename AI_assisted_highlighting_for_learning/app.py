from flask import Flask, render_template, request, jsonify, redirect, url_for
from utils.preprocessing import split_into_paragraphs
from utils.highlighting import get_static_highlights
from utils.interactive_support import build_interactive_support
from utils.language import detect_language
from utils.quiz_generator import generate_quiz
from utils.chatbot import ask_chatbot
import json
import os


app = Flask(__name__)

with open("articles.json", "r", encoding="utf-8") as f:
    ARTICLES = json.load(f)


def get_articles_for_participant(participant_id):
    total = len(ARTICLES)
    start = (int(participant_id) * 3) % total

    return [
        ARTICLES[start % total],
        ARTICLES[(start + 1) % total],
        ARTICLES[(start + 2) % total]
    ]


CURRENT_DATA = {
    "text": "",
    "mode": "static",
    "language": "unknown",
    "paragraphs": [],
    "rendered_paragraphs": [],
    "static_highlights": [],
    "interactive_data": [],
}


@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


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


# MAIN ENTRY: redirects to the real experiment flow
@app.route("/", methods=["GET"])
def index():
    return redirect(url_for("experiment"))


# Old paste-text page, kept only for testing/debugging
@app.route("/demo", methods=["GET"])
def demo():
    return render_template("index.html")


# Real experiment page
@app.route("/experiment", methods=["GET"])
def experiment():
    return render_template("experiment.html")


@app.route("/start", methods=["POST"])
def start():
    text = request.form.get("text", "").strip()
    mode = request.form.get("mode", "static")

    if not text:
        return render_template(
            "index.html",
            error="Please enter a text before starting."
        )

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
    text = data.get("text", "").strip()

    if not text:
        return jsonify({"error": "No text provided"}), 400

    paragraphs = split_into_paragraphs(text)
    quiz_questions = generate_quiz(paragraphs)

    return jsonify({
        "quiz": quiz_questions
    })


@app.route("/api/chat", methods=["POST", "OPTIONS"])
def api_chat():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    article = data.get("article", "")
    question = data.get("question", "")

    if not article:
        return jsonify({"error": "No article provided"}), 400

    if not question:
        return jsonify({"error": "No question provided"}), 400

    answer = ask_chatbot(article, question)

    return jsonify({
        "answer": answer
    })


@app.route("/api/save_result", methods=["POST", "OPTIONS"])
def save_result():
    if request.method == "OPTIONS":
        return ("", 204)

    data = request.get_json(silent=True) or {}

    result_entry = {
        "participantId": data.get("participantId"),
        "mode": data.get("mode"),
        "correct": data.get("correct"),
        "total": data.get("total"),
        "score": data.get("score")
    }

    results_file = "results.json"

    if os.path.exists(results_file):
        try:
            with open(results_file, "r", encoding="utf-8") as f:
                results = json.load(f)
        except Exception:
            results = []
    else:
        results = []

    results.append(result_entry)

    with open(results_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=4)

    return jsonify({
        "success": True
    })


@app.route("/api/participant/<participant_id>")
def participant_articles(participant_id):
    assigned_articles = get_articles_for_participant(participant_id)

    return jsonify({
        "participantId": participant_id,
        "articles": assigned_articles
    })


# Old placeholder pages, kept only so old links do not break
@app.route("/quiz", methods=["GET", "POST"])
def quiz():
    return render_template("quiz.html")


@app.route("/results", methods=["GET"])
def results():
    return render_template("results.html")


if __name__ == "__main__":
    app.run(debug=False, host="127.0.0.1", port=8000)