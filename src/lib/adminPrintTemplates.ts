const TAG_RULES = [
  { open: "[CENTRO]", close: "[/CENTRO]", className: "center" },
  { open: "[GRANDE]", close: "[/GRANDE]", className: "txt-grande" },
  { open: "[DESTAQUE]", close: "[/DESTAQUE]", className: "pedido-destaque" },
  { open: "[CAIXA]", close: "[/CAIXA]", className: "box-highlight" },
  { open: "[NEGRITO]", close: "[/NEGRITO]", className: "grand-total" },
  { open: "[TXTMEDIO]", close: "[/TXTMEDIO]", className: "txt-medio" },
  { open: "[TXTPEQUENO]", close: "[/TXTPEQUENO]", className: "txt-pequeno" },
  { open: "[TXTGIGANTE]", close: "[/TXTGIGANTE]", className: "txt-gigante" },
  { open: "[TXTBORDA]", close: "[/TXTBORDA]", className: "txt-borda-preta" },
  { open: "[TZTBORDA]", close: "[/TZTBORDA]", className: "txt-borda-preta" },
  { open: "[TXTBORDATXT]", close: "[/TXTBORDATXT]", className: "txt-borda-inline" },
  { open: "[BORDA]", close: "[/BORDA]", className: "inline-border" },
  { open: "[FUNDPRETO]", close: "[/FUNDPRETO]", className: "black-highlight" },
] as const;

const WRAPPER_RULES = [
  {
    tokens: ["[QUADRADONEGRITO]", "[quadradonegrito]"],
    closeTokens: ["[/QUADRADONEGRITO]", "[/quadradonegrito]"],
    className: "print-frame-strong",
  },
  {
    tokens: ["[QUADRADO]", "[quadrado]"],
    closeTokens: ["[/QUADRADO]", "[/quadrado]"],
    className: "print-frame",
  },
  {
    tokens: ["[RETANGULO]", "[retangulo]"],
    closeTokens: ["[/RETANGULO]", "[/retangulo]"],
    className: "print-frame-rect",
  },
] as const;

export interface BuildAdminPrintDocumentOptions {
  title: string;
  template: string;
  variables?: Record<string, string | number | null | undefined>;
  blocks?: Record<string, string | undefined>;
  pageWidthMm?: number;
  pageHeightMm?: number | "auto";
  pageMarginMm?: number;
  repeatCount?: number;
  bodyFontFamily?: string;
  bodyFontSizePx?: number;
  labelFontSizePx?: number;
  bodyPaddingMm?: number;
  sectionPaddingMm?: number;
  sectionMinHeightMm?: number;
  sectionBorder?: string;
  extraCss?: string;
  labelGapMm?: number;
}

export interface BatchSection {
  variables?: Record<string, string | number | null | undefined>;
  blocks?: Record<string, string | undefined>;
}

export interface TemplateSection {
  content: string;
  wrapperClass: string;
}

const unique = (values: string[]) => Array.from(new Set(values));

export const escapeHtml = (value: string) =>
  value
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&#39;");

const replaceAllToken = (value: string, search: string, replacement: string) => value.split(search).join(replacement);

const trimEmptyEdges = (value: string) => value.replace(/^\n+|\n+$/g, "");

const ensureFinalThermalCutMarker = (template: string) => {
  const compact = template.trimEnd();
  return compact.endsWith("---") ? compact : `${compact}\n---`;
};

