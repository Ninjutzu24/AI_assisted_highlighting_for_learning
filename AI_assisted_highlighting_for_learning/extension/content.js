// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — CONSTANTE
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — sessionStorage
// ═══════════════════════════════════════════════════════════════


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
      score
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

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — APLICĂ HIGHLIGHT
// ═══════════════════════════════════════════════════════════════

let manualHighlightCounter = 0;

function applyManualHighlight(range, colorId) {
  if (!range || range.collapsed) return null;
  const color = MANUAL_COLORS.find((c) => c.id === colorId);
  if (!color) return null;
  const selectedText = range.toString().trim();
  if (!selectedText || selectedText.length < 1) return null;

  try {
    const hlId = "mhl-" + (++manualHighlightCounter);
    const span = document.createElement("span");
    span.className = "ai-manual-highlight";
    span.dataset.colorId = colorId;
    span.dataset.hlId = hlId;
    span.style.cssText = `background-color:${color.hex} !important;border-radius:2px;padding:0 1px;cursor:pointer;`;

    if (range.startContainer === range.endContainer &&
        range.startContainer.nodeType === Node.TEXT_NODE) {
      range.surroundContents(span);
    } else {
      const fragment = range.extractContents();
      span.appendChild(fragment);
      range.insertNode(span);
    }

    span.addEventListener("click", (e) => {
      e.stopPropagation();
      showRemoveTooltip(span, hlId, e.clientX, e.clientY);
    });

    return { colorId, text: selectedText, hlId };
  } catch (err) {
    console.warn("[Manual HL] Apply failed:", err);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — TOOLTIP REMOVE
// ═══════════════════════════════════════════════════════════════

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
  const parent = spanEl.parentNode;
  if (!parent) return;
  while (spanEl.firstChild) parent.insertBefore(spanEl.firstChild, spanEl);
  parent.removeChild(spanEl);
  parent.normalize();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY()) || "[]";
    const list = JSON.parse(raw);
    const idx = list.findIndex((e) => e.hlId === hlId);
    if (idx !== -1) { list.splice(idx, 1); sessionStorage.setItem(STORAGE_KEY(), JSON.stringify(list)); }
  } catch (e) {}
}

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — PALETĂ CULORI
// ═══════════════════════════════════════════════════════════════

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
            console.log(`[Manual HL] Aplicat: ${color.label} — "${entry.text.substring(0, 40)}"`);
          }
          sel.removeAllRanges();
          savedRange = null;
        } catch (err) { console.warn("[Manual HL] Swatch click error:", err); }
      }
    });
    palette.appendChild(swatch);
  });

  // Separator + clear all
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

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════

let selectionTimer = null;

