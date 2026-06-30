# AI-Assisted Highlighting for Learning

This project implements a web application and browser extension for a reading comprehension study. The system compares three reading support modes:

1. Manual highlighting mode
2. AI main ideas support mode
3. Chatbot support mode

The experiment uses the same three articles for all participants and each article has a predefined quiz. The application also records interaction-related metrics and exports the collected data to Excel.

## How to run the project locally

### 1. Check Python version


py --version


### 2. Create a virtual environment


py -m venv .venv


### 3. Activate the virtual environment


.\.venv\Scripts\Activate.ps1


### 4. Install requirements


py -m pip install -r requirements.txt


### 5. Create the environment file

Before running the application, create a file named .env in the root folder of the project.

Inside this file, add your API key:

OPENAI_API_KEY=your_api_key_here

Do not upload the .env file to GitLab. The .env file is ignored through .gitignore because it contains private credentials.

### 6. Run the Flask server


py app.py


### 7. Open the application

After starting the server, open:

http://127.0.0.1:8000


or directly:

http://127.0.0.1:8000/experiment


## Browser extension setup

1. Open Google Chrome or Brave.
2. Go to:


chrome://extensions


3. Enable Developer Mode.
4. Click "Load unpacked".
5. Select the project folder that contains the extension files, including:


manifest.json
background.js
content.js
popup.html
popup.js


6. Start the Flask server before using the extension.

## Main features

### Language detection

The system detects the language of the article text automatically before processing it.

### Multilingual text understanding

The application uses multilingual sentence embeddings to support text understanding across different languages.

### Manual highlighting mode

Participants manually select and highlight important parts of the article. The system records interaction metrics such as the number of highlights and removed highlights.

### AI main ideas support mode

The system analyzes the article and provides support based on the most important ideas, including short explanations and reading guidance.

### Chatbot support mode

Participants can ask questions about the article. The chatbot helps explain concepts from the article and can also support questions about images and figures using available captions, alt text, and surrounding article text.

### Predefined quizzes

Each article has a predefined quiz. All participants receive the same quiz for the same article, regardless of the assigned reading support mode.

### Data collection and export

The application automatically records metrics such as:

* participant ID
* reading mode
* article ID and article index
* quiz score
* reading time
* total task time
* number of manual highlights
* number of removed highlights
* number of AI highlights
* number of chatbot questions
* quiz answers count

The collected data are saved in JSON format and automatically exported to Excel, where tables and charts are generated based on the results.

## Notes

Before running the project, make sure the virtual environment is activated and all requirements are installed.
