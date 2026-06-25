
const DEV_BACKEND_URLS = [
  "http://127.0.0.1:8000/api/analyze",
  "http://localhost:8000/api/analyze"
];

const PROD_BACKEND_URL = null;

function getBackendCandidates() {
  const urls = [];
  if (PROD_BACKEND_URL) urls.push(PROD_BACKEND_URL);
  urls.push(...DEV_BACKEND_URLS);
  return urls;
}

async function callBackend(url, text, mode) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Backend error at ${url}`);
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


async function handleNextStudyMode() {
  const result = await chrome.storage.local.get("studyState");
  const studyState = result.studyState;

  if (!studyState) {
    console.warn("[BG] No studyState found.");
    return;
  }

  studyState.currentStep++;

  await chrome.storage.local.set({ studyState });

  console.log(
    "[BG] Quiz finished. Progress saved. Current step is now:",
    studyState.currentStep
  );

  // Dacă toate modurile sunt terminate, anunțăm tab-ul curent.
  if (studyState.currentStep >= studyState.modeOrder.length) {
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

}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "goToExperimentPage") {
  chrome.tabs.query({}, (tabs) => {
    const experimentTab = tabs.find((tab) =>
      tab.url &&
      (
        tab.url.startsWith("http://127.0.0.1:8000/experiment") ||
        tab.url.startsWith("http://localhost:8000/experiment")
      )
    );

    if (experimentTab?.id) {
      chrome.tabs.update(experimentTab.id, {
        active: true
      });

      if (experimentTab.windowId) {
        chrome.windows.update(experimentTab.windowId, {
          focused: true
        });
      }

      sendResponse({
        ok: true,
        status: "Switched to experiment page."
      });

      return;
    }

    chrome.tabs.create({
      url: "http://127.0.0.1:8000/experiment"
    }, () => {
      sendResponse({
        ok: true,
        status: "Opened experiment page."
      });
    });
  });

  return true;
}
 
  if (message.action === "callBackend") {
    (async () => {
      try {
        const data = await callFirstAvailableBackend(message.text, message.mode);
        sendResponse({ ok: true, data });
      } catch (error) {
        console.error("[BG] All backend calls failed:", error);
        sendResponse({ ok: false, error: error.message || "Could not reach backend" });
      }
    })();
    return true; 
  }

  
  if (message.action === "quizFinished") {
    handleNextStudyMode();
    sendResponse({ ok: true });
    return true;
  }

  
  if (message.action === "setManualMode") {
    const key = `manualMode_${message.tabId}`;
    chrome.storage.session.set({ [key]: message.value });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "getManualMode") {
    const key = `manualMode_${message.tabId}`;
    chrome.storage.session.get([key], (result) => {
      sendResponse({ value: !!result[key] });
    });
    return true;
  }
});