function onMouseUp(e) {
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

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — RESTAURARE
// ═══════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════
// MANUAL MODE — ACTIVARE / DEZACTIVARE
// ═══════════════════════════════════════════════════════════════

let manualModeActive = false;

function activateManualMode() {
  if (manualModeActive) return;
  manualModeActive = true;
  document.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keyup", onKeyUp);
  restoreManualHighlights();
  renderFinishButton();
  console.log("[Manual HL] ✅ Activat — selectează text pentru paletă.");
}

function deactivateManualMode() {
  if (!manualModeActive) return;
  manualModeActive = false;
  document.removeEventListener("mouseup", onMouseUp);
  document.removeEventListener("keyup", onKeyUp);
  removeColorPalette();
  removeActiveTooltip();
  console.log("[Manual HL] Dezactivat.");
}

// ═══════════════════════════════════════════════════════════════
// STATIC MODE — SELECTORS & TEXT EXTRACTION
// ═══════════════════════════════════════════════════════════════

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

function normalizeText(text) {
  return text.replace(/\[\d+\]/g, "").replace(/\[note \d+\]/gi, "").replace(/\s+/g, " ").trim();
}

// ═══════════════════════════════════════════════════════════════
// STATIC MODE — HIGHLIGHT IN TEXT NODES
// ═══════════════════════════════════════════════════════════════

function mapNormalizedToOriginal(originalText, normalizedIndex) {
  let normCount = 0, i = 0;
  // Sari whitespace/refs de la început
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
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const cls = node.parentNode?.classList;
      if (cls?.contains("ai-highlight") || cls?.contains("ai-highlight-key") || cls?.contains("ai-manual-highlight")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  }, false);

  let tn;
  while ((tn = walker.nextNode())) {
    if (normalizeText(tn.textContent).length > 0) textNodes.push(tn);
  }
  if (textNodes.length === 0) return false;

  let concatenated = "";
  const positions = [];
  for (const node of textNodes) {
    const norm = normalizeText(node.textContent);
    positions.push({ node, normStart: concatenated.length, normEnd: concatenated.length + norm.length, origText: node.textContent });
    concatenated += norm + " ";
  }

  const matchStart = concatenated.indexOf(normalizedSearch);
  if (matchStart === -1) return false;
  const matchEnd = matchStart + normalizedSearch.length;
  const overlapping = positions.filter((p) => p.normStart < matchEnd && p.normEnd > matchStart);
  if (overlapping.length === 0) return false;

  if (overlapping.length === 1) {
    const pos = overlapping[0];
    const origStart = mapNormalizedToOriginal(pos.origText, matchStart - pos.normStart);
    const origEnd   = mapNormalizedToOriginal(pos.origText, matchEnd   - pos.normStart);
    if (origStart < 0 || origEnd <= origStart) return false;
    const before = pos.origText.substring(0, origStart);
    const matched = pos.origText.substring(origStart, origEnd);
    const after  = pos.origText.substring(origEnd);
    if (!matched.trim()) return false;
    const span = document.createElement("span");
    span.className = "ai-highlight";
    span.textContent = matched;
    const parent = pos.node.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), pos.node);
    parent.insertBefore(span, pos.node);
    if (after)  parent.insertBefore(document.createTextNode(after),  pos.node);
    parent.removeChild(pos.node);
    return true;
  }

  let success = false;
  for (const pos of overlapping) {
    const localStart = Math.max(0, matchStart - pos.normStart);
    const localEnd   = Math.min(pos.normEnd - pos.normStart, matchEnd - pos.normStart);
    if (localEnd <= localStart) continue;
    const origStart = mapNormalizedToOriginal(pos.origText, localStart);
    const origEnd   = mapNormalizedToOriginal(pos.origText, localEnd);
    if (origStart < 0 || origEnd <= origStart) continue;
    const before = pos.origText.substring(0, origStart);
    const matched = pos.origText.substring(origStart, origEnd);
    const after  = pos.origText.substring(origEnd);
    if (!matched.trim()) continue;
    const span = document.createElement("span");
    span.className = "ai-highlight";
    span.textContent = matched;
    const parent = pos.node.parentNode;
    if (before) parent.insertBefore(document.createTextNode(before), pos.node);
    parent.insertBefore(span, pos.node);
    if (after)  parent.insertBefore(document.createTextNode(after),  pos.node);
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

// ═══════════════════════════════════════════════════════════════
// STATIC MODE — APPLY HIGHLIGHTS
// ═══════════════════════════════════════════════════════════════

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

  console.log(`[AI Highlight] Aplicate: ${applied}/${highlights.length} | Negăsite: ${missed}`);
  showHighlightStats(applied, highlights.length);
}

// ═══════════════════════════════════════════════════════════════
// INTERACTIVE PANEL
// ═══════════════════════════════════════════════════════════════

function removeSidePanel() { document.getElementById("ai-side-panel")?.remove(); }