export const makeTightThermalPrintHtml = (html: string, pageWidthMm = 72) => {
  const markerScript = `<script>(function(){
    if (window.__TURBO_TIGHT_THERMAL_INSTALLED__) return;
    window.__TURBO_TIGHT_THERMAL_INSTALLED__ = true;
    var pageWidthMm = ${pageWidthMm};
    var nativePrint = window.print ? window.print.bind(window) : null;
    function markFinalCut(){
      var candidates = Array.prototype.slice.call(document.querySelectorAll("[data-thermal-cut='true'],hr,.separator,.sep"));
      if (!candidates.length && document.body) {
        var forced = document.createElement("div");
        forced.className = "separator thermal-cut-marker";
        forced.setAttribute("data-thermal-cut", "true");
        forced.style.cssText = "border-top:1px dashed #000!important;height:0!important;line-height:0!important;margin:0!important;padding:0!important;";
        document.body.appendChild(forced);
        candidates = [forced];
      }
      if (!candidates.length) return;
      var last = candidates[candidates.length - 1];
      last.setAttribute("data-thermal-cut", "true");
      last.className = ((last.className || "") + " thermal-cut-marker").trim();
      try { last.style.marginBottom = "0"; last.style.paddingBottom = "0"; last.style.breakAfter = "auto"; last.style.pageBreakAfter = "auto"; } catch(e) {}
      document.body && document.body.setAttribute("data-page-width-mm", String(pageWidthMm));
    }
    function prepareTightLegacyPage(){
      markFinalCut();
      var body = document.body;
      if (!body) return;
      try {
        document.documentElement.style.margin = "0";
        document.documentElement.style.padding = "0";
        document.documentElement.style.border = "0";
        document.documentElement.style.width = pageWidthMm + "mm";
        document.documentElement.style.minHeight = "0";
        document.documentElement.style.height = "auto";
        document.documentElement.style.overflow = "hidden";
        body.style.margin = "0";
        body.style.padding = "0";
        body.style.border = "0";
        body.style.width = pageWidthMm + "mm";
        body.style.minHeight = "0";
        body.style.height = "auto";
        body.style.overflow = "visible";
      } catch (error) {}
      var marker = document.querySelector("[data-thermal-cut='true']");
      var markers = document.querySelectorAll("[data-thermal-cut='true']");
      if (markers.length) marker = markers[markers.length - 1];
      function measureBottom(el){ try { var r = el.getBoundingClientRect(); return r.bottom + (window.scrollY || window.pageYOffset || 0); } catch(e){ return 0; } }
      function measureTop(el){ try { var r = el.getBoundingClientRect(); return r.top + (window.scrollY || window.pageYOffset || 0); } catch(e){ return 0; } }
      function hasInk(el){
        var txt = (el.textContent || "").replace(/\u00a0|\s/g, "");
        var ink = false;
        try { var cs = window.getComputedStyle(el); ink = !!(cs && (cs.borderTopWidth !== "0px" || cs.borderBottomWidth !== "0px" || cs.borderLeftWidth !== "0px" || cs.borderRightWidth !== "0px" || (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent"))); } catch(e) {}
        return !!(txt || ink);
      }
      var topPx = 0;
      var leaves = body.querySelectorAll("*");
      for (var i = 0; i < leaves.length; i++) { if (hasInk(leaves[i])) { topPx = Math.max(0, measureTop(leaves[i])); break; } }
      var bottomPx = marker ? measureBottom(marker) : measureBottom(body);
      if (!bottomPx || bottomPx <= topPx) return;
      var heightMm = Math.max(8, Math.round(((bottomPx - topPx) * 25.4 / 96) * 100) / 100);
      var style = document.getElementById("tight-thermal-page-size");
      if (!style) { style = document.createElement("style"); style.id = "tight-thermal-page-size"; document.head.appendChild(style); }
      style.textContent = "@page{size:" + pageWidthMm + "mm " + heightMm + "mm!important;margin:0!important;padding:0!important;marks:none!important;}@page :first{margin:0!important;padding:0!important;}@page :left{margin:0!important;padding:0!important;}@page :right{margin:0!important;padding:0!important;}@media print{html{margin:0!important;padding:0!important;border:0!important;width:" + pageWidthMm + "mm!important;min-width:" + pageWidthMm + "mm!important;max-width:" + pageWidthMm + "mm!important;height:" + heightMm + "mm!important;min-height:0!important;max-height:" + heightMm + "mm!important;overflow:hidden!important;}body{position:absolute!important;top:0!important;left:0!important;margin:0!important;padding:0!important;border:0!important;width:" + pageWidthMm + "mm!important;min-width:" + pageWidthMm + "mm!important;max-width:" + pageWidthMm + "mm!important;height:" + heightMm + "mm!important;min-height:0!important;max-height:" + heightMm + "mm!important;overflow:hidden!important;}[data-thermal-cut='true']{margin-bottom:0!important;padding-bottom:0!important;break-after:auto!important;page-break-after:auto!important;}body>*:last-child{margin-bottom:0!important;padding-bottom:0!important;}}";
    }
    if (nativePrint) {
      window.print = function(){
        try { prepareTightLegacyPage(); } catch (error) {}
        return nativePrint();
      };
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", markFinalCut, { once: true });
    else markFinalCut();
    window.addEventListener("beforeprint", prepareTightLegacyPage);
    window.prepareTightThermalPrintPage = prepareTightLegacyPage;
  })();</script>`;

  return html.includes("prepareTightThermalPrintPage") ? html : html.replace("</body>", `${markerScript}</body>`);
};

const findNextInlineTag = (input: string, startIndex: number) => {
  let nextMatch:
    | {
        index: number;
        token: string;
        kind: "open" | "close";
        rule: (typeof TAG_RULES)[number];
      }
    | null = null;

  TAG_RULES.forEach((rule) => {
    const openIndex = input.indexOf(rule.open, startIndex);
    if (openIndex !== -1 && (!nextMatch || openIndex < nextMatch.index)) {
      nextMatch = { index: openIndex, token: rule.open, kind: "open", rule };
    }

    const closeIndex = input.indexOf(rule.close, startIndex);
    if (closeIndex !== -1 && (!nextMatch || closeIndex < nextMatch.index)) {
      nextMatch = { index: closeIndex, token: rule.close, kind: "close", rule };
    }
  });

  return nextMatch;
};

const findNextWrapperToken = (template: string, startIndex: number) => {
  let nextMatch:
    | {
        index: number;
        token: string;
        kind: "toggle" | "close";
        rule: (typeof WRAPPER_RULES)[number];
      }
    | null = null;

  WRAPPER_RULES.forEach((rule) => {
    rule.tokens.forEach((token) => {
      const index = template.indexOf(token, startIndex);
      if (index !== -1 && (!nextMatch || index < nextMatch.index)) {
        nextMatch = { index, token, kind: "toggle", rule };
      }
    });

    rule.closeTokens.forEach((token) => {
      const index = template.indexOf(token, startIndex);
      if (index !== -1 && (!nextMatch || index < nextMatch.index)) {
        nextMatch = { index, token, kind: "close", rule };
      }
    });
  });

  return nextMatch;
};

