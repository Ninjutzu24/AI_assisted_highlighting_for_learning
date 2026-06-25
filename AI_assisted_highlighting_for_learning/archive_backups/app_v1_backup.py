from flask import Flask, render_template, request
from utils.preprocessing import split_into_paragraphs
from utils.highlighting import get_static_highlights
from utils.interactive_support import build_interactive_support
from utils.language import detect_language

app = Flask(__name__)

CURRENT_DATA = {
    "text": "",
    "mode": "static",
    "language": "unknown",
    "paragraphs": [],
    "rendered_paragraphs": [],
    "static_highlights": [],
    "interactive_data": [],
}


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
    return render_template("index.html")


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


@app.route("/quiz", methods=["GET", "POST"])
def quiz():
    return render_template("quiz.html")


@app.route("/results", methods=["GET"])
def results():
    return render_template("results.html")


if __name__ == "__main__":
    app.run(debug=True)