function renderInteractivePanel(items) {
  removeSidePanel();
  const panel = document.createElement("div");
  panel.id = "ai-side-panel";
  const close = document.createElement("div");
  close.id = "ai-close-panel";
  close.textContent = "✕";
  close.onclick = () => panel.remove();
  panel.appendChild(close);
  const title = document.createElement("h3");
  title.textContent = "Interactive Support";
  panel.appendChild(title);
  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "ai-support-card";
    card.innerHTML = `
      <p><strong>Key idea:</strong> ${item.key_sentence || item.key_idea || ""}</p>
      <p><strong>Explanation:</strong> ${item.explanation || ""}</p>
      <p><strong>Summary:</strong> ${item.summary || ""}</p>
      <p><strong>Guiding question:</strong> ${item.guiding_question || ""}</p>
    `;
    panel.appendChild(card);
  });
  document.body.appendChild(panel);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderChatbotPanel() {
  removeSidePanel();

  const panel = document.createElement("div");
  panel.id = "ai-side-panel";

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px;">
      <div>
        <h3 style="margin:0;color:#111827;font-size:18px;">
          AI Chatbot
        </h3>
        <p style="margin:6px 0 0;color:#6b7280;font-size:13px;line-height:1.45;">
          Ask a question about this article. The assistant will answer using the text on the page.
        </p>
      </div>

      <button id="chat-close"
        style="
          border:1px solid #d1d5db;
          background:#f9fafb;
          color:#111827;
          border-radius:8px;
          padding:6px 10px;
          cursor:pointer;
          font-size:13px;
        ">
        ✕
      </button>
    </div>

    <div id="chat-messages"
      style="
        height:260px;
        overflow-y:auto;
        border:1px solid #e5e7eb;
        border-radius:10px;
        padding:12px;
        margin-bottom:12px;
        background:#f8fafc;
        color:#111827;
        font-size:13px;
        line-height:1.5;
      ">
      <div style="color:#6b7280;">
        Try asking:
        <em>What is the main idea of this article?</em>
      </div>
    </div>

    <label for="chat-input"
      style="
        display:block;
        margin-bottom:6px;
        font-size:13px;
        font-weight:600;
        color:#374151;
      ">
      Your question
    </label>

    <textarea
      id="chat-input"
      placeholder="Type your question here..."
      style="
        width:100%;
        height:76px;
        border:1px solid #d1d5db;
        border-radius:10px;
        padding:10px;
        resize:vertical;
        color:#111827;
        background:#ffffff;
        font-size:13px;
        box-sizing:border-box;
        font-family:Arial,sans-serif;
      ">
    </textarea>

    <button id="chat-send"
      style="
        width:100%;
        margin-top:10px;
        padding:10px 14px;
        background:#2563eb;
        color:white;
        border:none;
        border-radius:10px;
        cursor:pointer;
        font-weight:700;
        font-size:14px;
      ">
      Send question
    </button>
  `;

  document.body.appendChild(panel);

  document.getElementById("chat-close").onclick = () => panel.remove();
  document.getElementById("chat-send").onclick = sendChatMessage;
}

// ═══════════════════════════════════════════════════════════════
// FINISH BUTTON + QUIZ
// ═══════════════════════════════════════════════════════════════

function renderFinishButton() {
  if (document.getElementById("ai-finish-btn")) return;

  const btn = document.createElement("button");
  btn.id = "ai-finish-btn";
  btn.textContent = "Finish & Take Quiz";
  btn.style.cssText = `
    position:fixed;
    bottom:20px;
    left:20px;
    z-index:999999;
    padding:12px 18px;
    background:#2563eb;
    color:white;
    border:none;
    border-radius:10px;
    cursor:pointer;
    font-size:14px;
    font-weight:bold;
    box-shadow:0 4px 12px rgba(0,0,0,0.2);
  `;

  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "Generating Quiz...";

    try {
      await generateQuiz();
    } catch (err) {
      console.error(err);
      alert("Quiz generation failed.");
    }

    btn.disabled = false;
    btn.textContent = "Finish & Take Quiz";
  };

  document.body.appendChild(btn);
}

function removeFinishButton() {
  document.getElementById("ai-finish-btn")?.remove();
}

function generateQuiz() {
  const paragraphs = extractParagraphTexts();
  const text = paragraphs.join("\n\n");

  return fetch("http://127.0.0.1:8000/api/quiz", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  })
  .then(res => res.json())
  .then(data => {
    console.log("QUIZ:", data);
    quizUserAnswers = {};
    renderQuizPopup(data.quiz);
  })
  .catch(err => {
    console.error(err);
    alert("Quiz generation failed.");
  });
}

function renderQuizPopup(quiz) {
  document.getElementById("ai-quiz-popup")?.remove();
  window.quizWasSubmitted = false;

  const popup = document.createElement("div");
  popup.id = "ai-quiz-popup";
  popup.style.cssText = `
    position:fixed;
    top:50%;
    left:50%;
    transform:translate(-50%,-50%);
    width:560px;
    max-height:82vh;
    overflow-y:auto;
    background:white;
    color:#111827;
    z-index:9999999;
    padding:24px;
    border-radius:16px;
    box-shadow:0 0 40px rgba(0,0,0,0.35);
    font-family:Arial,sans-serif;
  `;

  if (!Array.isArray(quiz) || quiz.length === 0) {
    popup.innerHTML = `
      <h2 style="margin-top:0;color:#111827;">Quiz generation failed</h2>
      <p style="color:#374151;">No quiz questions were returned.</p>
      <button id="close-quiz-popup"
        style="
          padding:10px 20px;
          cursor:pointer;
          border:1px solid #d1d5db;
          border-radius:8px;
          background:#f1f5f9;
          color:#111827;
          font-size:14px;
        ">
        Close
      </button>
    `;

    document.body.appendChild(popup);

    document.getElementById("close-quiz-popup").onclick = () => {
      popup.remove();
    };

    return;
  }

  let html = `
    <h2 style="margin-top:0;color:#111827;">📝 Quiz</h2>
    <p style="margin-top:-8px;margin-bottom:18px;color:#6b7280;font-size:13px;line-height:1.45;">
      Select one answer for each question. If your answer is wrong, the correct answer will be shown in green.
    </p>
  `;

  quiz.forEach((q, index) => {
    const questionText = escapeHtml(q.question);
    const options = Array.isArray(q.options) ? q.options : [];

    html += `
      <div style="margin-bottom:22px;">
        <p style="color:#111827;line-height:1.45;">
          <strong>${index + 1}. ${questionText}</strong>
        </p>
    `;

    options.forEach((option, optIdx) => {
      const optionLetter = ["A", "B", "C", "D"][optIdx] || String(optIdx + 1);
      const optionText = escapeHtml(option);
      const optionAttr = escapeAttribute(option);
      const correctAttr = escapeAttribute(q.correct_answer);

      html += `
        <button class="quiz-option question-${index}"
          data-correct="${correctAttr}"
          data-option="${optionLetter}"
          data-option-text="${optionAttr}"
          style="
            display:block;
            margin:7px 0;
            padding:11px 14px;
            width:100%;
            text-align:left;
            cursor:pointer;
            border:1px solid #d1d5db;
            border-radius:8px;
            background:#f8fafc;
            color:#111827 !important;
            font-size:14px;
            line-height:1.45;
          ">
          <strong>${optionLetter}.</strong> ${optionText}
        </button>
      `;
    });

    html += `</div>`;
  });

  html += `
    <div style="display:flex;gap:10px;justify-content:space-between;margin-top:20px;">
      <button id="submit-quiz-btn"
        style="
          flex:1;
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

      <button id="close-quiz-popup"
        style="
          flex:1;
          padding:10px 20px;
          cursor:pointer;
          border:1px solid #d1d5db;
          border-radius:8px;
          background:#f1f5f9;
          color:#111827;
          font-size:14px;
        ">
        Close & Continue
      </button>
    </div>

    <div id="quiz-result" style="margin-top:16px;color:#111827;"></div>
  `;

  popup.innerHTML = html;
  document.body.appendChild(popup);

  document.getElementById("close-quiz-popup").onclick = async () => {
    if (!window.quizWasSubmitted) {
      alert("Please submit the quiz before continuing.");
      return;
    }

    const result = await chrome.storage.local.get("studyState");
    const studyState = result.studyState;

    const params = new URLSearchParams(window.location.search);

    const participantId =
      params.get("participantId") ||
      studyState?.participantId ||
      "";

    const articleIndex =
      Number(params.get("articleIndex")) || 1;

    chrome.runtime.sendMessage(
      {
        action: "markArticleCompleted",
        participantId,
        articleIndex
      },
      (resp) => {
        console.log("[Content] markArticleCompleted response:", resp);
      }
    );

    chrome.runtime.sendMessage(
      {
        action: "quizFinished"
      },
      (resp) => {
        console.log("[Content] quizFinished response:", resp);
      }
    );

    popup.remove();
    removeFinishButton();

    deactivateManualMode();
    clearHighlights();
    removeSidePanel();

    alert("Quiz completed. Go back to the experiment page to open the next article.");
  };

  

  document.getElementById("submit-quiz-btn").onclick = submitQuiz;
  addQuizLogic();
}


function normalizeAnswer(value) {
  if (!value) return "";

  const cleaned = String(value)
    .trim()
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "");

  const firstChar = cleaned.charAt(0).toUpperCase();

  if (["A", "B", "C", "D"].includes(firstChar)) {
    return firstChar;
  }

  return cleaned
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeOptionText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isCorrectOption(button, correctValue) {
  const normalizedCorrect = normalizeAnswer(correctValue);
  const optionLetter = normalizeAnswer(button.dataset.option);
  const optionText = normalizeOptionText(button.dataset.optionText);

  if (!normalizedCorrect) return false;

  if (["A", "B", "C", "D"].includes(normalizedCorrect)) {
    return optionLetter === normalizedCorrect;
  }

  return (
    optionText === normalizedCorrect ||
    optionText.includes(normalizedCorrect) ||
    normalizedCorrect.includes(optionText)
  );
}

function markButton(button, type) {
  if (!button) return;

  if (type === "correct") {
    button.style.background = "#16a34a";
    button.style.color = "white";
    button.style.borderColor = "#16a34a";
  }

  if (type === "wrong") {
    button.style.background = "#dc2626";
    button.style.color = "white";
    button.style.borderColor = "#dc2626";
  }
}

function addQuizLogic() {
  document.querySelectorAll(".quiz-option").forEach(btn => {
    btn.onclick = () => {
      const selected = btn.dataset.option;
      const correct = btn.dataset.correct;
      const qClass = [...btn.classList].find(c => c.startsWith("question-"));

      if (!qClass) return;

      const qIndex = qClass.split("-")[1];
      const allBtns = Array.from(document.querySelectorAll(`.${qClass}`));

      allBtns.forEach(b => {
        b.disabled = true;
      });

      quizUserAnswers[qIndex] = selected;

      const selectedIsCorrect = isCorrectOption(btn, correct);

      if (selectedIsCorrect) {
        markButton(btn, "correct");
      } else {
        markButton(btn, "wrong");

        const correctButton = allBtns.find(b => isCorrectOption(b, correct));
        markButton(correctButton, "correct");
      }
    };
  });
}

function submitQuiz() {
  const allButtons = document.querySelectorAll(".quiz-option");
  const questions = {};

  allButtons.forEach(btn => {
    const qClass = [...btn.classList].find(c => c.startsWith("question-"));
    if (!qClass) return;

    const qIndex = qClass.split("-")[1];

    if (!questions[qIndex]) {
      questions[qIndex] = [];
    }

    questions[qIndex].push(btn);
  });

  const total = Object.keys(questions).length;
  let correct = 0;

  for (const qIndex in questions) {
    const rightAnswer = questions[qIndex][0].dataset.correct;
    const selectedLetter = quizUserAnswers[qIndex];

    const selectedButton = questions[qIndex].find(
      btn => btn.dataset.option === selectedLetter
    );

    if (selectedButton && isCorrectOption(selectedButton, rightAnswer)) {
      correct++;
    }
  }

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  saveQuizResult(correct, total, pct);
  window.quizWasSubmitted = true;

  const closeBtn = document.getElementById("close-quiz-popup");
  if (closeBtn) {
    closeBtn.textContent = "Finish Article ";
    closeBtn.style.background = "#16a34a";
    closeBtn.style.color = "white";
    closeBtn.style.borderColor = "#16a34a";

  }

  const feedback =
    pct >= 80
      ? "Excellent comprehension! 🎉"
      : pct >= 50
      ? "Good understanding. 👍"
      : "Needs more review. 📚";

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
        <strong>Score: ${correct}/${total} — ${pct}%</strong><br>
        <span style="color:#555;">${feedback}</span>
      </div>
    `;

    resultDiv.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }

  const submitBtn = document.getElementById("submit-quiz-btn");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.style.opacity = "0.65";
    submitBtn.style.cursor = "not-allowed";
  }
}