export const extractTemplateSections = (template: string): TemplateSection[] => {
  const normalizedTemplate = ensureFinalThermalCutMarker(template);
  const sections: TemplateSection[] = [];
  let activeRule: (typeof WRAPPER_RULES)[number] | null = null;
  let cursor = 0;
  let buffer = "";

  const pushBuffer = (isInsideWrapper = false) => {
    // Inside wrappers, preserve ALL blank lines (no trimming)
    const content = isInsideWrapper ? buffer.replace(/^\n/, "").replace(/\n$/, "") : trimEmptyEdges(buffer);
    if (!content && !isInsideWrapper) {
      buffer = "";
      return;
    }
    // Outside wrappers, skip empty-only content
    if (!isInsideWrapper && !content.trim()) {
      buffer = "";
      return;
    }

    sections.push({
      content: content || "",
      wrapperClass: activeRule?.className ?? "",
    });

    buffer = "";
  };

  while (cursor < normalizedTemplate.length) {
    const nextMatch = findNextWrapperToken(normalizedTemplate, cursor);

    if (!nextMatch) {
      buffer += normalizedTemplate.slice(cursor);
      break;
    }

    buffer += normalizedTemplate.slice(cursor, nextMatch.index);
    pushBuffer(!!activeRule);

    if (nextMatch.kind === "close") {
      if (activeRule?.className === nextMatch.rule.className) {
        activeRule = null;
      }
    } else if (activeRule?.className === nextMatch.rule.className) {
      activeRule = null;
    } else {
      activeRule = nextMatch.rule;
    }

    cursor = nextMatch.index + nextMatch.token.length;
  }

  pushBuffer(!!activeRule);

  if (sections.length === 0) {
    return [{ content: normalizedTemplate.trim(), wrapperClass: "" }];
  }

  return sections;
};

const replaceVariables = (input: string, variables: Record<string, string | number | null | undefined>) => {
  let output = input;

  // Two passes so variables inside configured fields (store name, footer, etc.) are also resolved
  for (let pass = 0; pass < 2; pass++) {
    Object.entries(variables).forEach(([key, rawValue]) => {
      output = replaceAllToken(output, key, rawValue == null ? "" : String(rawValue));
    });
  }

  return output;
};

export const stripFormattingTags = (input: string) => {
  let output = input;

  TAG_RULES.forEach((rule) => {
    output = replaceAllToken(output, rule.open, "");
    output = replaceAllToken(output, rule.close, "");
  });

  return replaceAllToken(output, "[CENTRO]", "").trim();
};

export const resolveTemplateLineClasses = (input: string) => {
  const classes = ["info"];

  if (input.includes("[CENTRO]")) {
    classes.push("center");
  }

  return unique(classes).join(" ");
};

export const renderInlineTemplateMarkup = (input: string) => {
  let markup = "";
  let cursor = 0;
  const activeRules: Array<(typeof TAG_RULES)[number]> = [];

  const closeRulesFrom = (ruleIndex: number) => {
    if (ruleIndex < 0) return;

    for (let index = activeRules.length - 1; index >= ruleIndex; index -= 1) {
      markup += "</span>";
    }

    activeRules.splice(ruleIndex);
  };

  while (cursor < input.length) {
    const nextMatch = findNextInlineTag(input, cursor);

    if (!nextMatch) {
      markup += escapeHtml(input.slice(cursor));
      break;
    }

    markup += escapeHtml(input.slice(cursor, nextMatch.index));

    if (nextMatch.kind === "close") {
      const activeIndex = activeRules.map((rule) => rule.className).lastIndexOf(nextMatch.rule.className);
      closeRulesFrom(activeIndex);
    } else {
      activeRules.push(nextMatch.rule);
      markup += `<span class="${nextMatch.rule.className}">`;
    }

    cursor = nextMatch.index + nextMatch.token.length;
  }

  closeRulesFrom(0);

  return markup;
};

const shouldHideOptionalLine = (
  rawLine: string,
  variables: Record<string, string | number | null | undefined>,
) => {
  if (!rawLine.includes("[MARCA]")) return false;

  const brandValue = variables["[MARCA]"];
  if (brandValue != null && String(brandValue).trim()) return false;

  const staticContent = stripFormattingTags(replaceAllToken(rawLine, "[MARCA]", ""))
    .replace(/\s+/g, " ")
    .trim();

  return !staticContent || /^marca\s*:?$/i.test(staticContent);
};

const shouldRenderTipoComandaLine = (
  rawLine: string,
  variables: Record<string, string | number | null | undefined>,
) => {
  if (!rawLine.includes("[TIPOCOMANDA]")) return false;

  const remainingContent = stripFormattingTags(
    replaceVariables(replaceAllToken(rawLine, "[TIPOCOMANDA]", ""), variables),
  )
    .replace(/\s+/g, " ")
    .trim();

  return !remainingContent;
};

const resolveTipoComandaContent = (
  tipoComanda: string,
  variables: Record<string, string | number | null | undefined>,
) => {
  let resolved = tipoComanda;
  for (let pass = 0; pass < 2; pass++) {
    Object.entries(variables).forEach(([key, rawValue]) => {
      if (key === "[TIPOCOMANDA]") return;
      resolved = replaceAllToken(resolved, key, rawValue == null ? "" : String(rawValue));
    });
  }
  return resolved.trim();
};

