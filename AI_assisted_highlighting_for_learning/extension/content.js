

const MANUAL_COLORS = [
  { id: "yellow", hex: "#FFD600", label: "Yellow" },
  { id: "green",  hex: "#69F0AE", label: "Green"  },
  { id: "blue",   hex: "#40C4FF", label: "Blue"   },
  { id: "pink",   hex: "#FF80AB", label: "Pink"   },
  { id: "orange", hex: "#FFAB40", label: "Orange" },
  { id: "purple", hex: "#CE93D8", label: "Purple" },
];

const STORAGE_KEY = () => `ai-manual-hl::${window.location.href}`;

let quizUserAnswers = {};
let quizSubmitted = false;

const TASK_TIME_LIMIT_SECONDS = 10 *60 ;

let taskMetrics = null;
let taskTimerInterval = null;
let quizIsOpen = false;

function isExperimentMainPage() {
  return (
    (window.location.hostname === "127.0.0.1" ||
     window.location.hostname === "localhost") &&
    window.location.pathname === "/experiment"
  );
}

function cleanupExtensionUI() {
  stopTaskTimer();
  document.getElementById("ai-task-timer")?.remove();

  removeFinishButton();
  deactivateManualMode();

  removeColorPalette();
  removeActiveTooltip();
  removeManualHint();

  clearHighlights();
  removeSidePanel();

  document.getElementById("ai-quiz-popup")?.remove();
  document.getElementById("ai-task-completed-popup")?.remove();
  document.getElementById("ai-experiment-finished")?.remove();

  quizIsOpen = false;
  window.getSelection()?.removeAllRanges();
}

if (isExperimentMainPage()) {
  setTimeout(cleanupExtensionUI, 100);
}

window.addEventListener("pageshow", () => {
  if (isExperimentMainPage()) {
    cleanupExtensionUI();
  }
});


window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const message = event.data;

  if (!message || message.type !== "AI_READING_RESET_EXTENSION_SESSION") {
    return;
  }

  const allowedHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

  if (!allowedHost) {
    return;
  }

  console.log("[EXTENSION RESET] Clearing studyState from HTML page reset.");

  await chrome.storage.local.remove([
    "studyState",
    "experimentProgress"
  ]);

  stopTaskTimer();
  document.getElementById("ai-task-timer")?.remove();
  removeFinishButton();
  deactivateManualMode();
  clearHighlights();
  removeSidePanel();
});

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const message = event.data;

  if (
    !message ||
    message.type !== "AI_READING_REQUEST_EXTENSION_PROGRESS"
  ) {
    return;
  }

  const allowedHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

  if (!allowedHost) {
    return;
  }

  const result =
    await chrome.storage.local.get("experimentProgress");

  const progress =
    result.experimentProgress;

  if (!progress) {
    return;
  }

 window.postMessage({
    type: "AI_READING_EXTENSION_PROGRESS",
    participantId: progress.participantId,
    completedCount: progress.completedCount || 0,
    articleIndex: progress.articleIndex,
    quizCompletedTaskIndex: progress.quizCompletedTaskIndex || null,
    susNasaPending: !!progress.susNasaPending
  }, "*");
});

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const message = event.data;

  if (
    !message ||
    message.type !== "AI_READING_SUS_NASA_SUBMITTED"
  ) {
    return;
  }

  const allowedHost =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

  if (!allowedHost) {
    return;
  }

  const result = await chrome.storage.local.get("studyState");
  const studyState = result.studyState;

  if (!studyState) {
    return;
  }

  if (
    String(studyState.participantId) !==
    String(message.participantId)
  ) {
    return;
  }

  const completedTaskIndex = Number(message.taskIndex);

  if (
    !Number.isFinite(completedTaskIndex) ||
    completedTaskIndex < 1 ||
    completedTaskIndex > studyState.modeOrder.length
  ) {
    return;
  }

  studyState.currentStep = Math.min(
    completedTaskIndex,
    studyState.modeOrder.length
  );

  await chrome.storage.local.set({
    studyState,
    experimentProgress: {
      participantId: studyState.participantId,
      completedCount: completedTaskIndex,
      articleIndex: completedTaskIndex,
      susNasaPending: false,
      susNasaCompletedAt: Date.now()
    }
  });

  console.log(
    "[SUS/NASA] Submitted. Current step is now:",
    studyState.currentStep
  );
});

function startTaskMetrics(mode) {
  stopTaskTimer();

  taskMetrics = {
    mode,
    startTime: Date.now(),
    quizOpenedAt: null,
    submittedAt: null,

    timeLimitSeconds: TASK_TIME_LIMIT_SECONDS,
    timeLimitReached: false,

    manualHighlightCount: 0,
    manualHighlightRemoveCount: 0,
    aiHighlightCount: 0,
    interactiveCardsShown: 0,
    chatbotQuestionCount: 0
  };

  renderTaskTimer();

  taskTimerInterval = setInterval(() => {
    updateTaskTimer();
  }, 1000);

  updateTaskTimer();

  console.log("[METRICS] Task started:", taskMetrics);
}

function stopTaskTimer() {
  if (taskTimerInterval) {
    clearInterval(taskTimerInterval);
    taskTimerInterval = null;
  }
}

function getElapsedTaskSeconds() {
  if (!taskMetrics?.startTime) return 0;
  return Math.floor((Date.now() - taskMetrics.startTime) / 1000);
}

function renderTaskTimer() {
  document.getElementById("ai-task-timer")?.remove();

  const timer = document.createElement("div");
  timer.id = "ai-task-timer";
  timer.style.cssText = `
    position:fixed;
    bottom:72px;
    left:20px;
    z-index:999999;
    padding:10px 14px;
    background:#111827;
    color:white;
    border-radius:10px;
    font-family:Arial,sans-serif;
    font-size:13px;
    font-weight:bold;
    box-shadow:0 4px 12px rgba(0,0,0,0.25);
  `;

  document.body.appendChild(timer);
}

function updateTaskTimer() {
  const timer = document.getElementById("ai-task-timer");
  if (!timer || !taskMetrics) return;

  const elapsed = getElapsedTaskSeconds();
  const remaining = Math.max(
    0,
    TASK_TIME_LIMIT_SECONDS - elapsed
  );

  const min = String(Math.floor(remaining / 60)).padStart(2, "0");
  const sec = String(remaining % 60).padStart(2, "0");

  if (remaining <= 0) {
    taskMetrics.timeLimitReached = true;
    timer.style.background = "#dc2626";
    timer.textContent = "⏰ Time is up — take the quiz";
    return;
  }

  timer.textContent = `⏱ Time left: ${min}:${sec}`;
}

function markQuizOpened() {
  if (!taskMetrics) return;

  if (!taskMetrics.quizOpenedAt) {
    taskMetrics.quizOpenedAt = Date.now();
  }
}

function getArticleInfoForMetrics(studyState) {
  const params = new URLSearchParams(window.location.search);

  const fallbackIndex =
    typeof studyState?.currentStep === "number"
      ? studyState.currentStep + 1
      : 1;

  const articleIndex =
    Number(params.get("articleIndex") || fallbackIndex);

  const articleId =
    params.get("articleId") ||
    params.get("articleIndex") ||
    String(articleIndex);

  return {
    articleId,
    articleIndex
  };
}

function buildMetricsForSave(total, studyState) {
  const now = Date.now();

  const articleInfo =
    getArticleInfoForMetrics(studyState);

  const startTime =
    taskMetrics?.startTime || now;

  const quizOpenedAt =
    taskMetrics?.quizOpenedAt || now;

  const readingTimeSeconds =
    Math.floor((quizOpenedAt - startTime) / 1000);

  const totalTaskTimeSeconds =
    Math.floor((now - startTime) / 1000);

  return {
    articleId: articleInfo.articleId,
    articleIndex: articleInfo.articleIndex,

    startedAt: new Date(startTime).toISOString(),
    quizOpenedAt: new Date(quizOpenedAt).toISOString(),
    submittedAt: new Date(now).toISOString(),

    readingTimeSeconds,
    totalTaskTimeSeconds,

    timeLimitSeconds: TASK_TIME_LIMIT_SECONDS,
    timeLimitReached: !!taskMetrics?.timeLimitReached,

    manualHighlightCount: taskMetrics?.manualHighlightCount || 0,
    manualHighlightRemoveCount: taskMetrics?.manualHighlightRemoveCount || 0,
    aiHighlightCount: taskMetrics?.aiHighlightCount || 0,
    interactiveCardsShown: taskMetrics?.interactiveCardsShown || 0,
    chatbotQuestionCount: taskMetrics?.chatbotQuestionCount || 0,

    quizQuestionCount: total,
    quizAnsweredCount: Object.keys(quizUserAnswers).length
  };
}