// ═══════════════════════════════════════════════════════════════
// EXPERIMENT FINISHED SCREEN
// ═══════════════════════════════════════════════════════════════

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
      <button onclick="document.getElementById('ai-experiment-finished').remove()"
        style="padding:12px 28px;background:#2563eb;color:white;border:none;border-radius:8px;cursor:pointer;font-size:15px;font-weight:bold;">
        Close
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
}

// ═══════════════════════════════════════════════════════════════
// ANALYZE PAGE (STATIC / INTERACTIVE / CHATBOT)
// ═══════════════════════════════════════════════════════════════

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
      if (data.highlights?.length) applyHighlights(data.highlights);
      else console.warn("[AI] Niciun highlight în răspuns.");

      if (mode === "interactive" && data.interactive_support) {
                renderInteractivePanel(data.interactive_support);
      }
      else if (mode === "chatbot") {
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

// ═══════════════════════════════════════════════════════════════
// MESSAGE LISTENER — UN SINGUR LISTENER
// ═══════════════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "analyzePage") {
    // Dezactivăm manual mode dacă era activ
    deactivateManualMode();
    analyzePage(message.mode, sendResponse);
    return true;
  }

  if (message.action === "markArticleCompletedOnExperimentPage") {
  try {
    const raw = localStorage.getItem("experiment_session");

    if (!raw) {
      sendResponse({ status: "No experiment_session found." });
      return true;
    }

    const session = JSON.parse(raw);

    const participantId = String(message.participantId || "");
    const articleIndex = Number(message.articleIndex || 1);

    if (participantId && String(session.participantId) !== participantId) {
      sendResponse({ status: "Participant mismatch." });
      return true;
    }

    if (!Array.isArray(session.opened)) {
      session.opened = [false, false, false];
    }

    if (articleIndex >= 1 && articleIndex <= 3) {
      session.opened[articleIndex - 1] = true;
    }

    localStorage.setItem("experiment_session", JSON.stringify(session));

    sendResponse({
      status: `Article ${articleIndex} marked completed.`
    });

    setTimeout(() => {
      window.location.reload();
    }, 300);

  } catch (err) {
    console.error("[Experiment unlock error]", err);
    sendResponse({ status: "Could not update experiment page." });
  }

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

  const messages =
    document.getElementById("chat-messages");

  const question =
    input.value.trim();

  if (!question) return;

  messages.innerHTML += `
    <div>
      <b>You:</b> ${question}
    </div>
  `;

  input.value = "";

  const article =
    extractParagraphTexts().join("\n\n");

  try {

    const response =
      await fetch(
        "http://127.0.0.1:8000/api/chat",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            article,
            question
          })
        }
      );

    const data =
      await response.json();

    messages.innerHTML += `
      <div style="margin-top:8px;">
        <b>AI:</b>
        ${data.answer}
      </div>
    `;

    messages.scrollTop =
      messages.scrollHeight;

  } catch(err) {

    console.error(err);

    messages.innerHTML += `
      <div>
        <b>AI:</b>
        Error contacting server.
      </div>
    `;
  }
}