export const renderAdminTemplateMarkup = (
  template: string,
  variables: Record<string, string | number | null | undefined> = {},
  blocks: Record<string, string | undefined> = {},
) => {
  const lines = template.split("\n");

  const renderTextLine = (rawLine: string) => {
    const trimmedLine = rawLine.trim();
    // Preserve empty lines as spacing
    if (!trimmedLine) return '<div class="info">&nbsp;</div>';

    if (shouldHideOptionalLine(rawLine, variables)) return "";

    if (shouldRenderTipoComandaLine(rawLine, variables)) {
      const tipoComanda = variables["[TIPOCOMANDA]"] == null ? "" : String(variables["[TIPOCOMANDA]"]).trim();
      if (!tipoComanda) return "";

      const resolved = resolveTipoComandaContent(tipoComanda, variables);
      if (!resolved) return "";

      const classes = unique([resolveTemplateLineClasses(rawLine), "tipo-comanda-row"]).join(" ");
      return `<div class="${classes}"><span class="tipo-label">${escapeHtml(resolved)}</span></div>`;
    }

    const classes = resolveTemplateLineClasses(rawLine);
    const replaced = replaceVariables(rawLine, variables);
    const content = stripFormattingTags(replaced);
    // Allow lines that are entirely formatting (boxes, etc.) with empty content
    const markup = renderInlineTemplateMarkup(replaced);
    if (!content && !markup) return "";
    // If content is empty but markup has structure (spans etc), render with nbsp
    const finalMarkup = markup || "&nbsp;";

    return `<div class="${classes}">${finalMarkup}</div>`;
  };

  const renderLineWithBlocks = (rawLine: string) => {
    const enabledBlocks = Object.entries(blocks).filter(([token, html]) => rawLine.includes(token) && html);
    if (enabledBlocks.length === 0) return renderTextLine(rawLine);

    const parts: string[] = [];
    let cursor = 0;

    while (cursor < rawLine.length) {
      const nextBlock = enabledBlocks
        .map(([token, html]) => ({ token, html: html ?? "", index: rawLine.indexOf(token, cursor) }))
        .filter((block) => block.index !== -1)
        .sort((left, right) => left.index - right.index)[0];

      if (!nextBlock) {
        const tailMarkup = renderTextLine(rawLine.slice(cursor));
        if (tailMarkup) parts.push(tailMarkup);
        break;
      }

      const beforeMarkup = renderTextLine(rawLine.slice(cursor, nextBlock.index));
      if (beforeMarkup) parts.push(beforeMarkup);

      parts.push(nextBlock.html);
      cursor = nextBlock.index + nextBlock.token.length;
    }

    return parts.join("");
  };

  return lines
    .map((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      // Preserve empty lines as spacing
      if (!trimmed) return '<div class="info">&nbsp;</div>';
      if (trimmed === "---") return '<div class="separator thermal-cut-marker" data-thermal-cut="true"></div>';
      if (blocks[trimmed]) return blocks[trimmed] ?? "";

      return renderLineWithBlocks(line);
    })
    .join("");
};

const getFrameCss = (sectionPaddingMm: number, pageWidthMm: number) => {
  const bleed = Math.max(sectionPaddingMm, 0);

  return `
    .print-frame,
    .print-frame-strong,
    .print-frame-rect { display: block; box-sizing: border-box; }
    .print-frame {
      border: 1.5px solid #000 !important;
      padding: 1mm 2mm;
    }
    .print-frame-strong {
      border: 3px solid #000 !important;
      padding: 1mm 2mm;
    }
    .print-frame-rect {
      position: relative;
      width: calc(100% + ${bleed * 2}mm);
      margin-left: -${bleed}mm !important;
      margin-right: -${bleed}mm !important;
      padding: 1mm ${bleed}mm;
      border-top: 1.5px solid #000 !important;
      border-bottom: 1.5px solid #000 !important;
      border-left: 1.5px solid #000 !important;
      border-right: 1.5px solid #000 !important;
    }
  `;
};