async function saveQuizResult(correct, total, score) {

  const result =
    await chrome.storage.local.get("studyState");

  const studyState =
    result.studyState;

  if (!studyState) return;

  const currentMode =
    studyState.modeOrder[
      studyState.currentStep
    ];

  const extraMetrics =
    buildMetricsForSave(total, studyState);

  fetch("http://127.0.0.1:8000/api/save_result", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      participantId: studyState.participantId,
      mode: currentMode,
      correct,
      total,
      score,
      ...extraMetrics
    })
  })
  .then(r => r.json())
  .then(data => {
    console.log(
      "[SAVE RESULT]",
      data
    );
  })
  .catch(err => {
    console.error(
      "[SAVE RESULT ERROR]",
      err
    );
  });
}

function saveManualHighlight(entry) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY()) || "[]";
    const list = JSON.parse(raw);
    list.push(entry);
    sessionStorage.setItem(STORAGE_KEY(), JSON.stringify(list));
  } catch (e) {}
}

function loadManualHighlights() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY()) || "[]"); }
  catch (e) { return []; }
}

function clearAllManualStorage() {
  try { sessionStorage.removeItem(STORAGE_KEY()); } catch (e) {}
}



let manualHighlightCounter = 0;


function isInsideExtensionUI(node) {
  const element =
    node.nodeType === Node.TEXT_NODE
      ? node.parentElement
      : node;

  if (!element) return false;

  return !!element.closest(
    "#ai-color-palette, #ai-manual-remove-tooltip, #ai-manual-hint, #ai-task-timer, #ai-finish-btn, #ai-side-panel, #ai-quiz-popup, #ai-task-completed-popup, #ai-experiment-finished"
  );
}

function createManualHighlightSpan(color, colorId, hlId) {
  const span = document.createElement("span");

  span.className = "ai-manual-highlight";
  span.dataset.colorId = colorId;
  span.dataset.hlId = hlId;

  span.style.cssText = `
    background-color:${color.hex} !important;
    border-radius:2px;
    padding:0 1px;
    cursor:pointer;
    box-decoration-break:clone;
    -webkit-box-decoration-break:clone;
  `;

  span.addEventListener("click", (e) => {
    e.stopPropagation();
    showRemoveTooltip(span, hlId, e.clientX, e.clientY);
  });

  return span;
}

function getTextSegmentsFromRange(range) {
  const root =
    range.commonAncestorContainer.nodeType === Node.TEXT_NODE
      ? range.commonAncestorContainer.parentNode
      : range.commonAncestorContainer;

  const segments = [];

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_REJECT;
        }

        if (isInsideExtensionUI(node)) {
          return NodeFilter.FILTER_REJECT;
        }

        const cls = node.parentNode?.classList;

        if (
          cls?.contains("ai-manual-highlight") ||
          cls?.contains("ai-highlight") ||
          cls?.contains("ai-highlight-key")
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        try {
          return range.intersectsNode(node)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        } catch (e) {
          return NodeFilter.FILTER_REJECT;
        }
      }
    },
    false
  );

  let node;

  while ((node = walker.nextNode())) {
    const text = node.textContent;

    let start = 0;
    let end = text.length;

    if (node === range.startContainer) {
      start = range.startOffset;
    }

    if (node === range.endContainer) {
      end = range.endOffset;
    }

    while (start < end && /\s/.test(text[start])) {
      start++;
    }

    while (end > start && /\s/.test(text[end - 1])) {
      end--;
    }

    if (end > start) {
      segments.push({
        node,
        start,
        end,
        text: text.slice(start, end)
      });
    }
  }

  return segments;
}


function applyManualHighlight(range, colorId) {
  if (!range || range.collapsed) return null;

  const color = MANUAL_COLORS.find((c) => c.id === colorId);
  if (!color) return null;

  const selectedText = range.toString().trim();
  if (!selectedText || selectedText.length < 1) return null;

  const segments = getTextSegmentsFromRange(range);

  if (!segments.length) {
    return null;
  }

  try {
    const hlId = "mhl-" + (++manualHighlightCounter);
    const wrappedTexts = [];

    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = segments[i];

      const localRange = document.createRange();

      localRange.setStart(segment.node, segment.start);
      localRange.setEnd(segment.node, segment.end);

      const span = createManualHighlightSpan(
        color,
        colorId,
        hlId
      );

      localRange.surroundContents(span);

      wrappedTexts.unshift(segment.text);
    }

    if (taskMetrics) {
      taskMetrics.manualHighlightCount++;
    }

    return {
      colorId,
      text: selectedText,
      hlId,
      segments: wrappedTexts
    };

  } catch (err) {
    console.warn("[Manual HL] Apply failed:", err);
    return null;
  }
}


let activeTooltip = null;

function showRemoveTooltip(spanEl, hlId, x, y) {
  removeActiveTooltip();
  const tooltip = document.createElement("div");
  tooltip.id = "ai-manual-remove-tooltip";
  tooltip.style.cssText = `position:fixed !important;z-index:2147483647 !important;
    top:${Math.min(y + 10, window.innerHeight - 60)}px;
    left:${Math.min(x, window.innerWidth - 180)}px;
    background:#1e1e2e;border:1px solid #555;border-radius:6px;
    padding:6px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:Arial,sans-serif;`;
  const btn = document.createElement("button");
  btn.textContent = "✕ Remove highlight";
  btn.style.cssText = `background:none;border:none;color:#ff6b6b;font-size:13px;cursor:pointer;padding:0;font-family:Arial,sans-serif;`;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeManualHighlightBySpan(spanEl, hlId);
    removeActiveTooltip();
  });
  tooltip.appendChild(btn);
  document.body.appendChild(tooltip);
  activeTooltip = tooltip;
  setTimeout(() => {
    document.addEventListener("click", removeActiveTooltip, { once: true });
  }, 0);
}

function removeActiveTooltip() {
  if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
}

function removeManualHighlightBySpan(spanEl, hlId) {
  const spans = Array
    .from(document.querySelectorAll("span.ai-manual-highlight"))
    .filter((span) => span.dataset.hlId === hlId);

  const spansToRemove =
    spans.length > 0
      ? spans
      : [spanEl];

  spansToRemove.forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;

    while (span.firstChild) {
      parent.insertBefore(span.firstChild, span);
    }

    parent.removeChild(span);
    parent.normalize();
  });

  if (taskMetrics) {
    taskMetrics.manualHighlightRemoveCount++;
  }

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY()) || "[]";
    const list = JSON.parse(raw);

    const newList =
      list.filter((e) => e.hlId !== hlId);

    sessionStorage.setItem(
      STORAGE_KEY(),
      JSON.stringify(newList)
    );
  } catch (e) {}
}



let paletteEl = null;
let savedRange = null;

