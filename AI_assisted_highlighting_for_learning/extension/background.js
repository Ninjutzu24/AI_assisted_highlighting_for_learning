// ═══════════════════════════════════════════════════════════════
// BACKGROUND.JS — UN SINGUR LISTENER PENTRU TOATE MESAJELE
// ═══════════════════════════════════════════════════════════════

const DEV_BACKEND_URLS = [
  "http://127.0.0.1:8000/api/analyze",
  "http://localhost:8000/api/analyze"
];

const PROD_BACKEND_URL = null;

function getBackendCandidates() {
  const urls = [];

  if (PROD_BACKEND_URL) {
    urls.push(PROD_BACKEND_URL);
  }

  urls.push(...DEV_BACKEND_URLS);
  return urls;
}

async function callBackend(url, text, mode) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      mode
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Backend error at ${url}`);
  }

  return data;
}

async function callFirstAvailableBackend(text, mode) {
  const candidates = getBackendCandidates();
  let lastError = null;

  for (const url of candidates) {
    try {
      console.log("[BG] Trying backend:", url);

      const data = await callBackend(url, text, mode);

      console.log("[BG] Backend success:", url);
      return data;
    } catch (error) {
      console.warn("[BG] Backend failed:", url, error);
      lastError = error;
    }
  }

  throw lastError || new Error("No backend URL available");
}

// ═══════════════════════════════════════════════════════════════
// STUDY FLOW
// ═══════════════════════════════════════════════════════════════

async function handleNextStudyMode() {
  const result = await chrome.storage.local.get("studyState");
  const studyState = result.studyState;

  if (!studyState) {
    console.warn("[BG] No studyState found.");
    return;
  }

  studyState.currentStep++;

  if (studyState.currentStep >= studyState.modeOrder.length) {
    await chrome.storage.local.set({ studyState });

    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const tab = tabs[0];

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "experimentFinished"
      });
    }

    return;
  }

  await chrome.storage.local.set({ studyState });

  const nextMode = studyState.modeOrder[studyState.currentStep];

  console.log("[BG] Next mode:", nextMode, "Step:", studyState.currentStep);

  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id) return;

  if (nextMode === "static") {
    chrome.tabs.sendMessage(tab.id, {
      action: "activateManualMode"
    });
  } else {
    chrome.tabs.sendMessage(tab.id, {
      action: "analyzePage",
      mode: nextMode
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// MARK ARTICLE COMPLETE IN /experiment TAB
// ═══════════════════════════════════════════════════════════════

async function markArticleCompletedInExperimentTabs(participantId, articleIndex) {
  const tabs = await chrome.tabs.query({});

  const experimentTabs = tabs.filter((tab) => {
    if (!tab.url) return false;

    try {
      const url = new URL(tab.url);

      return (
        (url.hostname === "127.0.0.1" || url.hostname === "localhost") &&
        url.port === "8000" &&
        url.pathname === "/experiment"
      );
    } catch (error) {
      return false;
    }
  });

  for (const tab of experimentTabs) {
    if (!tab.id) continue;

    chrome.tabs.sendMessage(
      tab.id,
      {
        action: "markArticleCompletedOnExperimentPage",
        participantId,
        articleIndex
      },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.warn(
            "[BG] Could not notify experiment tab:",
            chrome.runtime.lastError.message
          );
          return;
        }

        console.log("[BG] Experiment tab updated:", resp);
      }
    );
  }

  return experimentTabs.length;
}

// ═══════════════════════════════════════════════════════════════
// UN SINGUR LISTENER — toate acțiunile
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Apel backend ──────────────────────────────────────────
  if (message.action === "callBackend") {
    (async () => {
      try {
        const data = await callFirstAvailableBackend(
          message.text,
          message.mode
        );

        sendResponse({
          ok: true,
          data
        });
      } catch (error) {
        console.error("[BG] All backend calls failed:", error);

        sendResponse({
          ok: false,
          error: error.message || "Could not reach backend"
        });
      }
    })();

    return true;
  }

  // ── Marchează articolul completat în pagina /experiment ──
  if (message.action === "markArticleCompleted") {
    (async () => {
      try {
        const participantId = String(message.participantId || "");
        const articleIndex = Number(message.articleIndex || 1);

        const updatedTabs = await markArticleCompletedInExperimentTabs(
          participantId,
          articleIndex
        );

        sendResponse({
          ok: true,
          updatedTabs
        });
      } catch (error) {
        console.error("[BG] markArticleCompleted error:", error);

        sendResponse({
          ok: false,
          error: error.message || "Could not mark article completed"
        });
      }
    })();

    return true;
  }

  // ── Quiz terminat → trece la modul următor ────────────────
  if (message.action === "quizFinished") {
    handleNextStudyMode();

    sendResponse({
      ok: true
    });

    return true;
  }

  // ── Manual mode state pentru popup ────────────────────────
  if (message.action === "setManualMode") {
    const key = `manualMode_${message.tabId}`;

    chrome.storage.session.set({
      [key]: message.value
    });

    sendResponse({
      ok: true
    });

    return true;
  }

  if (message.action === "getManualMode") {
    const key = `manualMode_${message.tabId}`;

    chrome.storage.session.get([key], (result) => {
      sendResponse({
        value: !!result[key]
      });
    });

    return true;
  }
});