export const PRINT_BOOTSTRAP_SCRIPT = `<script>
if (typeof __LOVA_FIX_TRIGGER__ === "undefined") { var __LOVA_FIX_TRIGGER__ = false; }
(function () {
  var keepOpen = false;
  try {
    keepOpen = /(?:\?|&)keep_open=1(?:&|$)/.test(window.location.search || "");
    var scopes = [];
    if (typeof globalThis !== "undefined") scopes.push(globalThis);
    if (typeof window !== "undefined") scopes.push(window);
    if (typeof self !== "undefined") scopes.push(self);

    scopes.forEach(function (scope) {
      if (!scope) return;
      if (typeof scope.__LOVA_FIX_TRIGGER__ === "undefined") {
        Object.defineProperty(scope, "__LOVA_FIX_TRIGGER__", {
          configurable: true,
          enumerable: false,
          writable: true,
          value: false,
        });
        return;
      }

      scope.__LOVA_FIX_TRIGGER__ = Boolean(scope.__LOVA_FIX_TRIGGER__);
    });
  } catch (error) {}

  var started = false;
  var printFinished = false;
  var attempts = 0;
  var maxAttempts = 12;
  var retryTimers = [];
  var closeTimer = null;
  var totalCopies = 1;
  var copiesDone = 0;
  var awaitingAfterPrint = false;
  var lastFireAt = 0;
  var kioskTimerMode = false;
  var printGapMs = 900;

  try {
    var attr = document.body && document.body.getAttribute("data-print-copies");
    var n = parseInt(attr || "1", 10);
    if (!isNaN(n) && n > 0) totalCopies = Math.min(20, n);
    var params = new URLSearchParams(window.location.search || "");
    kioskTimerMode = params.get("kiosk_timer") === "1";
    var gap = parseInt(params.get("print_gap_ms") || "900", 10);
    if (!isNaN(gap)) printGapMs = Math.max(350, Math.min(5000, gap));
  } catch (error) {}

  function clearRetryTimers() {
    while (retryTimers.length) {
      try { clearTimeout(retryTimers.pop()); } catch (error) {}
    }
  }

  function markFinished() {
    printFinished = true;
    clearRetryTimers();
  }

  function scheduleClose(delay) {
    if (keepOpen || closeTimer) return;
    closeTimer = setTimeout(function () {
      try { window.close(); } catch (error) {}
    }, delay);
  }

  function fireSinglePrint() {
    awaitingAfterPrint = true;
    lastFireAt = Date.now();
    try { window.focus(); } catch (error) {}
    try { prepareTightPrintPage(); } catch (error) {}
    try { document.body && document.body.offsetHeight; } catch (error) {}
    try { window.print(); } catch (error) {}
    if (kioskTimerMode) {
      setTimeout(function () {
        if (awaitingAfterPrint) onCopyDone();
      }, printGapMs);
    }
  }

  function runPrint() {
    if (printFinished) return;
    if (copiesDone >= totalCopies) {
      markFinished();
      scheduleClose(400);
      return;
    }
    attempts += 1;
    fireSinglePrint();
  }

  function onCopyDone() {
    if (!awaitingAfterPrint) return;
    awaitingAfterPrint = false;
    copiesDone += 1;
    if (copiesDone >= totalCopies) {
      markFinished();
      scheduleClose(400);
      return;
    }
    // In kiosk mode, afterprint can be unreliable; timer mode drives each copy.
    setTimeout(runPrint, kioskTimerMode ? printGapMs : 350);
  }

  function queuePrint(delay) {
    retryTimers.push(setTimeout(function () {
      if (printFinished) return;
      if (awaitingAfterPrint) return;
      if (copiesDone > 0) return; // initial-retry safety net only
      try {
        requestAnimationFrame(function () {
          requestAnimationFrame(runPrint);
        });
      } catch (error) {
        runPrint();
      }
    }, delay));
  }

  function prepareTightPrintPage() {
    var body = document.body;
    if (!body) return;

    try {
      document.documentElement.style.margin = "0";
      document.documentElement.style.padding = "0";
      document.documentElement.style.border = "0";
      document.documentElement.style.minHeight = "0";
      document.documentElement.style.height = "auto";
      body.style.margin = "0";
      body.style.padding = "0";
      body.style.border = "0";
      body.style.minHeight = "0";
      body.style.height = "auto";
      body.style.overflow = "visible";
    } catch (error) {}

    // Measure the exact receipt area. If the template ends with "---", that
    // separator is the mandatory thermal cut point and nothing after it counts.
    var root = document.querySelector(".print-root") || body;
    var lastDoc = null;
    var docs = root.querySelectorAll(".print-document");
    if (docs.length) lastDoc = docs[docs.length - 1];

    try {
      root.style.margin = "0";
      root.style.padding = "0";
      root.style.border = "0";
      root.style.minHeight = "0";
      root.style.height = "auto";
      root.style.overflow = "visible";
    } catch (error) {}

    var bottomPx = 0;
    var topPx = 0;
    var cutMarker = null;
    function measureBottom(el) {
      if (!el) return 0;
      try {
        var r = el.getBoundingClientRect();
        return r.bottom + (window.scrollY || window.pageYOffset || 0);
      } catch (e) { return 0; }
    }
    function measureTop(el) {
      if (!el) return 0;
      try {
        var r = el.getBoundingClientRect();
        return r.top + (window.scrollY || window.pageYOffset || 0);
      } catch (e) { return 0; }
    }
    function hasPrintableContent(el) {
      if (!el || !el.getBoundingClientRect) return false;
      var txt = (el.textContent || "").replace(/\u00a0|\s/g, "");
      var hasInk = false;
      try {
        var cs = window.getComputedStyle(el);
        hasInk = !!(cs && (cs.borderTopWidth !== "0px" || cs.borderBottomWidth !== "0px" || cs.borderLeftWidth !== "0px" || cs.borderRightWidth !== "0px" || (cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent")));
      } catch (e) {}
      return !!(txt || hasInk);
    }

    if (lastDoc) {
      var firstDoc = docs[0] || lastDoc;
      var firstLeaves = firstDoc.querySelectorAll("*");
      for (var t = 0; t < firstLeaves.length; t++) {
        if (hasPrintableContent(firstLeaves[t])) {
          topPx = Math.max(0, measureTop(firstLeaves[t]));
          break;
        }
      }

      var markers = lastDoc.querySelectorAll("[data-thermal-cut='true']");
      if (markers.length) cutMarker = markers[markers.length - 1];

      // Walk last leaves to find the true content bottom (ignoring trailing empty nodes),
      // unless a final cut marker exists; then the marker is the receipt bottom.
      var leaves = lastDoc.querySelectorAll("*");
      for (var i = leaves.length - 1; i >= 0; i--) {
        var el = leaves[i];
        if (hasPrintableContent(el)) {
          bottomPx = Math.max(bottomPx, measureBottom(el));
          break;
        }
      }
      if (cutMarker) bottomPx = measureBottom(cutMarker);
      if (!bottomPx) bottomPx = measureBottom(lastDoc);
    } else {
      bottomPx = measureBottom(root);
    }

    var heightPx = Math.max(1, bottomPx - topPx);
    if (!heightPx || heightPx < 1) return;

    var pageWidthMm = parseFloat(body.getAttribute("data-page-width-mm") || "72") || 72;
    // No integer-mm rounding: keep the page at the exact measured content height.
    var pageHeightMm = Math.max(8, Math.round((heightPx * 25.4 / 96) * 100) / 100);
    var style = document.getElementById("tight-thermal-page-size");
    if (!style) {
      style = document.createElement("style");
      style.id = "tight-thermal-page-size";
      document.head.appendChild(style);
    }
    style.textContent = "@page{size:" + pageWidthMm + "mm " + pageHeightMm + "mm!important;margin:0!important;padding:0!important;marks:none!important;}@page :first{margin:0!important;padding:0!important;}@page :left{margin:0!important;padding:0!important;}@page :right{margin:0!important;padding:0!important;}@media print{html,body{margin:0!important;padding:0!important;border:0!important;width:" + pageWidthMm + "mm!important;min-width:" + pageWidthMm + "mm!important;max-width:" + pageWidthMm + "mm!important;height:" + pageHeightMm + "mm!important;min-height:0!important;max-height:" + pageHeightMm + "mm!important;overflow:hidden!important;}.print-root{position:absolute!important;top:0!important;left:0!important;margin:0!important;padding:0!important;border:0!important;width:" + pageWidthMm + "mm!important;height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;}.print-document,.print-section{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important;padding-top:0!important;padding-bottom:0!important;margin-top:0!important;margin-bottom:0!important;}.print-document:first-child,.print-section:first-child,.print-section:first-child>*:first-child{padding-top:0!important;margin-top:0!important;}.print-document:last-child,.print-section:last-child,.print-section:last-child>*:last-child{padding-bottom:0!important;margin-bottom:0!important;}}";

    try {
      document.documentElement.style.minHeight = "0";
      body.style.minHeight = "0";
      window.resizeTo(Math.ceil(pageWidthMm * 96 / 25.4), Math.min(screen.availHeight || 900, Math.ceil(heightPx)));
    } catch (error) {}
  }

  function firePrint() {
    var run = function () {
      if (printFinished) return;
      runPrint();
      // Initial safety retries only if first print never fired
      [800, 1800, 3200].forEach(queuePrint);
    };

    if (started) { run(); return; }
    started = true;

    if (document.fonts && document.fonts.ready) {
      var fontsReadyResolved = false;
      var runWhenReady = function () {
        if (fontsReadyResolved) return;
        fontsReadyResolved = true;
        run();
      };
      document.fonts.ready.then(runWhenReady).catch(runWhenReady);
      setTimeout(runWhenReady, 220);
      return;
    }

    setTimeout(run, 60);
  }

  if (document.readyState === "complete") {
    setTimeout(firePrint, 40);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(firePrint, 20);
    }, { once: true });
    window.addEventListener("load", function () {
      setTimeout(firePrint, 20);
    }, { once: true });
  }

  window.addEventListener("message", function (event) {
    try {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "turbo-print-now") return;
      if (started) return; // never restart the loop mid-flight
      setTimeout(firePrint, 10);
    } catch (error) {}
  });

  window.addEventListener("beforeprint", function () {
    try { prepareTightPrintPage(); } catch (error) {}
  });

  window.addEventListener("afterprint", function () {
    onCopyDone();
  });

  // Fallback: if afterprint never fires (some kiosk Chromiums), advance after timeout
  setInterval(function () {
    if (awaitingAfterPrint && Date.now() - lastFireAt > 4000) {
      onCopyDone();
    }
  }, 1000);

})();
</script>`;