function showColorPalette(rect, range) {
  removeColorPalette();
  savedRange = range.cloneRange();

  const palette = document.createElement("div");
  palette.id = "ai-color-palette";

  const paletteW = 220;
  const paletteH = 44;
  let left = rect.left + rect.width / 2 - paletteW / 2;
  let top  = rect.top - paletteH - 10;

  left = Math.max(8, Math.min(left, window.innerWidth  - paletteW - 8));
  top  = rect.top < paletteH + 20 ? rect.bottom + 8 : Math.max(8, top);

  palette.style.cssText = `
    position:fixed !important;z-index:2147483647 !important;
    top:${top}px !important;left:${left}px !important;
    display:flex !important;gap:8px !important;
    padding:8px 12px !important;background:#1e1e2e !important;
    border:1px solid #555 !important;border-radius:10px !important;
    box-shadow:0 4px 24px rgba(0,0,0,0.5) !important;
    align-items:center !important;pointer-events:auto !important;
  `;

  MANUAL_COLORS.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.title = color.label;
    swatch.style.cssText = `
      width:24px !important;height:24px !important;border-radius:50% !important;
      background:${color.hex} !important;border:2px solid transparent !important;
      cursor:pointer !important;flex-shrink:0 !important;
      transition:transform 0.12s,border-color 0.12s !important;
    `;
    swatch.addEventListener("mouseenter", () => { swatch.style.transform = "scale(1.3)"; swatch.style.borderColor = "#fff"; });
    swatch.addEventListener("mouseleave", () => { swatch.style.transform = "scale(1)";   swatch.style.borderColor = "transparent"; });
    swatch.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    swatch.addEventListener("click", (e) => {
      e.stopPropagation(); e.preventDefault();
      removeColorPalette();
      if (savedRange) {
        try {
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(savedRange);
          const entry = applyManualHighlight(savedRange, color.id);
          if (entry) {
            saveManualHighlight(entry);
            removeManualHint();
            console.log(`[Manual HL] Aplicat: ${color.label} — "${entry.text.substring(0, 40)}"`);
          }
          sel.removeAllRanges();
          savedRange = null;
        } catch (err) { console.warn("[Manual HL] Swatch click error:", err); }
      }
    });
    palette.appendChild(swatch);
  });


  const sep = document.createElement("div");
  sep.style.cssText = "width:1px !important;height:20px !important;background:#555 !important;margin:0 2px !important;flex-shrink:0 !important;";
  palette.appendChild(sep);

  const clearBtn = document.createElement("div");
  clearBtn.title = "Clear all manual highlights";
  clearBtn.textContent = "✕";
  clearBtn.style.cssText = "color:#888 !important;font-size:15px !important;cursor:pointer !important;padding:0 2px !important;line-height:1 !important;user-select:none !important;";
  clearBtn.addEventListener("mouseenter", () => (clearBtn.style.color = "#ff6b6b"));
  clearBtn.addEventListener("mouseleave", () => (clearBtn.style.color = "#888"));
  clearBtn.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
  clearBtn.addEventListener("click", (e) => { e.stopPropagation(); clearAllManualHighlights(); removeColorPalette(); window.getSelection().removeAllRanges(); });
  palette.appendChild(clearBtn);

  document.body.appendChild(palette);
  paletteEl = palette;
  console.log(`[Manual HL] Paletă afișată top:${top}px left:${left}px`);
}

function removeColorPalette() {
  if (paletteEl) { paletteEl.remove(); paletteEl = null; }
}

function clearAllManualHighlights() {
  document.querySelectorAll("span.ai-manual-highlight").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    parent.normalize();
  });
  clearAllManualStorage();
}


let selectionTimer = null;

function onMouseUp(e) {
    if (document.getElementById("ai-quiz-popup")?.contains(e.target)) {
    removeColorPalette();
    return;
  }
  if (paletteEl?.contains(e.target)) return;
  if (activeTooltip?.contains(e.target)) return;

  clearTimeout(selectionTimer);
  selectionTimer = setTimeout(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) { removeColorPalette(); return; }
    const selectedText = sel.toString().trim();
    console.log(`[Manual HL] mouseup — "${selectedText.substring(0, 50)}"`);
    if (selectedText.length < 1) { removeColorPalette(); return; }
    const range = sel.getRangeAt(0);
    const rect  = range.getBoundingClientRect();
    showColorPalette(rect, range);
  }, 100);
}

function onKeyUp(e) {
  if (e.key === "Escape") { removeColorPalette(); removeActiveTooltip(); return; }
  if (e.shiftKey) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    if (sel.toString().trim().length < 1) return;
    const range = sel.getRangeAt(0);
    showColorPalette(range.getBoundingClientRect(), range);
  }
}



function restoreManualHighlights() {
  const entries = loadManualHighlights();
  if (!entries.length) return;
  console.log(`[Manual HL] Restaurăm ${entries.length} highlight-uri.`);

  entries.forEach((entry) => {
    if (!entry.text || entry.text.length < 1) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.parentNode?.classList?.contains("ai-manual-highlight") ||
            node.parentNode?.classList?.contains("ai-highlight")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }, false);

    let node, found = false;
    while ((node = walker.nextNode()) && !found) {
      const idx = node.textContent.indexOf(entry.text);
      if (idx === -1) continue;
      try {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + entry.text.length);
        const color = MANUAL_COLORS.find((c) => c.id === entry.colorId);
        if (!color) continue;
        const hlId = entry.hlId || "mhl-" + (++manualHighlightCounter);
        const span = document.createElement("span");
        span.className = "ai-manual-highlight";
        span.dataset.colorId = entry.colorId;
        span.dataset.hlId = hlId;
        span.style.cssText = `background-color:${color.hex} !important;border-radius:2px;padding:0 1px;cursor:pointer;`;
        range.surroundContents(span);
        span.addEventListener("click", (e) => { e.stopPropagation(); showRemoveTooltip(span, hlId, e.clientX, e.clientY); });
        found = true;
      } catch (err) {}
    }
  });
}



let manualModeActive = false;

function activateManualMode() {
  if (manualModeActive) return;
  startTaskMetrics("static");
  manualModeActive = true;
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keyup", onKeyUp);
  restoreManualHighlights();
  renderFinishButton();
  renderManualHint();
  console.log("[Manual HL] ✅ Activat — selectează text pentru paletă.");
}

function deactivateManualMode() {
  if (!manualModeActive) return;
  manualModeActive = false;
  document.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("keyup", onKeyUp);
  removeColorPalette();
  removeActiveTooltip();
  removeManualHint();
  console.log("[Manual HL] Dezactivat.");
}



function getSiteSelectors() {
  const host = window.location.hostname;
  if (host.includes("dl.acm.org"))         return ["div.article-section__content p","section.article-section p",".article__body p","div.article-section__content > div"];
  if (host.includes("ieeexplore.ieee.org")) return ["div.article-content p","xpl-document-details p",".abstract-text p"];
  if (host.includes("springer.com") || host.includes("nature.com") || host.includes("link.springer.com")) return ["div.c-article-body p","section.c-article-section p","div#body p"];
  if (host.includes("sciencedirect.com"))  return ["div.abstract p","div.section-paragraph","p.para"];
  if (host.includes("arxiv.org"))          return ["div.ltx_para p","div#abs p",".abstract p"];
  return ["p"];
}

function extractParagraphNodes() {
  const selectors = getSiteSelectors();
  const seen = new Set();
  const result = [];
  for (const sel of selectors) {
    try {
      for (const node of document.querySelectorAll(sel)) {
        if (seen.has(node)) continue;
        seen.add(node);
        if ((node.innerText || "").trim().length > 80) result.push(node);
      }
    } catch (e) {}
  }
  if (result.length === 0) {
    return Array.from(document.querySelectorAll("p")).filter((p) => p.innerText?.trim().length > 80);
  }
  return result;
}

function cleanParagraphText(text) {
  return text.replace(/\[\d+\]/g, "").replace(/\[note \d+\]/gi, "").replace(/\s+/g, " ").trim();
}

function extractParagraphTexts() {
  return extractParagraphNodes().map((p) => cleanParagraphText(p.innerText)).filter((t) => t.length > 80);
}

function cleanImageContextText(text, maxLength = 700) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function looksLikeCaptionElement(el) {
  if (!el) return false;

  const tag =
    el.tagName?.toLowerCase() || "";

  const cls =
    String(el.className || "").toLowerCase();

  return (
    tag === "figcaption" ||
    cls.includes("caption") ||
    cls.includes("figcaption") ||
    cls.includes("image-caption") ||
    cls.includes("photo-caption")
  );
}

function findImageCaption(img) {
  const candidates = [];

  const figure =
    img.closest("figure");

  if (figure) {
    candidates.push(
      ...figure.querySelectorAll("figcaption")
    );
  }

  const parent =
    img.parentElement;

  if (parent) {
    candidates.push(parent.previousElementSibling);
    candidates.push(parent.nextElementSibling);

    candidates.push(
      ...parent.querySelectorAll("figcaption")
    );
  }

  candidates.push(img.previousElementSibling);
  candidates.push(img.nextElementSibling);

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (!looksLikeCaptionElement(candidate)) {
      continue;
    }

    const text =
      cleanImageContextText(
        candidate.innerText || candidate.textContent,
        500
      );

    if (text.length >= 5) {
      return text;
    }
  }

  return "";
}

function findNearbyTextForImage(img) {
  const imgRect =
    img.getBoundingClientRect();

  const imgTop =
    imgRect.top + window.scrollY;

  const paragraphs =
    extractParagraphNodes()
      .filter((p) => !isInsideExtensionUI(p))
      .map((p) => {
        const rect =
          p.getBoundingClientRect();

        const top =
          rect.top + window.scrollY;

        return {
          text: cleanImageContextText(p.innerText, 500),
          distance: Math.abs(top - imgTop)
        };
      })
      .filter((p) => p.text.length > 80)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3)
      .map((p) => p.text);

  return paragraphs.join(" ");
}

