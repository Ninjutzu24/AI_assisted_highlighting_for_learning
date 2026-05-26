// ═══════════════════════════════════════════════════════════════
// POPUP.JS
// ═══════════════════════════════════════════════════════════════

const MODE_ORDERS = [
  ["static",      "interactive", "chatbot"],
  ["static",      "chatbot",     "interactive"],
  ["interactive", "static",      "chatbot"],
  ["interactive", "chatbot",     "static"],
  ["chatbot",     "static",      "interactive"],
  ["chatbot",     "interactive", "static"],
];

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

function sendToTab(tabId, message, callback) {
  chrome.tabs.sendMessage(tabId, message, (resp) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[Popup] sendMessage error:",
        chrome.runtime.lastError.message
      );
    }

    if (callback) callback(resp);
  });
}

function getParticipantOrder(participantId) {
  const numericId = parseInt(
    String(participantId).replace(/\D/g, "") || "0"
  );

  return MODE_ORDERS[numericId % MODE_ORDERS.length];
}

function getReadableMode(mode) {
  if (mode === "static") {
    return "✏️ Manual Highlighting";
  }

  if (mode === "interactive") {
    return "🤖 Interactive AI Support";
  }

  if (mode === "chatbot") {
    return "💬 AI Chatbot Support";
  }

  return mode;
}

function isRunnableArticleTab(tab) {
  if (!tab || !tab.url) return false;

  try {
    const url = new URL(tab.url);

    if (!["http:", "https:"].includes(url.protocol)) {
      return false;
    }

    const isLocalExperimentPage =
      (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
      url.port === "8000" &&
      (
        url.pathname === "/" ||
        url.pathname === "/experiment" ||
        url.pathname === "/demo"
      );

    if (isLocalExperimentPage) {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}

function getParticipantIdFromUrl(tab) {
  if (!tab || !tab.url) return null;

  try {
    const url = new URL(tab.url);
    return url.searchParams.get("participantId");
  } catch (error) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────

function setStatus(text) {
  const el = document.getElementById("status");

  if (el) {
    el.textContent = text;
  }
}

function showSetupUI() {
  document.getElementById("setupSection").classList.remove("hidden");
  document.getElementById("activeSection").classList.add("hidden");
}

function showActiveUI(studyState) {
  document.getElementById("setupSection").classList.add("hidden");
  document.getElementById("activeSection").classList.remove("hidden");

  const step = studyState.currentStep + 1;
  const total = studyState.modeOrder.length;
  const mode = studyState.modeOrder[studyState.currentStep];

  document.getElementById("participantLabel").innerHTML =
    `<strong>Participant:</strong> ${studyState.participantId}`;

  document.getElementById("stepLabel").textContent =
    `Step ${step}/${total}: ${getReadableMode(mode)}`;
}

// ─────────────────────────────────────────────────────────────
// LANSARE MOD
// ─────────────────────────────────────────────────────────────

async function launchMode(mode, tabId) {
  if (mode === "static") {
    sendToTab(
      tabId,
      { action: "activateManualMode" },
      (resp) => {
        setStatus(resp?.status || "Manual highlighting activated.");
      }
    );

    return;
  }

  setStatus(`Running ${getReadableMode(mode)}...`);

  sendToTab(
    tabId,
    {
      action: "analyzePage",
      mode
    },
    (resp) => {
      setStatus(resp?.status || "Analysis complete.");
    }
  );
}

async function launchCurrentModeIfPossible(studyState) {
  const tab = await getActiveTab();

  if (!tab?.id) {
    setStatus("No active tab found.");
    return;
  }

  if (!isRunnableArticleTab(tab)) {
    setStatus("Open an article tab, then open the extension again.");
    return;
  }

  const mode = studyState.modeOrder[studyState.currentStep];

  setStatus(`Running ${getReadableMode(mode)}...`);

  await launchMode(mode, tab.id);
}

// ─────────────────────────────────────────────────────────────
// BUTON: Start Session
// ─────────────────────────────────────────────────────────────

document.getElementById("startStudy").addEventListener("click", async () => {
  const participantIdEl = document.getElementById("participantId");
  const participantId = participantIdEl?.value?.trim();

  if (!participantId) {
    alert("Please enter a participant ID.");
    return;
  }

  const order = getParticipantOrder(participantId);

  const studyState = {
    participantId,
    modeOrder: order,
    currentStep: 0,
  };

  await chrome.storage.local.set({ studyState });

  showActiveUI(studyState);

  await launchCurrentModeIfPossible(studyState);
});

// ─────────────────────────────────────────────────────────────
// BUTON: Re-run Current Mode
// ─────────────────────────────────────────────────────────────

document.getElementById("btnResumeMode").addEventListener("click", async () => {
  const result = await chrome.storage.local.get("studyState");
  const studyState = result.studyState;

  if (!studyState) {
    setStatus("No active session.");
    return;
  }

  await launchCurrentModeIfPossible(studyState);
});

// ─────────────────────────────────────────────────────────────
// BUTON: Reset Session
// ─────────────────────────────────────────────────────────────

document.getElementById("btnResetSession").addEventListener("click", async () => {
  if (!confirm("Reset the study session? All progress will be lost.")) {
    return;
  }

  await chrome.storage.local.remove("studyState");

  const tab = await getActiveTab();

  if (tab?.id && isRunnableArticleTab(tab)) {
    sendToTab(tab.id, { action: "deactivateManualMode" });
    sendToTab(tab.id, { action: "clearManualHighlights" });
  }

  const participantIdFromUrl = getParticipantIdFromUrl(tab);

  if (participantIdFromUrl && isRunnableArticleTab(tab)) {
    const order = getParticipantOrder(participantIdFromUrl);

    const studyState = {
      participantId: participantIdFromUrl,
      modeOrder: order,
      currentStep: 0,
    };

    await chrome.storage.local.set({ studyState });

    showActiveUI(studyState);
    setStatus(`Restarted session for participant ${participantIdFromUrl}.`);

    await launchCurrentModeIfPossible(studyState);
    return;
  }

  showSetupUI();
  setStatus("Session reset. Enter a new participant ID.");
});
// ─────────────────────────────────────────────────────────────
// INIT — când popup-ul se deschide
// ─────────────────────────────────────────────────────────────

(async () => {
  const result = await chrome.storage.local.get("studyState");
  let studyState = result.studyState;

  const tab = await getActiveTab();

  if (!studyState) {
    const participantIdFromUrl = getParticipantIdFromUrl(tab);

    if (participantIdFromUrl && isRunnableArticleTab(tab)) {
      const order = getParticipantOrder(participantIdFromUrl);

      studyState = {
        participantId: participantIdFromUrl,
        modeOrder: order,
        currentStep: 0,
      };

      await chrome.storage.local.set({ studyState });
    }
  }

  if (studyState && studyState.currentStep < studyState.modeOrder.length) {
    showActiveUI(studyState);
    await launchCurrentModeIfPossible(studyState);
    return;
  }

  if (studyState && studyState.currentStep >= studyState.modeOrder.length) {
    await chrome.storage.local.remove("studyState");
    showSetupUI();
    setStatus("Previous session completed. Start a new one.");
    return;
  }

  showSetupUI();
})();