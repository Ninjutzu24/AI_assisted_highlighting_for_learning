

const MODE_ORDERS = [
  ["static",      "interactive", "chatbot"],
  ["static",      "chatbot",     "interactive"],
  ["interactive", "static",      "chatbot"],
  ["interactive", "chatbot",     "static"],
  ["chatbot",     "static",      "interactive"],
  ["chatbot",     "interactive", "static"],
];



async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}


function getExperimentInfoFromTab(tab) {
  try {
    const url = new URL(tab.url);

    const participantId =
      url.searchParams.get("participantId");

    const articleIndex =
      Number(url.searchParams.get("articleIndex"));

    if (!participantId || !articleIndex) {
      return null;
    }

    if (articleIndex < 1 || articleIndex > 3) {
      return null;
    }

    return {
      participantId,
      articleIndex
    };
  } catch (e) {
    return null;
  }
}

async function getOrCreateStudyStateFromTab(tab) {
  const result =
    await chrome.storage.local.get("studyState");

  let studyState =
    result.studyState;

  const experimentInfo =
    getExperimentInfoFromTab(tab);

  if (!experimentInfo) {
    return studyState;
  }

  const stepFromArticle =
    experimentInfo.articleIndex - 1;

  if (
    !studyState ||
    String(studyState.participantId) !== String(experimentInfo.participantId)
  ) {
    studyState = {
  participantId: experimentInfo.participantId,
  modeOrder: getParticipantOrder(experimentInfo.participantId),
  currentStep: stepFromArticle
  };

    await chrome.storage.local.set({
      studyState
    });

    return studyState;
  }

  if (
    typeof studyState.currentStep !== "number" ||
    stepFromArticle > studyState.currentStep
  ) {
    studyState.currentStep = stepFromArticle;

    await chrome.storage.local.set({
      studyState
    });
  }

  return studyState;
}

function sendToTab(tabId, message, callback) {
  chrome.tabs.sendMessage(tabId, message, (resp) => {
    if (chrome.runtime.lastError) {
      console.warn("[Popup] sendMessage error:", chrome.runtime.lastError.message);
    }
    if (callback) callback(resp);
  });
}

function getParticipantOrder(participantId) {
  const digits = String(participantId).replace(/\D/g, "");
  const numericId = parseInt(digits || "1", 10);

  const safeNumericId =
    Number.isFinite(numericId) && numericId > 0
      ? numericId
      : 1;

  const orderIndex =
    (safeNumericId - 1) % MODE_ORDERS.length;

  return MODE_ORDERS[orderIndex];
}

function getReadableMode(mode) {
  if (mode === "static")      return "✏️ Manual Highlighting";
  if (mode === "interactive") return "🤖 Interactive AI Support";
  if (mode === "chatbot")     return "💬 AI Chatbot Support";
  return mode;
}



function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function showSetupUI() {
  document.getElementById("setupSection").classList.remove("hidden");
  document.getElementById("activeSection").classList.add("hidden");
}

function showActiveUI(studyState) {
  document.getElementById("setupSection").classList.add("hidden");
  document.getElementById("activeSection").classList.remove("hidden");

  const step  = studyState.currentStep + 1;
  const total = studyState.modeOrder.length;
  const mode  = studyState.modeOrder[studyState.currentStep];

  document.getElementById("participantLabel").innerHTML =
    `<strong>Participant:</strong> ${studyState.participantId}`;
  document.getElementById("stepLabel").textContent =
    `Step ${step}/${total}: ${getReadableMode(mode)}`;
}



function launchMode(mode, tabId) {
  return new Promise((resolve) => {
    if (mode === "static") {
      sendToTab(tabId, { action: "activateManualMode" }, (resp) => {
        setStatus(resp?.status || "Manual highlighting activated.");
        resolve(resp);
      });
    } else {
      setStatus(`Running ${getReadableMode(mode)}...`);

      sendToTab(tabId, { action: "analyzePage", mode }, (resp) => {
        setStatus(resp?.status || "Analysis complete.");
        resolve(resp);
      });
    }
  });
}



document.getElementById("startStudy").addEventListener("click", async () => {
  const participantIdEl = document.getElementById("participantId");
  const participantId   = participantIdEl?.value?.trim();

  if (!participantId) {
    alert("Please enter a participant ID.");
    return;
  }


  const order = getParticipantOrder(participantId);
  const studyState = {
    participantId,
    modeOrder:    order,
    currentStep:  0,
  };

  await chrome.storage.local.set({ studyState });
  showActiveUI(studyState);

  const tab = await getActiveTab();
  if (!tab?.id) { setStatus("No active tab found."); return; }

  await launchMode(studyState.modeOrder[0], tab.id);
  setTimeout(() => {
  window.close();
}, 300);
});



document.getElementById("btnResumeMode").addEventListener("click", async () => {
  const tab = await getActiveTab();

  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  const studyState =
    await getOrCreateStudyStateFromTab(tab);

  if (!studyState) {
    setStatus("Open an experiment article first.");
    return;
  }

  const mode =
    studyState.modeOrder[studyState.currentStep];

  setStatus(`Starting ${getReadableMode(mode)}...`);

  await launchMode(mode, tab.id);

  setTimeout(() => {
    window.close();
  }, 300);
});




  const resetButton = document.getElementById("btnResetSession");

if (resetButton) {
  resetButton.addEventListener("click", async () => {
    if (!confirm("Reset the study session? All progress will be lost.")) return;

    await chrome.storage.local.remove("studyState");

    const tab = await getActiveTab();
    if (tab?.id) {
      sendToTab(tab.id, { action: "deactivateManualMode" });
      sendToTab(tab.id, { action: "clearHighlights" });
    }

    showSetupUI();
    setStatus("Session reset. Enter a new participant ID.");
  });
}



(async () => {
  const tab = await getActiveTab();

  let studyState = null;

  if (tab?.id) {
    studyState = await getOrCreateStudyStateFromTab(tab);
  }

  if (studyState && studyState.currentStep < studyState.modeOrder.length) {
    showActiveUI(studyState);
    setStatus("Session in progress.");
  } 
  else if (studyState && studyState.currentStep >= studyState.modeOrder.length) {
    await chrome.storage.local.remove("studyState");
    showSetupUI();
    setStatus("Previous session completed. Start a new one.");
  } 
  else {
    showSetupUI();
    setStatus("Open an experiment article or enter a participant ID.");
  }
})();