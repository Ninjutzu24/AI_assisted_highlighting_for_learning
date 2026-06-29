import json
import os
from collections import defaultdict
from statistics import mean
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.chart import BarChart, Reference


RESULTS_FILE = "results.json"
SUS_RESULTS_FILE = "sus_nasa_results.json"
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


FEEDBACK_RESPONSE_KEYS = [
    "easy_to_use",
    "unnecessarily_complex",
    "confident_using",
    "needed_help",
    "well_integrated",
    "confusing",
    "helped_understanding",
    "would_use_again",
    "mental_demand",
    "temporal_demand",
    "effort",
    "frustration",
    "performance",
    "overall_workload",
]


FEEDBACK_RAW_HEADERS = [
    "participantId",
    "taskNumber",
    "articleId",
    "articleIndex",
    "mode",
    "modeLabel",
    *FEEDBACK_RESPONSE_KEYS,
    "comment",
    "submittedAt",
]


POSITIVE_USABILITY_KEYS = [
    "easy_to_use",
    "confident_using",
    "well_integrated",
    "helped_understanding",
    "would_use_again",
]


USABILITY_PROBLEM_KEYS = [
    "unnecessarily_complex",
    "needed_help",
    "confusing",
]


WORKLOAD_KEYS = [
    "mental_demand",
    "temporal_demand",
    "effort",
    "frustration",
    "overall_workload",
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


def load_json_list(file_path):
    if not os.path.exists(file_path):
        return []

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return []

    if not isinstance(data, list):
        return []

    return data


def load_results():
    return load_json_list(RESULTS_FILE)


def load_feedback_results():
    return load_json_list(SUS_RESULTS_FILE)


def get_mode_label(mode, fallback=None):
    if fallback:
        return fallback

    if mode == "static":
        return "Manual Highlighting"

    if mode == "interactive":
        return "AI Highlighting and Main Ideas Support"

    if mode == "chatbot":
        return "AI Chatbot Support"

    return mode or "unknown"


def get_feedback_value(row, key):
    responses = row.get("responses", {})

    if not isinstance(responses, dict):
        return None

    return responses.get(key)


def avg_feedback_key(rows, key):
    values = []

    for row in rows:
        value = get_feedback_value(row, key)

        if value is not None:
            values.append(safe_number(value))

    if not values:
        return 0

    return round(mean(values), 2)


def row_average_feedback(row, keys):
    values = []

    for key in keys:
        value = get_feedback_value(row, key)

        if value is not None:
            values.append(safe_number(value))

    if not values:
        return None

    return mean(values)


def avg_feedback_group(rows, keys):
    values = []

    for row in rows:
        row_avg = row_average_feedback(row, keys)

        if row_avg is not None:
            values.append(row_avg)

    if not values:
        return 0

    return round(mean(values), 2)


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

        ws.column_dimensions[column_letter].width = min(max_length + 3, 38)



def clean_chart(chart, width=17, height=8, legend_position="b", show_legend=True):
    """Make generated Excel charts cleaner and avoid axis titles overlapping the plot."""
    chart.height = height
    chart.width = width

    # Axis titles were overlapping with the plotted bars in Excel.
    # The chart titles already explain the metric, so the axes stay unlabeled.
    chart.x_axis.title = None
    chart.y_axis.title = None

    if show_legend:
        if chart.legend:
            chart.legend.position = legend_position
            chart.legend.overlay = False
    else:
        chart.legend = None


def add_raw_sheet(wb, results):
    ws = wb.create_sheet("Raw Results")

    ws.append(RAW_HEADERS)

    for row in results:
        ws.append([
            row.get(header)
            for header in RAW_HEADERS
        ])

    style_sheet(ws)


def add_feedback_raw_sheet(wb, feedback_results):
    ws = wb.create_sheet("Feedback Raw")

    ws.append(FEEDBACK_RAW_HEADERS)

    for row in feedback_results:
        responses = row.get("responses", {})

        if not isinstance(responses, dict):
            responses = {}

        mode = row.get("mode")
        mode_label = get_mode_label(
            mode,
            row.get("modeLabel")
        )

        ws.append([
            row.get("participantId"),
            row.get("taskNumber"),
            row.get("articleId"),
            row.get("articleIndex"),
            mode,
            mode_label,
            *[
                responses.get(key)
                for key in FEEDBACK_RESPONSE_KEYS
            ],
            row.get("comment"),
            row.get("submittedAt"),
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


def build_feedback_summary_by_key(feedback_results, group_key):
    grouped = defaultdict(list)

    for row in feedback_results:
        if group_key == "mode":
            key = get_mode_label(
                row.get("mode"),
                row.get("modeLabel")
            )
        else:
            key = row.get(group_key, "unknown")

        grouped[str(key)].append(row)

    summary = []

    for key, rows in sorted(grouped.items()):
        summary.append({
            group_key: key,
            "n": len(rows),

            "avgPositiveUsability": avg_feedback_group(
                rows,
                POSITIVE_USABILITY_KEYS
            ),

            "avgUsabilityProblems": avg_feedback_group(
                rows,
                USABILITY_PROBLEM_KEYS
            ),

            "avgWorkload": avg_feedback_group(
                rows,
                WORKLOAD_KEYS
            ),

            "avgPerformance": avg_feedback_key(
                rows,
                "performance"
            ),

            "avgEasyToUse": avg_feedback_key(
                rows,
                "easy_to_use"
            ),

            "avgHelpedUnderstanding": avg_feedback_key(
                rows,
                "helped_understanding"
            ),

            "avgWouldUseAgain": avg_feedback_key(
                rows,
                "would_use_again"
            ),

            "avgMentalDemand": avg_feedback_key(
                rows,
                "mental_demand"
            ),

            "avgEffort": avg_feedback_key(
                rows,
                "effort"
            ),

            "avgFrustration": avg_feedback_key(
                rows,
                "frustration"
            ),
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


def add_feedback_summary_sheet(wb, title, group_key, summary):
    ws = wb.create_sheet(title)

    headers = [
        group_key,
        "n",
        "avgPositiveUsability",
        "avgUsabilityProblems",
        "avgWorkload",
        "avgPerformance",
        "avgEasyToUse",
        "avgHelpedUnderstanding",
        "avgWouldUseAgain",
        "avgMentalDemand",
        "avgEffort",
        "avgFrustration",
    ]

    ws.append(headers)

    for row in summary:
        ws.append([
            row.get(header)
            for header in headers
        ])

    style_sheet(ws)


def add_quiz_charts(ws, wb, start_cell="A3"):
    if "Summary by Mode" not in wb.sheetnames:
        ws["A3"] = "No quiz results available yet."
        return

    summary_mode = wb["Summary by Mode"]
    max_row = summary_mode.max_row

    if max_row < 2:
        ws["A3"] = "Not enough quiz data for charts."
        return

    categories = Reference(
        summary_mode,
        min_col=1,
        min_row=2,
        max_row=max_row
    )

    # Chart 1: Average score by mode
    chart_score = BarChart()
    chart_score.type = "col"
    chart_score.title = "Average comprehension score by mode"

    data = Reference(
        summary_mode,
        min_col=3,
        min_row=1,
        max_row=max_row
    )

    chart_score.add_data(data, titles_from_data=True)
    chart_score.set_categories(categories)
    clean_chart(chart_score, width=16, height=8, show_legend=False)

    ws.add_chart(chart_score, "A3")

    # Chart 2: Average total task time by mode
    chart_time = BarChart()
    chart_time.type = "col"
    chart_time.title = "Average total task time by mode"

    data = Reference(
        summary_mode,
        min_col=5,
        min_row=1,
        max_row=max_row
    )

    chart_time.add_data(data, titles_from_data=True)
    chart_time.set_categories(categories)
    clean_chart(chart_time, width=16, height=8, show_legend=False)

    ws.add_chart(chart_time, "A20")

    # Chart 3: Interaction metrics by mode
    chart_interactions = BarChart()
    chart_interactions.type = "col"
    chart_interactions.title = "Interaction metrics by mode"

    data = Reference(
        summary_mode,
        min_col=6,
        max_col=8,
        min_row=1,
        max_row=max_row
    )

    chart_interactions.add_data(data, titles_from_data=True)
    chart_interactions.set_categories(categories)
    clean_chart(chart_interactions, width=18, height=8, legend_position="b")

    ws.add_chart(chart_interactions, "A37")


def add_feedback_charts(ws, wb):
    if "Feedback by Mode" not in wb.sheetnames:
        ws["J3"] = "No feedback results available yet."
        return

    feedback_mode = wb["Feedback by Mode"]
    max_row = feedback_mode.max_row

    if max_row < 2:
        ws["J3"] = "Not enough feedback data for charts."
        return

    categories = Reference(
        feedback_mode,
        min_col=1,
        min_row=2,
        max_row=max_row
    )

    # Chart 4: Main feedback metrics by mode
    chart_feedback = BarChart()
    chart_feedback.type = "col"
    chart_feedback.title = "Feedback summary by mode"

    data = Reference(
        feedback_mode,
        min_col=3,
        max_col=6,
        min_row=1,
        max_row=max_row
    )

    chart_feedback.add_data(data, titles_from_data=True)
    chart_feedback.set_categories(categories)
    clean_chart(chart_feedback, width=18, height=8, legend_position="b")

    ws.add_chart(chart_feedback, "J3")

    # Chart 5: Ease of use / understanding / reuse
    chart_usefulness = BarChart()
    chart_usefulness.type = "col"
    chart_usefulness.title = "Ease, understanding, and reuse by mode"

    data = Reference(
        feedback_mode,
        min_col=7,
        max_col=9,
        min_row=1,
        max_row=max_row
    )

    chart_usefulness.add_data(data, titles_from_data=True)
    chart_usefulness.set_categories(categories)
    clean_chart(chart_usefulness, width=18, height=8, legend_position="b")

    ws.add_chart(chart_usefulness, "J20")

    # Chart 6: Workload details by mode
    chart_workload = BarChart()
    chart_workload.type = "col"
    chart_workload.title = "Workload details by mode"

    data = Reference(
        feedback_mode,
        min_col=10,
        max_col=12,
        min_row=1,
        max_row=max_row
    )

    chart_workload.add_data(data, titles_from_data=True)
    chart_workload.set_categories(categories)
    clean_chart(chart_workload, width=18, height=8, legend_position="b")

    ws.add_chart(chart_workload, "J37")


def add_charts_sheet(wb):
    ws = wb.create_sheet("Charts")

    ws["A1"] = "Automatic Charts"
    ws["A1"].font = Font(size=18, bold=True)

    ws["A2"] = "Comprehension quiz and interaction metrics"
    ws["A2"].font = Font(size=13, bold=True)

    ws["J2"] = "Feedback questionnaire metrics"
    ws["J2"].font = Font(size=13, bold=True)

    add_quiz_charts(ws, wb)
    add_feedback_charts(ws, wb)


def export_results_to_excel():
    results = load_results()
    feedback_results = load_feedback_results()

    if not results and not feedback_results:
        print("[Excel Export] No results or feedback data yet.")
        return False

    wb = Workbook()

    default_sheet = wb.active
    wb.remove(default_sheet)

    if results:
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

    if feedback_results:
        add_feedback_raw_sheet(wb, feedback_results)

        feedback_by_mode = build_feedback_summary_by_key(
            feedback_results,
            "mode"
        )

        add_feedback_summary_sheet(
            wb,
            "Feedback by Mode",
            "mode",
            feedback_by_mode
        )

        feedback_by_article = build_feedback_summary_by_key(
            feedback_results,
            "articleIndex"
        )

        add_feedback_summary_sheet(
            wb,
            "Feedback by Article",
            "articleIndex",
            feedback_by_article
        )

        feedback_by_participant = build_feedback_summary_by_key(
            feedback_results,
            "participantId"
        )

        add_feedback_summary_sheet(
            wb,
            "Feedback by Participant",
            "participantId",
            feedback_by_participant
        )

    add_charts_sheet(wb)

    wb.save(OUTPUT_FILE)

    print(f"[Excel Export] Updated {OUTPUT_FILE}")
    return True


def main():
    export_results_to_excel()


if __name__ == "__main__":
    main()