function extractImageContexts() {
  const images =
    Array.from(document.querySelectorAll("img"));

  const result = [];
  const seen = new Set();

  for (const img of images) {
    if (isInsideExtensionUI(img)) {
      continue;
    }

    const src =
      img.currentSrc || img.src || "";

    if (!src || seen.has(src)) {
      continue;
    }

    const rect =
      img.getBoundingClientRect();

    const naturalWidth =
      img.naturalWidth || 0;

    const naturalHeight =
      img.naturalHeight || 0;

    const isLargeEnough =
      (rect.width >= 120 && rect.height >= 80) ||
      (naturalWidth >= 120 && naturalHeight >= 80);

    if (!isLargeEnough) {
      continue;
    }

    const alt =
      cleanImageContextText(
        img.alt ||
        img.getAttribute("aria-label") ||
        img.title ||
        "",
        300
      );

    const caption =
      findImageCaption(img);

    const nearbyText =
      findNearbyTextForImage(img);

    if (!alt && !caption && !nearbyText) {
      continue;
    }

    result.push({
      index: result.length + 1,
      alt,
      caption,
      nearbyText
    });

    seen.add(src);

    if (result.length >= 8) {
      break;
    }
  }

  console.log("[CHATBOT IMAGE CONTEXTS]", result);

  return result;
}


function normalizeText(text) {
  return text.replace(/\[\d+\]/g, "").replace(/\[note \d+\]/gi, "").replace(/\s+/g, " ").trim();
}

function createAutoHighlightFragment(rawText) {
  const text = String(rawText || "");

  const leadingMatch = text.match(/^\s*/);
  const trailingMatch = text.match(/\s*$/);

  const leading = leadingMatch ? leadingMatch[0] : "";
  const trailing = trailingMatch ? trailingMatch[0] : "";

  const core = text.slice(
    leading.length,
    text.length - trailing.length
  );

  const fragment = document.createDocumentFragment();

  if (leading) {
    fragment.appendChild(
      document.createTextNode(leading)
    );
  }

  if (core) {
    const span = document.createElement("span");

    span.className = "ai-highlight";

    span.style.cssText = `
      background-color:#FFD600 !important;
      color:inherit !important;
      padding:0 !important;
      margin:0 !important;
      border-radius:0 !important;
      line-height:inherit !important;
      display:inline !important;
      box-decoration-break:clone;
      -webkit-box-decoration-break:clone;
    `;

    span.textContent = core;

    fragment.appendChild(span);
  }

  if (trailing) {
    fragment.appendChild(
      document.createTextNode(trailing)
    );
  }

  return fragment;
}



function mapNormalizedToOriginal(originalText, normalizedIndex) {
  let normCount = 0, i = 0;
  while (i < originalText.length) {
    if (originalText[i] === "[") {
      const end = originalText.indexOf("]", i);
      if (end !== -1 && /^\[\d+\]$/.test(originalText.substring(i, end + 1))) { i = end + 1; continue; }
      if (end !== -1 && /^\[note \d+\]$/i.test(originalText.substring(i, end + 1))) { i = end + 1; continue; }
    }
    if (" \t\n".includes(originalText[i])) { i++; continue; }
    break;
  }
  while (i < originalText.length) {
    if (normCount === normalizedIndex) return i;
    if (originalText[i] === "[") {
      const end = originalText.indexOf("]", i);
      if (end !== -1 && /^\[\d+\]$/.test(originalText.substring(i, end + 1))) { i = end + 1; continue; }
      if (end !== -1 && /^\[note \d+\]$/i.test(originalText.substring(i, end + 1))) { i = end + 1; continue; }
    }
    if (" \t\n".includes(originalText[i])) {
      normCount++; i++;
      while (i < originalText.length && " \t\n".includes(originalText[i])) i++;
      continue;
    }
    normCount++; i++;
  }
  return i;
}

function highlightInTextNodes(element, normalizedSearch) {
  const textNodes = [];

  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const cls = node.parentNode?.classList;

        if (
          cls?.contains("ai-highlight") ||
          cls?.contains("ai-highlight-key") ||
          cls?.contains("ai-manual-highlight")
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    },
    false
  );

  let tn;

  while ((tn = walker.nextNode())) {
    if (normalizeText(tn.textContent).length > 0) {
      textNodes.push(tn);
    }
  }

  if (textNodes.length === 0) {
    return false;
  }

  let concatenated = "";
  const positions = [];

  for (const node of textNodes) {
    const norm = normalizeText(node.textContent);

    positions.push({
      node,
      normStart: concatenated.length,
      normEnd: concatenated.length + norm.length,
      origText: node.textContent
    });

    concatenated += norm + " ";
  }

  const matchStart = concatenated.indexOf(normalizedSearch);

  if (matchStart === -1) {
    return false;
  }

  const matchEnd =
    matchStart + normalizedSearch.length;

  const overlapping = positions.filter((p) =>
    p.normStart < matchEnd &&
    p.normEnd > matchStart
  );

  if (overlapping.length === 0) {
    return false;
  }

  if (overlapping.length === 1) {
    const pos = overlapping[0];

    const origStart =
      mapNormalizedToOriginal(
        pos.origText,
        matchStart - pos.normStart
      );

    const origEnd =
      mapNormalizedToOriginal(
        pos.origText,
        matchEnd - pos.normStart
      );

    if (origStart < 0 || origEnd <= origStart) {
      return false;
    }

    const before =
      pos.origText.substring(0, origStart);

    const matched =
      pos.origText.substring(origStart, origEnd);

    const after =
      pos.origText.substring(origEnd);

    if (!matched.trim()) {
      return false;
    }

    const fragment =
      createAutoHighlightFragment(matched);

    const parent =
      pos.node.parentNode;

    if (before) {
      parent.insertBefore(
        document.createTextNode(before),
        pos.node
      );
    }

    parent.insertBefore(
      fragment,
      pos.node
    );

    if (after) {
      parent.insertBefore(
        document.createTextNode(after),
        pos.node
      );
    }

    parent.removeChild(pos.node);

    return true;
  }

  let success = false;

  for (const pos of overlapping) {
    const localStart =
      Math.max(0, matchStart - pos.normStart);

    const localEnd =
      Math.min(
        pos.normEnd - pos.normStart,
        matchEnd - pos.normStart
      );

    if (localEnd <= localStart) {
      continue;
    }

    const origStart =
      mapNormalizedToOriginal(
        pos.origText,
        localStart
      );

    const origEnd =
      mapNormalizedToOriginal(
        pos.origText,
        localEnd
      );

    if (origStart < 0 || origEnd <= origStart) {
      continue;
    }

    const before =
      pos.origText.substring(0, origStart);

    const matched =
      pos.origText.substring(origStart, origEnd);

    const after =
      pos.origText.substring(origEnd);

    if (!matched.trim()) {
      continue;
    }

    const fragment =
      createAutoHighlightFragment(matched);

    const parent =
      pos.node.parentNode;

    if (before) {
      parent.insertBefore(
        document.createTextNode(before),
        pos.node
      );
    }

    parent.insertBefore(
      fragment,
      pos.node
    );

    if (after) {
      parent.insertBefore(
        document.createTextNode(after),
        pos.node
      );
    }

    parent.removeChild(pos.node);

    success = true;
  }

  return success;
}

function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+(?=[A-ZĂÂÎȘȚА-Я\u00C0-\u00DC])/)
    .map((s) => s.trim()).filter((s) => s.length > 15 && s.split(" ").length >= 4);
}

function wordOverlapScore(needle, haystack) {
  const words = needle.split(" ").filter((w) => w.length > 3);
  if (!words.length) return 0;
  return words.filter((w) => haystack.includes(w)).length / words.length;
}