const getSharedPrintStyles = ({
  pageSize,
  pageMarginMm,
  pageWidthMm,
  bodyFontFamily,
  bodyFontSizePx,
  labelFontSizePx,
  bodyPaddingMm,
  frameCss,
  extraCss,
  labelGapMm,
}: {
  pageSize: string;
  pageMarginMm: number;
  pageWidthMm: number;
  bodyFontFamily: string;
  bodyFontSizePx: number;
  labelFontSizePx: number;
  bodyPaddingMm: number;
  frameCss: string;
  extraCss: string;
  labelGapMm?: number;
}) => {
  const gapMm = labelGapMm ?? 0.3;
  const mediumTextPx = Math.max(bodyFontSizePx + 3, Math.round(bodyFontSizePx * 1.25));
  const largeTextPx = Math.max(labelFontSizePx + 2, bodyFontSizePx + 10);
  const giantTextPx = Math.max(labelFontSizePx + 8, largeTextPx + 6);
  const smallTextPx = Math.max(bodyFontSizePx - 3, 7);

  return `
        @page { size: ${pageSize} portrait; margin: 0 !important; padding: 0 !important; marks: none !important; }
        @page :first { margin: 0 !important; padding: 0 !important; }
        @page :left { margin: 0 !important; padding: 0 !important; }
        @page :right { margin: 0 !important; padding: 0 !important; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; border: 0 !important; width: ${pageWidthMm}mm !important; min-width: ${pageWidthMm}mm !important; max-width: ${pageWidthMm}mm !important; min-height: 0 !important; height: auto !important; overflow: visible !important; }
          iframe, [data-lovable], a[href*="lovable"], #lovable-badge, [id*="lovable"], [class*="lovable"] { display: none !important; visibility: hidden !important; }
          body > *:not(.print-root):not(script):not(style) { display: none !important; }
          * { box-sizing: border-box !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-root { position: absolute !important; inset: 0 auto auto 0 !important; width: ${pageWidthMm}mm !important; padding: 0 !important; margin: 0 !important; border: 0 !important; min-height: 0 !important; height: auto !important; }
          .print-document { page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page; padding-top: 0 !important; padding-bottom: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; }
          .print-section { padding-top: 0 !important; padding-bottom: 0 !important; margin-top: 0 !important; margin-bottom: 0 !important; min-height: 0 !important; height: auto !important; }
          .print-document:first-child, .print-section:first-child, .print-section:first-child > *:first-child { padding-top: 0 !important; margin-top: 0 !important; }
          .print-document:last-child { page-break-after: auto; break-after: auto; padding-bottom: 0 !important; margin-bottom: 0 !important; }
          .print-document > *:last-child, .print-section:last-child { padding-bottom: 0 !important; margin-bottom: 0 !important; }
          .print-section:last-child > *:last-child { padding-bottom: 0 !important; margin-bottom: 0 !important; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #ffffff; color: #000000; margin: 0; padding: 0; border: 0; min-height: 0; height: auto; overflow: visible; }
        body {
          font-family: ${bodyFontFamily};
          font-size: ${bodyFontSizePx}px;
          font-weight: 900;
          width: ${pageWidthMm}mm;
          padding: 0;
          padding-bottom: 0;
          line-height: 1.3;
          letter-spacing: 0;
          -webkit-font-smoothing: none;
          text-rendering: geometricPrecision;
        }
        .print-root { display: flex; flex-direction: column; gap: 0; width: ${pageWidthMm}mm; padding: 0; margin: 0; border: 0; padding-bottom: 0; margin-bottom: 0; }
        .print-document { display: block; background: #ffffff; width: ${pageWidthMm}mm; padding-bottom: 0; margin-bottom: 0; }
        .print-document + .print-document { margin-top: 0; border-top: 0; padding-top: 0; }
        .print-document:last-child { page-break-after: auto; break-after: auto; }
        .print-section { display: block; width: 100%; max-width: 100%; }
        ${frameCss}
        .center { display: block; width: 100%; text-align: center; }
        .separator { border-top: 1.5px dashed #000; margin: 1.5px 0; }
        .print-section:last-child > .thermal-cut-marker:last-child { margin-bottom: 0 !important; }
        .info { font-size: ${bodyFontSizePx}px; margin: 1.5px 0; font-weight: 900; line-height: 1.35; }
        .grand-total { font-size: ${bodyFontSizePx + 1}px; font-weight: 900; margin: 1.5px 0; line-height: 1.35; }
        .txt-grande { font-size: ${largeTextPx}px !important; font-weight: 900; line-height: 1.18; }
        .txt-medio { font-size: ${mediumTextPx}px !important; font-weight: 900; line-height: 1.32; }
        .txt-pequeno { font-size: ${smallTextPx}px !important; font-weight: 900; line-height: 1.3; }
        .txt-gigante { font-size: ${giantTextPx}px !important; font-weight: 900; line-height: 1.12; }
        .txt-borda-preta { display: block; width: 100%; margin: 1.5px 0; padding: 1mm 2mm; background: #000; color: #fff; font-weight: 900; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .txt-borda-inline { display: inline; padding: 0.3mm 2mm; background: #000; color: #fff; font-weight: 900; line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .black-highlight { display: block; width: 100%; margin: 1px 0; padding: 0.8mm 1.5mm; background: #000; color: #fff; font-weight: 900; line-height: 1.25; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .inline-border { display: block; width: 100%; margin: 1.5px 0; padding: 0.8mm 1.5mm; border: 2.5px solid #000; font-weight: 900; line-height: 1.35; }
        .tipo-comanda-row { margin: 0; }
        .tipo-label {
          display: block;
          width: 100%;
          font-size: ${giantTextPx}px !important;
          font-weight: 900;
          text-align: center;
          letter-spacing: 0.5px;
          margin: 1.2px 0;
          padding: 0.8mm 1.2mm;
          border: 3px solid #000;
          text-transform: uppercase;
          line-height: 1.08;
        }
        .pedido-destaque { font-size: ${largeTextPx}px !important; font-weight: 900; text-align: center; margin: 2px 0; line-height: 1.18; }
        .box-highlight {
          display: block;
          width: 100%;
          margin: 1.5px 0;
          padding: 0.8mm 1.5mm;
          border: 2.5px solid #000;
          font-size: inherit !important;
          font-weight: 900;
          line-height: 1.2;
          text-align: inherit;
        }
        .items-table { width: 100%; border-collapse: collapse; margin: 2px 0; }
        .items-table td { padding: 1px 0; vertical-align: top; font-weight: 900; }
        .items-table .items-qty { white-space: nowrap; width: 1%; padding-right: 4px; }
        .items-table .items-name { word-break: break-word; }
        .items-table .items-price { white-space: nowrap; width: 1%; text-align: right; padding-left: 4px; }
        .items-table .items-obs-td,
        .items-table .items-addon-td { padding: 0.8mm 1.5mm; background: #000; color: #fff; font-size: ${Math.max(bodyFontSizePx - 1, 7)}px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .list-block { display: flex; flex-direction: column; gap: 4px; margin: 2px 0; }
        .list-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #d4d4d4; padding: 4px 0; }
        .list-name { flex: 1; min-width: 0; word-break: break-word; }
        .list-qty { white-space: nowrap; }
        .info,
        .grand-total,
        .txt-grande,
        .txt-medio,
        .txt-pequeno,
        .txt-gigante,
        .tipo-label,
        .pedido-destaque,
        .box-highlight,
        .list-name { overflow-wrap: break-word; white-space: normal; }
        ${extraCss}
      `;
};

