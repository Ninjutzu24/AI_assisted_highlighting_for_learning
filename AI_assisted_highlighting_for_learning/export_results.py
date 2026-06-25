import json
import os
from collections import defaultdict
from statistics import mean
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, Reference


RESULTS_FILE = "results.json"
OUTPUT_FILE = "results_analysis.xlsx"


RAW_HEADERS = [
    "participantId",
    "mode",
    "articleId",
    "articleIndex",
    "correct",
    "total",
    "score",
    "startedAt",
    "quizOpenedAt",
    "submittedAt",
    "readingTimeSeconds",
    "totalTaskTimeSeconds",
    "timeLimitSeconds",
    "timeLimitReached",
    "manualHighlightCount",
    "manualHighlightRemoveCount",
    "aiHighlightCount",
    "interactiveCardsShown",
    "chatbotQuestionCount",
    "quizQuestionCount",
    "quizAnsweredCount",
]


def safe_number(value, default=0):
    try:
        if value is None:
            return default
        return float(value)
    except (ValueError, TypeError):
        return default


def avg(rows, key):
    values = [
        safe_number(row.get(key))
        for row in rows
        if row.get(key) is not None
    ]

    if not values:
        return 0

    return round(mean(values), 2)


def load_results():
    if not os.path.exists(RESULTS_FILE):
        raise FileNotFoundError(f"{RESULTS_FILE} not found.")

    with open(RESULTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        raise ValueError("results.json must contain a list.")

    return data


def style_sheet(ws):
    header_fill = PatternFill(
        start_color="1D4ED8",
        end_color="1D4ED8",
        fill_type="solid"
    )

    header_font = Font(
        color="FFFFFF",
        bold=True
    )

    thin_border = Border(
        left=Side(style="thin", color="D1D5DB"),
        right=Side(style="thin", color="D1D5DB"),
        top=Side(style="thin", color="D1D5DB"),
        bottom=Side(style="thin", color="D1D5DB"),
    )

    for cell in ws[1]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center")
        cell.border = thin_border

    for row in ws.iter_rows():
        for cell in row:
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center")

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    for column_cells in ws.columns:
        max_length = 0
        column_letter = column_cells[0].column_letter

        for cell in column_cells:
            value = str(cell.value) if cell.value is not None else ""
            max_length = max(max_length, len(value))

        ws.column_dimensions[column_letter].width = min(max_length + 3, 35)


def add_raw_sheet(wb, results):
    ws = wb.create_sheet("Raw Results")

    ws.append(RAW_HEADERS)

    for row in results:
        ws.append([
            row.get(header)
            for header in RAW_HEADERS
        ])

    style_sheet(ws)


def build_summary_by_key(results, group_key):
    grouped = defaultdict(list)

    for row in results:
        key = row.get(group_key, "unknown")
        grouped[str(key)].append(row)

    summary = []

    for key, rows in sorted(grouped.items()):
        summary.append({
            group_key: key,
            "n": len(rows),
            "avgScore": avg(rows, "score"),
            "avgReadingTimeSeconds": avg(rows, "readingTimeSeconds"),
            "avgTotalTaskTimeSeconds": avg(rows, "totalTaskTimeSeconds"),
            "avgManualHighlights": avg(rows, "manualHighlightCount"),
            "avgAIHighlights": avg(rows, "aiHighlightCount"),
            "avgChatbotQuestions": avg(rows, "chatbotQuestionCount"),
            "avgQuizAnswered": avg(rows, "quizAnsweredCount"),
            "timeLimitReachedCount": sum(
                1 for row in rows
                if row.get("timeLimitReached") is True
            )
        })

    return summary


def add_summary_sheet(wb, title, group_key, summary):
    ws = wb.create_sheet(title)

    headers = [
        group_key,
        "n",
        "avgScore",
        "avgReadingTimeSeconds",
        "avgTotalTaskTimeSeconds",
        "avgManualHighlights",
        "avgAIHighlights",
        "avgChatbotQuestions",
        "avgQuizAnswered",
        "timeLimitReachedCount",
    ]

    ws.append(headers)

    for row in summary:
        ws.append([
            row.get(header)
            for header in headers
        ])

    style_sheet(ws)


def add_charts_sheet(wb):
    ws = wb.create_sheet("Charts")

    ws["A1"] = "Automatic Charts"
    ws["A1"].font = Font(size=18, bold=True)

    summary_mode = wb["Summary by Mode"]

    max_row = summary_mode.max_row

    if max_row < 2:
        ws["A3"] = "Not enough data for charts."
        return

    # Chart 1: Average score by mode
    chart_score = BarChart()
    chart_score.type = "col"
    chart_score.title = "Average score by mode"
    chart_score.y_axis.title = "Score (%)"
    chart_score.x_axis.title = "Mode"

    data = Reference(
        summary_mode,
        min_col=3,
        min_row=1,
        max_row=max_row
    )

    categories = Reference(
        summary_mode,
        min_col=1,
        min_row=2,
        max_row=max_row
    )

    chart_score.add_data(data, titles_from_data=True)
    chart_score.set_categories(categories)
    chart_score.height = 8
    chart_score.width = 14

    ws.add_chart(chart_score, "A3")

    # Chart 2: Average total task time by mode
    chart_time = BarChart()
    chart_time.type = "col"
    chart_time.title = "Average total task time by mode"
    chart_time.y_axis.title = "Seconds"
    chart_time.x_axis.title = "Mode"

    data = Reference(
        summary_mode,
        min_col=5,
        min_row=1,
        max_row=max_row
    )

    chart_time.add_data(data, titles_from_data=True)
    chart_time.set_categories(categories)
    chart_time.height = 8
    chart_time.width = 14

    ws.add_chart(chart_time, "A20")

    # Chart 3: Interaction metrics by mode
    chart_interactions = BarChart()
    chart_interactions.type = "col"
    chart_interactions.title = "Interaction metrics by mode"
    chart_interactions.y_axis.title = "Average count"
    chart_interactions.x_axis.title = "Mode"

    data = Reference(
        summary_mode,
        min_col=6,
        max_col=8,
        min_row=1,
        max_row=max_row
    )

    chart_interactions.add_data(data, titles_from_data=True)
    chart_interactions.set_categories(categories)
    chart_interactions.height = 8
    chart_interactions.width = 14

    ws.add_chart(chart_interactions, "A37")

def export_results_to_excel():
    if not os.path.exists(RESULTS_FILE):
        print(f"[Excel Export] {RESULTS_FILE} not found yet.")
        return False

    results = load_results()

    if not results:
        print("[Excel Export] No results yet.")
        return False

    wb = Workbook()

    default_sheet = wb.active
    wb.remove(default_sheet)

    add_raw_sheet(wb, results)

    summary_by_mode = build_summary_by_key(
        results,
        "mode"
    )

    add_summary_sheet(
        wb,
        "Summary by Mode",
        "mode",
        summary_by_mode
    )

    summary_by_article = build_summary_by_key(
        results,
        "articleIndex"
    )

    add_summary_sheet(
        wb,
        "Summary by Article",
        "articleIndex",
        summary_by_article
    )

    summary_by_participant = build_summary_by_key(
        results,
        "participantId"
    )

    add_summary_sheet(
        wb,
        "Summary by Participant",
        "participantId",
        summary_by_participant
    )

    add_charts_sheet(wb)

    wb.save(OUTPUT_FILE)

    print(f"[Excel Export] Updated {OUTPUT_FILE}")
    return True


def main():
    export_results_to_excel()


if __name__ == "__main__":
    main()