function highlightBestMatchingSentence(paraNode, normalizedHighlight) {
  const paraText = normalizeText(paraNode.innerText);
  const sentences = splitIntoSentences(paraText);
  if (!sentences.length) return paraText.length > 15 ? highlightInTextNodes(paraNode, paraText) : false;
  let best = null, bestScore = 0;
  for (const s of sentences) {
    const score = wordOverlapScore(normalizedHighlight, s);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  const hlWords = normalizedHighlight.split(" ").filter((w) => w.length > 3);
  const common = best ? hlWords.filter((w) => best.includes(w)).length : 0;
  if (!best || bestScore < 0.45 || common < Math.min(3, Math.ceil(hlWords.length * 0.45))) return false;
  return highlightInTextNodes(paraNode, best);
}

function tryHighlightWithFallbacks(paraNode, norm) {
  return highlightInTextNodes(paraNode, norm) || highlightBestMatchingSentence(paraNode, norm);
}

function quickContainsCheck(paraText, hlText) {
  if (paraText.includes(hlText)) return true;
  const words = hlText.split(" ").filter((w) => w.length > 3);
  if (!words.length) return false;
  return words.filter((w) => paraText.includes(w)).length / words.length >= 0.50;
}



function clearHighlights() {
  document.querySelectorAll("span.ai-highlight, span.ai-highlight-key").forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent), span);
    parent.normalize();
  });
}

function showHighlightStats(applied, total) {
  let badge = document.getElementById("ai-highlight-stats");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "ai-highlight-stats";
    badge.style.cssText = "position:fixed;bottom:20px;right:20px;background:#2c3e50;color:#ecf0f1;padding:12px 20px;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:999999;transition:opacity 0.5s;";
    document.body.appendChild(badge);
  }
  badge.innerHTML = `✨ <span style="color:#2ecc71;">${applied}</span> / ${total} Highlights Applied`;
  badge.style.opacity = "1";
  setTimeout(() => { badge.style.opacity = "0"; setTimeout(() => badge.remove(), 500); }, 6000);
}

function applyHighlights(highlights) {
  clearHighlights();
  if (!highlights?.length) { console.warn("[AI Highlight] Lista goală."); return; }

  const paragraphNodes = extractParagraphNodes();
  console.log(`[AI Highlight] Paragrafe: ${paragraphNodes.length} | Highlights: ${highlights.length}`);

  const paraCache = paragraphNodes.map((node) => ({ node, normalizedText: normalizeText(node.innerText || "") }));
  let applied = 0, missed = 0;

  for (const highlight of highlights) {
    if (!highlight || typeof highlight !== "string") continue;
    const norm = normalizeText(highlight);
    if (norm.length < 8) continue;
    let ok = false;
    for (const { node, normalizedText } of paraCache) {
      if (!quickContainsCheck(normalizedText, norm)) continue;
      if (tryHighlightWithFallbacks(node, norm)) { ok = true; applied++; break; }
    }
    if (!ok) { missed++; console.warn(`[AI Highlight] Nu găsit: "${norm.substring(0, 60)}..."`); }
  }
  if (taskMetrics) {
  taskMetrics.aiHighlightCount = applied;
  }
  console.log(`[AI Highlight] Aplicate: ${applied}/${highlights.length} | Negăsite: ${missed}`);
  showHighlightStats(applied, highlights.length);
}



function removeSidePanel() { document.getElementById("ai-side-panel")?.remove(); }

function safeInteractiveText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderLearningSection(icon, title, text) {
  if (!text) return "";

  return `
    <div style="
      margin-top:12px;
      padding:11px 12px;
      background:#f8fafc;
      border:1px solid #e5e7eb;
      border-radius:12px;
    ">
      <div style="
        display:flex;
        align-items:center;
        gap:7px;
        font-size:12px;
        font-weight:700;
        color:#475569;
        text-transform:uppercase;
        letter-spacing:0.03em;
        margin-bottom:5px;
      ">
        <span>${icon}</span>
        <span>${title}</span>
      </div>

      <div style="
        color:#111827;
        font-size:14px;
        line-height:1.5;
      ">
        ${safeInteractiveText(text)}
      </div>
    </div>
  `;
}

function renderInfoBlock(label, text) {
  if (!text) return "";

  return `
    <div style="
      padding:13px 14px;
      border-radius:14px;
      background:#f8fafc;
      border:1px solid #e5e7eb;
      margin-bottom:12px;
    ">
      <div style="
        font-size:12px;
        font-weight:700;
        color:#4f46e5;
        text-transform:uppercase;
        letter-spacing:0.04em;
        margin-bottom:6px;
      ">
        ${label}
      </div>

      <div style="
        font-size:14px;
        line-height:1.55;
        color:#111827;
      ">
        ${safeInteractiveText(text)}
      </div>
    </div>
  `;
}

function renderInteractivePanel(items) {
  removeSidePanel();

  const safeItems =
    Array.isArray(items)
      ? items
      : [];

  let panelData =
    safeItems[0] || {};

  if (!panelData.panel_type) {
    panelData = {
      panel_type: "main_ideas",
      article_overview: safeItems[0]?.article_overview || "",
      reading_focus: safeItems[0]?.reading_goal || "",
      main_ideas: safeItems.map((item) => ({
        title: item.key_sentence || item.key_idea || "Main idea",
        explanation: item.explanation || item.summary || ""
      })),
      key_terms: [],
      final_takeaway: safeItems
        .map((item) => item.summary)
        .filter(Boolean)
        .slice(0, 1)
        .join(" ")
    };
  }

  const mainIdeas =
    Array.isArray(panelData.main_ideas)
      ? panelData.main_ideas
      : [];

  const keyTerms =
    Array.isArray(panelData.key_terms)
      ? panelData.key_terms
      : [];

  if (taskMetrics) {
    taskMetrics.interactiveCardsShown = mainIdeas.length;
  }

  const panel = document.createElement("div");
  panel.id = "ai-side-panel";

  panel.style.cssText = `
    position:fixed;
    top:20px;
    right:20px;
    width:410px;
    max-width:calc(100vw - 40px);
    height:calc(100vh - 40px);
    background:white;
    border-radius:18px;
    box-shadow:0 12px 40px rgba(0,0,0,0.25);
    z-index:999999;
    font-family:Arial,sans-serif;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    border:1px solid #e5e7eb;
  `;

  panel.innerHTML = `
    <div style="
      padding:16px 18px;
      background:linear-gradient(135deg,#2563eb,#4f46e5);
      color:white;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    ">
      <div>
        <div style="
          font-size:17px;
          font-weight:bold;
          margin-bottom:2px;
        ">
          Main Ideas Support
        </div>

        <div style="
          font-size:12px;
          opacity:0.9;
        ">
          Short explanation of the most important ideas
        </div>
      </div>

      <button id="ai-close-panel" style="
        width:32px;
        height:32px;
        border:none;
        border-radius:50%;
        background:rgba(255,255,255,0.18);
        color:white;
        font-size:18px;
        cursor:pointer;
        line-height:1;
      ">
        ×
      </button>
    </div>

    <div style="
      flex:1;
      overflow-y:auto;
      padding:14px;
      background:#ffffff;
    ">
      ${renderInfoBlock(
        "Article focus",
        panelData.article_overview
      )}

      ${renderInfoBlock(
        "Reading focus",
        panelData.reading_focus
      )}

      ${
        mainIdeas.length
          ? `
            <div style="
              margin-top:4px;
              margin-bottom:12px;
            ">
              <div style="
                font-size:13px;
                font-weight:700;
                color:#334155;
                margin-bottom:10px;
                text-transform:uppercase;
                letter-spacing:0.04em;
              ">
                Main ideas
              </div>

              ${mainIdeas.map((idea, index) => `
                <div style="
                  display:flex;
                  gap:10px;
                  padding:12px;
                  border:1px solid #e5e7eb;
                  border-radius:14px;
                  margin-bottom:10px;
                  background:#ffffff;
                  box-shadow:0 1px 5px rgba(15,23,42,0.05);
                ">
                  <div style="
                    width:26px;
                    height:26px;
                    flex:0 0 26px;
                    border-radius:50%;
                    background:#eff6ff;
                    color:#2563eb;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-size:13px;
                    font-weight:bold;
                  ">
                    ${index + 1}
                  </div>

                  <div>
                    <div style="
                      font-size:14px;
                      font-weight:700;
                      color:#111827;
                      margin-bottom:4px;
                      line-height:1.35;
                    ">
                      ${safeInteractiveText(idea.title)}
                    </div>

                    <div style="
                      font-size:14px;
                      color:#475569;
                      line-height:1.5;
                    ">
                      ${safeInteractiveText(idea.explanation)}
                    </div>
                  </div>
                </div>
              `).join("")}
            </div>
          `
          : ""
      }

      ${
        keyTerms.length
          ? `
            <div style="
              padding:13px 14px;
              border-radius:14px;
              background:#f8fafc;
              border:1px solid #e5e7eb;
              margin-bottom:12px;
            ">
              <div style="
                font-size:12px;
                font-weight:700;
                color:#4f46e5;
                text-transform:uppercase;
                letter-spacing:0.04em;
                margin-bottom:10px;
              ">
                Key terms
              </div>

              ${keyTerms.map((item) => `
                <div style="
                  margin-bottom:10px;
                ">
                  <span style="
                    display:inline-block;
                    font-size:13px;
                    font-weight:700;
                    color:#1e40af;
                    background:#dbeafe;
                    border-radius:999px;
                    padding:4px 9px;
                    margin-bottom:4px;
                  ">
                    ${safeInteractiveText(item.term)}
                  </span>

                  <div style="
                    font-size:14px;
                    color:#475569;
                    line-height:1.45;
                  ">
                    ${safeInteractiveText(item.meaning)}
                  </div>
                </div>
              `).join("")}
            </div>
          `
          : ""
      }

      ${renderInfoBlock(
        "Final takeaway",
        panelData.final_takeaway
      )}
    </div>
  `;

  document.body.appendChild(panel);

  document
    .getElementById("ai-close-panel")
    .onclick = () => panel.remove();
}

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

