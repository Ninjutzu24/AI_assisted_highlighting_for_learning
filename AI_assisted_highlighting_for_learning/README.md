# AI-Assisted Highlighting for Learning

This folder contains the source code for the **AI-Assisted Highlighting for Learning** system developed for the experimental study.

The project implements a web application and a browser extension designed to support reading comprehension. The system compares three reading support modes:

1. Manual highlighting mode
2. AI main ideas support mode
3. Chatbot support mode

The experiment uses the same three articles for all participants, and each article has a predefined comprehension quiz. The application also records interaction-related metrics and exports the collected data for further analysis.

## Project Structure

- `app.py`: main Flask application;
- `templates/`: HTML templates used by the web application;
- `static/`: static files, including JavaScript and CSS resources;
- `extension/`: browser extension source files;
- `utils/`: utility functions and supporting modules;
- `articles.json`: article-related data;
- `quizzes.json`: predefined quiz data;
- `chatbot_logs.json`: chatbot interaction logs;
- `export_results.py`: script used to export the collected results;
- `requirements.txt`: Python dependencies required by the project.

## How to Run the Project Locally

### 1. Check Python Version

```powershell
py --version
```

### 2. Create a Virtual Environment

```powershell
py -m venv .venv
```

### 3. Activate the Virtual Environment

```powershell
.\.venv\Scripts\Activate.ps1
```

### 4. Install Requirements

```powershell
py -m pip install -r requirements.txt
```

### 5. Run the Flask Server

```powershell
py app.py
```

### 6. Open the Application

After starting the server, open:

```text
http://127.0.0.1:8000
```

or directly:

```text
http://127.0.0.1:8000/experiment
```

## Browser Extension Setup

1. Open Google Chrome or Brave.
2. Go to:

```text
chrome://extensions
```

3. Enable **Developer Mode**.
4. Click **Load unpacked**.
5. Select the `extension` folder containing the browser extension files.
6. Start the Flask server before using the extension.

The extension includes the files required for the browser integration, such as:

```text
manifest.json
background.js
content.js
popup.html
popup.js
```

## Main Features

### Language Detection

The system automatically detects the language of the article text before processing it.

### Multilingual Text Understanding

The application uses multilingual sentence embeddings to support text understanding across different languages.

### Manual Highlighting Mode

Participants manually select and highlight important parts of the article. The system records interaction-related metrics such as the number of highlights and removed highlights.

### AI Main Ideas Support Mode

The system analyzes the article and provides support based on the most important ideas, including short explanations and reading guidance.

### Chatbot Support Mode

Participants can ask questions about the article. The chatbot helps explain concepts from the article and can also support questions about images and figures using available captions, alt text, and surrounding article text.

### Predefined Quizzes

Each article has a predefined quiz. All participants receive the same quiz for the same article, regardless of the assigned reading support mode.

### Data Collection and Export

The application automatically records metrics such as:

- participant ID;
- reading mode;
- article ID and article index;
- quiz score;
- reading time;
- total task time;
- number of manual highlights;
- number of removed highlights;
- number of AI highlights;
- number of chatbot questions;
- quiz answers count.

The collected data are saved in JSON format and automatically exported to Excel, where tables and charts are generated based on the experimental results.

## Notes

Before running the project, make sure that the virtual environment is activated and all requirements are installed.

The other folders in the root directory of the repository contain the literature review, study questionnaires, research paper, experimental data, and statistical analysis files.