export const buildAdminPrintDocument = ({
  title,
  template,
  variables = {},
  blocks = {},
  pageWidthMm = 72,
  pageHeightMm = "auto",
  pageMarginMm = 0,
  repeatCount = 1,
  bodyFontFamily = "Arial, Helvetica, sans-serif",
  bodyFontSizePx = 11,
  labelFontSizePx = bodyFontSizePx + 8,
  bodyPaddingMm = 0,
  sectionPaddingMm = 2,
  sectionMinHeightMm,
  sectionBorder = "none",
  extraCss = "",
  labelGapMm,
}: BuildAdminPrintDocumentOptions) => {
  const templateSections = extractTemplateSections(template);
  const pageSize = pageHeightMm === "auto" ? `${pageWidthMm}mm auto` : `${pageWidthMm}mm ${pageHeightMm}mm`;
  const minHeightStyle = sectionMinHeightMm ? `min-height:${sectionMinHeightMm}mm;` : "";
  const frameCss = getFrameCss(sectionPaddingMm, pageWidthMm);
  const sharedStyles = getSharedPrintStyles({
    pageSize,
    pageMarginMm,
    pageWidthMm,
    bodyFontFamily,
    bodyFontSizePx,
    labelFontSizePx,
    bodyPaddingMm,
    frameCss,
    extraCss,
    labelGapMm,
  });
  const copies = Math.max(1, Math.min(20, repeatCount));
  const singleContent = templateSections
    .map(({ content: sectionTemplate, wrapperClass }) => {
      const markup = renderAdminTemplateMarkup(sectionTemplate, variables, blocks);
      if (!markup) return "";

      const sectionClasses = ["print-section", wrapperClass].filter(Boolean).join(" ");
      return `<section class="${sectionClasses}" style="${minHeightStyle}padding:${sectionPaddingMm}mm;border:${sectionBorder};">${markup}</section>`;
    })
    .filter(Boolean)
    .join("");

  const documents = `<article class="print-document" style="width:${pageWidthMm}mm;">${singleContent}</article>`;

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        ${sharedStyles}
      </style>
    </head>
    <body data-print-document="ready" data-print-copies="${copies}" data-page-width-mm="${pageWidthMm}">
      <main class="print-root">${documents}</main>
      ${PRINT_BOOTSTRAP_SCRIPT}
    </body>
  </html>`;
};

export const buildBatchPrintDocument = (
  base: Omit<BuildAdminPrintDocumentOptions, "repeatCount">,
  items: BatchSection[],
) => {
  const {
    title,
    template,
    pageWidthMm = 72,
    pageHeightMm = "auto",
    pageMarginMm = 0,
    bodyFontFamily = "Arial, Helvetica, sans-serif",
    bodyFontSizePx = 11,
    labelFontSizePx = bodyFontSizePx + 8,
    bodyPaddingMm = 0,
    sectionPaddingMm = 2,
    sectionMinHeightMm,
    sectionBorder = "none",
    extraCss = "",
  } = base;

  const templateSections = extractTemplateSections(template);
  const pageSize = pageHeightMm === "auto" ? `${pageWidthMm}mm auto` : `${pageWidthMm}mm ${pageHeightMm}mm`;
  const minHeightStyle = sectionMinHeightMm ? `min-height:${sectionMinHeightMm}mm;` : "";
  const frameCss = getFrameCss(sectionPaddingMm, pageWidthMm);
  const sharedStyles = getSharedPrintStyles({
    pageSize,
    pageMarginMm,
    pageWidthMm,
    bodyFontFamily,
    bodyFontSizePx,
    labelFontSizePx,
    bodyPaddingMm,
      frameCss,
      extraCss,
      labelGapMm: base.labelGapMm,
    });

  const documents = items
    .map((item) => {
      const mergedVars = { ...(base.variables ?? {}), ...(item.variables ?? {}) };
      const mergedBlocks = { ...(base.blocks ?? {}), ...(item.blocks ?? {}) };
      const content = templateSections
        .map(({ content: sectionTemplate, wrapperClass }) => {
          const markup = renderAdminTemplateMarkup(sectionTemplate, mergedVars, mergedBlocks);
          if (!markup) return "";

          const cls = ["print-section", wrapperClass].filter(Boolean).join(" ");
          return `<section class="${cls}" style="${minHeightStyle}padding:${sectionPaddingMm}mm;border:${sectionBorder};">${markup}</section>`;
        })
        .filter(Boolean)
        .join("");

      return `<article class="print-document" style="width:${pageWidthMm}mm;">${content}</article>`;
    })
    .join("");

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        ${sharedStyles}
      </style>
    </head>
    <body data-print-document="ready" data-page-width-mm="${pageWidthMm}">
      <main class="print-root">${documents}</main>
      ${PRINT_BOOTSTRAP_SCRIPT}
    </body>
  </html>`;
};