function formatChatText(text) {
  return escapeHTML(text).replace(/\n/g, "<br>");
}

function appendChatMessage(role, text) {
  const messages = document.getElementById("chat-messages");
  if (!messages) return;

  const isUser = role === "user";

  const row = document.createElement("div");
  row.style.cssText = `
    display:flex;
    justify-content:${isUser ? "flex-end" : "flex-start"};
    margin:10px 0;
  `;

  const bubble = document.createElement("div");
  bubble.style.cssText = `
    max-width:82%;
    padding:10px 13px;
    border-radius:${isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px"};
    background:${isUser ? "#2563eb" : "#f1f5f9"};
    color:${isUser ? "white" : "#1e293b"};
    font-size:14px;
    line-height:1.45;
    box-shadow:0 1px 3px rgba(0,0,0,0.08);
    word-wrap:break-word;
  `;

  bubble.innerHTML = `
    <div style="
      font-size:11px;
      font-weight:bold;
      opacity:0.75;
      margin-bottom:4px;
    ">
      ${isUser ? "You" : "AI Assistant"}
    </div>
    <div>${formatChatText(text)}</div>
  `;

  row.appendChild(bubble);
  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;
}

function appendChatLoading() {
  const messages = document.getElementById("chat-messages");
  if (!messages) return null;

  const id = "chat-loading-" + Date.now();

  const row = document.createElement("div");
  row.id = id;
  row.style.cssText = `
    display:flex;
    justify-content:flex-start;
    margin:10px 0;
  `;

  row.innerHTML = `
    <div style="
      max-width:82%;
      padding:10px 13px;
      border-radius:16px 16px 16px 4px;
      background:#f1f5f9;
      color:#64748b;
      font-size:14px;
      line-height:1.45;
      box-shadow:0 1px 3px rgba(0,0,0,0.08);
    ">
      <div style="
        font-size:11px;
        font-weight:bold;
        opacity:0.75;
        margin-bottom:4px;
      ">
        AI Assistant
      </div>
      <div>Thinking...</div>
    </div>
  `;

  messages.appendChild(row);
  messages.scrollTop = messages.scrollHeight;

  return id;
}


function renderChatbotPanel() {

  removeSidePanel();

  const imageContexts =
    extractImageContexts();

  const imageIntro =
    imageContexts.length > 0
      ? `<br><br>I can also help you understand images and figures in this article.</strong>`
      : "";

  const panel = document.createElement("div");

  panel.id = "ai-side-panel";

  panel.style.cssText = `
    position:fixed;
    top:20px;
    right:20px;
    width:390px;
    max-width:calc(100vw - 40px);
    height:calc(100vh - 40px);
    background:white;
    border-radius:18px;
    box-shadow:0 12px 40px rgba(0,0,0,0.25);
    z-index:999999;
    font-family:Arial,sans-serif;
    display:flex;
    flex-direction:column;
    overflow:hidden;
    border:1px solid #e5e7eb;
  `;

  panel.innerHTML = `
    <div style="
      padding:16px 18px;
      background:linear-gradient(135deg,#2563eb,#1d4ed8);
      color:white;
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
    ">
      <div>
        <div style="
          font-size:17px;
          font-weight:bold;
          margin-bottom:2px;
        ">
          💬 AI Chatbot
        </div>
        <div style="
          font-size:12px;
          opacity:0.9;
        ">
          Ask questions about this article
        </div>
      </div>

      <button id="chat-close" style="
        width:32px;
        height:32px;
        border:none;
        border-radius:50%;
        background:rgba(255,255,255,0.18);
        color:white;
        font-size:18px;
        cursor:pointer;
        line-height:1;
      ">
        ×
      </button>
    </div>

    <div id="chat-messages" style="
      flex:1;
      overflow-y:auto;
      padding:14px 14px 8px;
      background:#ffffff;
    ">
      <div style="
        display:flex;
        justify-content:flex-start;
        margin:10px 0;
      ">
        <div style="
          max-width:82%;
          padding:10px 13px;
          border-radius:16px 16px 16px 4px;
          background:#f1f5f9;
          color:#1e293b;
          font-size:14px;
          line-height:1.45;
          box-shadow:0 1px 3px rgba(0,0,0,0.08);
        ">
          <div style="
            font-size:11px;
            font-weight:bold;
            opacity:0.75;
            margin-bottom:4px;
          ">
            AI Assistant
          </div>
          <div>
            Hi! Ask me anything about the article.${imageIntro}
          </div>
        </div>
      </div>
    </div>

    <div style="
      padding:12px;
      border-top:1px solid #e5e7eb;
      background:#f8fafc;
    ">
      <textarea
        id="chat-input"
        placeholder="Type your question here..."
        style="
          width:100%;
          height:76px;
          resize:none;
          border:1px solid #d1d5db;
          border-radius:12px;
          padding:10px 12px;
          font-family:Arial,sans-serif;
          font-size:14px;
          outline:none;
          box-sizing:border-box;
          background:white;
          color:#111827;
          margin-bottom:8px;
        ">
      </textarea>

      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:10px;
      ">
        <div style="
          font-size:11px;
          color:#64748b;
        ">
          Press Enter to send, Shift+Enter for new line
        </div>

        <button id="chat-send" style="
          padding:10px 18px;
          border:none;
          border-radius:10px;
          background:#2563eb;
          color:white;
          font-weight:bold;
          cursor:pointer;
          font-size:14px;
          white-space:nowrap;
        ">
          Send
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  document
    .getElementById("chat-close")
    .onclick = () => panel.remove();

  document
    .getElementById("chat-send")
    .onclick = sendChatMessage;

  document
    .getElementById("chat-input")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
}


function renderFinishButton() {
  if (document.getElementById("ai-finish-btn")) return;
  const btn = document.createElement("button");
  btn.id = "ai-finish-btn";
  btn.textContent = "Finish & Take Quiz";
  btn.style.cssText = "position:fixed;bottom:20px;left:20px;z-index:999999;padding:12px 18px;background:#2563eb;color:white;border:none;border-radius:10px;cursor:pointer;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(0,0,0,0.2);";
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Generating Quiz...";
    try { await generateQuiz(); } catch (err) { console.error(err); alert("Quiz generation failed."); }
    btn.disabled = false;
    btn.textContent = "Finish & Take Quiz";
  };
  document.body.appendChild(btn);
}

function removeFinishButton() {
  document.getElementById("ai-finish-btn")?.remove();
}


function renderManualHint() {
  if (document.getElementById("ai-manual-hint")) return;

  const hint = document.createElement("div");

  hint.id = "ai-manual-hint";

  hint.style.cssText = `
    position:fixed;
    bottom:125px;
    left:20px;
    z-index:999999;
    width:310px;
    background:white;
    border:1px solid #dbeafe;
    border-left:5px solid #2563eb;
    border-radius:12px;
    box-shadow:0 6px 22px rgba(0,0,0,0.18);
    font-family:Arial,sans-serif;
    padding:14px 16px;
    color:#1e293b;
  `;

  hint.innerHTML = `
    <button id="ai-manual-hint-close" style="
      position:absolute;
      top:8px;
      right:10px;
      border:none;
      background:transparent;
      color:#64748b;
      font-size:18px;
      cursor:pointer;
      line-height:1;
    ">×</button>

    <div style="
      font-size:14px;
      font-weight:bold;
      margin-bottom:8px;
      color:#1d4ed8;
    ">
      ✏️ Manual Highlighting Mode
    </div>

    <div style="
      font-size:13px;
      line-height:1.55;
      color:#334155;
    ">
      Select important text in the article.<br>
      A color palette will appear.<br>
      Choose a color to highlight your selection.<br>
      Click a highlight to remove it.
    </div>
  `;

  document.body.appendChild(hint);

  document.getElementById("ai-manual-hint-close").onclick = () => {
    hint.remove();
  };
}

function removeManualHint() {
  document.getElementById("ai-manual-hint")?.remove();
}


async function getCurrentArticleIdForQuiz() {
  const params = new URLSearchParams(window.location.search);

  const fromUrl =
    params.get("articleId") ||
    params.get("articleIndex") ||
    params.get("id");

  if (fromUrl) {
    return String(fromUrl);
  }

  const result = await chrome.storage.local.get("studyState");
  const studyState = result.studyState;

  if (
    studyState &&
    typeof studyState.currentStep === "number"
  ) {
    return String(studyState.currentStep + 1);
  }

  return "1";
}

function convertCorrectAnswerToLetterIfNeeded(quiz) {
  return quiz.map((q) => {
    const options = Array.isArray(q.options) ? q.options : [];
    const correct = String(q.correct_answer || "").trim();

    if (["A", "B", "C", "D"].includes(correct.toUpperCase())) {
      return {
        ...q,
        correct_answer: correct.toUpperCase()
      };
    }

    const correctIndex = options.findIndex((option) =>
      String(option).trim().toLowerCase() === correct.toLowerCase()
    );

    if (correctIndex === -1) {
      console.warn(
        "[QUIZ] Could not match correct answer to option:",
        q
      );

      return q;
    }

    return {
      ...q,
      correct_answer: ["A", "B", "C", "D"][correctIndex]
    };
  });
}


function isQuizCurrentlyOpen() {
  return quizIsOpen || !!document.getElementById("ai-quiz-popup");
}

function closeAllReadingSupportsBeforeQuiz() {
  deactivateManualMode();

  removeColorPalette();
  removeActiveTooltip();

  clearHighlights();
  clearAllManualHighlights();

  removeSidePanel();
  removeFinishButton();

  window.getSelection()?.removeAllRanges();
}


async function generateQuiz() {
  try {
    const articleId = await getCurrentArticleIdForQuiz();

    const response = await fetch("http://127.0.0.1:8000/api/quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        articleId
      })
    });

    const data = await response.json();

    console.log("QUIZ:", data);

    if (!response.ok || !Array.isArray(data.quiz)) {
      console.error("[QUIZ ERROR]", data);
      alert(data.error || "Quiz loading failed.");
      return;
    }
    markQuizOpened();

    quizIsOpen = true;
    closeAllReadingSupportsBeforeQuiz();

    quizUserAnswers = {};
    quizSubmitted = false;

    const normalizedQuiz =
      convertCorrectAnswerToLetterIfNeeded(data.quiz);

    renderQuizPopup(normalizedQuiz);
  } catch (err) {
    console.error(err);
    alert("Quiz loading failed.");
  }
}

function renderQuizPopup(quiz) {
  document.getElementById("ai-quiz-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "ai-quiz-popup";
  popup.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:520px;max-height:80vh;overflow-y:auto;background:white;z-index:9999999;padding:24px;border-radius:16px;box-shadow:0 0 40px rgba(0,0,0,0.35);font-family:Arial,sans-serif;";

  let html = `<h2 style="margin-top:0;">📝 Quiz</h2>`;
  quiz.forEach((q, index) => {
    html += `<div style="margin-bottom:20px;"><p><strong>${index + 1}. ${q.question}</strong></p>`;
    q.options.forEach((option, optIdx) => {
      html += `<button class="quiz-option question-${index}"
        data-correct="${q.correct_answer}"
        data-option="${["A","B","C","D"][optIdx]}"
        style="display:block;margin:6px 0;padding:10px 14px;width:100%;text-align:left;cursor:pointer;border:1px solid #ddd;border-radius:8px;background:#f9f9f9;font-size:14px;">
        ${option}
      </button>`;
    });
    html += `</div>`;
  });

    html += `
    <div style="
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin-top:20px;
    ">
      <button id="submit-quiz-btn" style="
        padding:10px 20px;
        background:#2563eb;
        color:white;
        border:none;
        border-radius:8px;
        cursor:pointer;
        font-weight:bold;
        font-size:14px;
      ">
        Submit Quiz
      </button>

      <button id="close-quiz-popup" style="
        display:none;
        margin-left:auto;
        padding:12px 22px;
        cursor:pointer;
        border:none;
        border-radius:10px;
        background:#16a34a;
        color:white;
        font-size:15px;
        font-weight:bold;
        box-shadow:0 3px 10px rgba(22,163,74,0.25);
      ">
        Close & Continue →
      </button>
    </div>

    <div id="quiz-result" style="margin-top:16px;"></div>
  `;

  popup.innerHTML = html;
  document.body.appendChild(popup);

  document.getElementById("close-quiz-popup").onclick = async () => {
  quizIsOpen = false;

  const params = new URLSearchParams(window.location.search);

  const fallbackParticipantId =
    params.get("participantId") || "";

  const fallbackArticleIndex =
    Number(
      params.get("articleIndex") ||
      params.get("articleId") ||
      1
    );

  const modeOrders = [
    ["static",      "interactive", "chatbot"],
    ["static",      "chatbot",     "interactive"],
    ["interactive", "static",      "chatbot"],
    ["interactive", "chatbot",     "static"],
    ["chatbot",     "static",      "interactive"],
    ["chatbot",     "interactive", "static"],
  ];

  function getFallbackModeOrder(participantId) {
    const digits = String(participantId).replace(/\D/g, "");
    const numericId = parseInt(digits || "1", 10);

    const safeNumericId =
      Number.isFinite(numericId) && numericId > 0
        ? numericId
        : 1;

    return modeOrders[(safeNumericId - 1) % modeOrders.length];
  }

  const result =
    await chrome.storage.local.get("studyState");

  const oldStudyState =
    result.studyState || {};

  const participantId =
    oldStudyState.participantId ||
    fallbackParticipantId;

  if (!participantId) {
    alert("Could not identify the participant ID. Please return to the experiment page and reopen the article.");
    return;
  }

  const taskIndex =
    Number.isFinite(fallbackArticleIndex) &&
    fallbackArticleIndex >= 1
      ? fallbackArticleIndex
      : Number(oldStudyState.currentStep || 0) + 1;

  const currentStep =
    Math.max(0, taskIndex - 1);

  const modeOrder =
    Array.isArray(oldStudyState.modeOrder) &&
    oldStudyState.modeOrder.length
      ? oldStudyState.modeOrder
      : getFallbackModeOrder(participantId);

  const studyState = {
    ...oldStudyState,
    participantId,
    currentStep,
    modeOrder
  };

  await chrome.storage.local.set({
    studyState,
    experimentProgress: {
      participantId,

      // Quiz-ul e făcut, dar articolul NU devine complet
      // până când participantul nu face feedback-ul.
      completedCount: currentStep,

      quizCompletedTaskIndex: taskIndex,
      susNasaPending: true,
      articleIndex: taskIndex,
      quizCompletedAt: Date.now()
    }
  });

  popup.remove();
  removeFinishButton();

  deactivateManualMode();
  clearHighlights();
  removeSidePanel();

  showTaskCompletedPopup();
}; 

  document.getElementById("submit-quiz-btn").onclick = submitQuiz;
  addQuizLogic();
}

function addQuizLogic() {
  document.querySelectorAll(".quiz-option").forEach(btn => {
    btn.onclick = () => {
      if (quizSubmitted) return;

      const selected = btn.dataset.option;
      const qClass = [...btn.classList].find(c => c.startsWith("question-"));

      if (!qClass) return;

      const qIndex = qClass.split("-")[1];
      const allBtns = document.querySelectorAll(`.${qClass}`);

      quizUserAnswers[qIndex] = selected;

      allBtns.forEach(b => {
        b.style.background = "#f9f9f9";
        b.style.color = "#111827";
        b.style.border = "1px solid #ddd";
      });

      btn.style.background = "#dbeafe";
      btn.style.color = "#111827";
      btn.style.border = "2px solid #2563eb";
    };
  });
}

function submitQuiz() {
  if (quizSubmitted) return;
      quizSubmitted = true;
  const allButtons = document.querySelectorAll(".quiz-option");
  const questions  = {};
  allButtons.forEach(btn => {
    const qClass = [...btn.classList].find(c => c.startsWith("question-"));
    if (!qClass) return;
    const qIndex = qClass.split("-")[1];
    if (!questions[qIndex]) questions[qIndex] = [];
    questions[qIndex].push(btn);
  });

  const total = Object.keys(questions).length;
  let correct = 0;
  for (const qIndex in questions) {
    const rightAnswer = questions[qIndex][0].dataset.correct;
    if (quizUserAnswers[qIndex] === rightAnswer) correct++;
  }

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  saveQuizResult(correct, total, pct);
    allButtons.forEach(btn => {
    btn.disabled = true;
    btn.style.pointerEvents = "none";
    btn.style.cursor = "not-allowed";
    btn.style.opacity = "0.75";
  });
  stopTaskTimer();
  

const resultDiv = document.getElementById("quiz-result");

if (resultDiv) {
  resultDiv.innerHTML = `
    <div style="
      background:#f1f5f9;
      border-radius:8px;
      padding:16px;
      text-align:center;
      font-size:16px;
      color:#111827;
    ">
      <strong>Your answers have been submitted.</strong><br>
      <span style="color:#555;">Please continue to the next step.</span>
    </div>
  `;

  resultDiv.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

  document.getElementById("submit-quiz-btn").disabled = true;

  const submitBtn = document.getElementById("submit-quiz-btn");
  if (submitBtn) {
    submitBtn.style.display = "none";
}

const closeBtn = document.getElementById("close-quiz-popup");
if (closeBtn) {
  closeBtn.style.display = "inline-block";
}
}


function showTaskCompletedPopup() {
  document.getElementById("ai-task-completed-popup")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ai-task-completed-popup";
  overlay.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,0.7);
    z-index:9999999;
    display:flex;
    align-items:center;
    justify-content:center;
    font-family:Arial,sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background:white;
      border-radius:16px;
      padding:40px;
      max-width:460px;
      text-align:center;
      box-shadow:0 8px 40px rgba(0,0,0,0.3);
    ">
      <div style="
        font-size:60px;
        margin-bottom:16px;
        color:#16a34a;
        line-height:1;
      ">✓</div>

      <h2 style="
        margin:0 0 12px;
        color:#1e293b;
      ">Task Completed</h2>

      <p style="
        color:#475569;
        margin-bottom:24px;
        line-height:1.6;
        font-size:15px;
      ">
        You have completed this article and its quiz.<br>
        Please return to the main experiment page and complete the short feedback questionnaire for this reading mode.
      </p>

      <button id="close-task-completed-popup" style="
        padding:12px 28px;
        background:#2563eb;
        color:white;
        border:none;
        border-radius:8px;
        cursor:pointer;
        font-size:15px;
        font-weight:bold;
      ">
        OK
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

    document.getElementById("close-task-completed-popup").onclick = () => {
    chrome.runtime.sendMessage({
      action: "goToExperimentPage"
    }, (resp) => {
      console.log("[Content] goToExperimentPage response:", resp);
    });
  };
}


function showExperimentFinished() {
  document.getElementById("ai-experiment-finished")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "ai-experiment-finished";
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;";

  overlay.innerHTML = `
    <div style="background:white;border-radius:16px;padding:40px;max-width:460px;text-align:center;box-shadow:0 8px 40px rgba(0,0,0,0.3);">
      <div style="font-size:48px;margin-bottom:16px;">🎓</div>
      <h2 style="margin:0 0 12px;color:#1e293b;">Experiment Complete!</h2>
      <p style="color:#475569;margin-bottom:24px;">You have completed all three reading modes. Thank you for participating!</p>
      <button id="go-to-main-after-finish"
        style="padding:12px 28px;background:#16a34a;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:bold;">
        Back to Main Page →
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById("go-to-main-after-finish").onclick = () => {
  chrome.runtime.sendMessage({
      action: "goToExperimentPage"
    }, (resp) => {
      console.log("[Content] goToExperimentPage after finish:", resp);
    });
  };
}


function analyzePage(mode, sendResponse) {
  const paragraphs = extractParagraphTexts();
  if (!paragraphs.length) { sendResponse({ status: "No suitable paragraphs found." }); return; }

  console.log(`[AI] Paragrafe trimise: ${paragraphs.length}`);

  chrome.runtime.sendMessage(
    { action: "callBackend", text: paragraphs.join("\n\n"), mode },
    (response) => {
      if (chrome.runtime.lastError) { sendResponse({ status: "Could not reach background." }); return; }
      if (!response?.ok) { sendResponse({ status: response?.error || "Backend error." }); return; }

      const data = response.data;

      startTaskMetrics(mode);

      if (mode !== "chatbot" && data.highlights?.length) {
        applyHighlights(data.highlights);
      } else if (mode !== "chatbot") {
        console.warn("[AI] Niciun highlight în răspuns.");
      }

      if (mode === "interactive" && data.interactive_support) {
        renderInteractivePanel(data.interactive_support);
      }
      else if (mode === "chatbot") {
        clearHighlights();
        renderChatbotPanel();
      }
      else {
        removeSidePanel();
      }

      renderFinishButton();
      sendResponse({ status: `Done. Language: ${data.language || "unknown"}.` });
    }
  );
}



chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (
    isExperimentMainPage() &&
    (
      message.action === "analyzePage" ||
      message.action === "activateManualMode"
    )
  ) {
    cleanupExtensionUI();

    sendResponse({
      status: "Open an experiment article first."
    });

    return true;
  }
    if (
    isQuizCurrentlyOpen() &&
    (
      message.action === "analyzePage" ||
      message.action === "activateManualMode"
    )
  ) {
    sendResponse({
      status: "Quiz is open. Reading support is disabled during the quiz."
    });
    return true;
  }
  if (message.action === "analyzePage") {
    // Dezactivăm manual mode dacă era activ
    deactivateManualMode();
    analyzePage(message.mode, sendResponse);
    return true;
  }

  if (message.action === "activateManualMode") {
    activateManualMode();
    sendResponse({ status: "Manual mode activated." });
    return true;
  }

  if (message.action === "deactivateManualMode") {
    deactivateManualMode();
    sendResponse({ status: "Manual mode deactivated." });
    return true;
  }

  if (message.action === "clearManualHighlights") {
    clearAllManualHighlights();
    sendResponse({ status: "Cleared." });
    return true;
  }

  if (message.action === "experimentFinished") {
    removeFinishButton();
    deactivateManualMode();
    clearHighlights();
    removeSidePanel();
    showExperimentFinished();
    return true;
  }
});

async function sendChatMessage() {

  const input =
    document.getElementById("chat-input");

  const sendButton =
    document.getElementById("chat-send");

  const question =
    input?.value?.trim();

  if (!question) return;

  if (taskMetrics) {
    taskMetrics.chatbotQuestionCount++;
  }

  appendChatMessage("user", question);

  input.value = "";

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.textContent = "Sending...";
    sendButton.style.opacity = "0.7";
    sendButton.style.cursor = "not-allowed";
  }

  const loadingId =
    appendChatLoading();

  const article =
    extractParagraphTexts().join("\n\n");

  const images =
    extractImageContexts();

  try {

    const response =
      await fetch(
        "http://127.0.0.1:8000/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
         body: JSON.stringify({
            article,
            question,
            images
          })
        }
      );

    const data =
      await response.json();

    if (loadingId) {
      document.getElementById(loadingId)?.remove();
    }

    if (!response.ok || data.error) {
      appendChatMessage(
        "ai",
        data.error || "Sorry, I could not generate an answer."
      );
      return;
    }

    appendChatMessage(
      "ai",
      data.answer || "I could not generate an answer for this question."
    );

  } catch(err) {

    console.error(err);

    if (loadingId) {
      document.getElementById(loadingId)?.remove();
    }

    appendChatMessage(
      "ai",
      "Error contacting the server. Please try again."
    );

  } finally {

    if (sendButton) {
      sendButton.disabled = false;
      sendButton.textContent = "Send";
      sendButton.style.opacity = "1";
      sendButton.style.cursor = "pointer";
    }

    input?.focus();
  }
}