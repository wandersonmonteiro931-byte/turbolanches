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

  while (cursor < template.length) {
    const nextMatch = findNextWrapperToken(template, cursor);

    if (!nextMatch) {
      buffer += template.slice(cursor);
      break;
    }

    buffer += template.slice(cursor, nextMatch.index);
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
    return [{ content: template.trim(), wrapperClass: "" }];
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
      if (trimmed === "---") return '<div class="separator"></div>';
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

const PRINT_BOOTSTRAP_SCRIPT = `<script>
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

  function clearRetryTimers() {
    while (retryTimers.length) {
      try { clearTimeout(retryTimers.pop()); } catch (error) {}
    }
  }

  function markFinished() {
    printFinished = true;
    clearRetryTimers();
  }

  function runPrint() {
    if (printFinished || attempts >= maxAttempts) return;
    attempts += 1;

    try { window.focus(); } catch (error) {}
    try { document.body && document.body.offsetHeight; } catch (error) {}

    try {
      window.print();
    } catch (error) {
      // Keep retrying: kiosk/thermal Chromium can ignore the first call while
      // the generated document is still being painted.
    }

    try {
      if (document.execCommand) {
        document.execCommand("print", false);
      }
    } catch (error) {}
  }

  function queuePrint(delay) {
    retryTimers.push(setTimeout(function () {
      if (printFinished) return;
      try {
        requestAnimationFrame(function () {
          requestAnimationFrame(runPrint);
        });
      } catch (error) {
        runPrint();
      }
    }, delay));
  }

  function firePrint() {
    var run = function () {
      if (printFinished) return;
      runPrint();
      [40, 120, 260, 480, 800, 1200, 1800, 2600, 3600].forEach(queuePrint);
    };

    if (started) {
      run();
      return;
    }

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

  window.addEventListener("pageshow", function () {
    setTimeout(firePrint, 20);
  });

  window.addEventListener("focus", function () {
    setTimeout(firePrint, 10);
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      setTimeout(firePrint, 10);
    }
  });

  window.addEventListener("message", function (event) {
    try {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "turbo-print-now") return;
      setTimeout(firePrint, 10);
    } catch (error) {}
  });

  window.addEventListener("beforeprint", function () {
    markFinished();
  });

  window.addEventListener("afterprint", function () {
    markFinished();
  });

  retryTimers.push(setTimeout(function () {
    if (!printFinished) {
      firePrint();
    }
  }, 5000));

  if (!keepOpen) {
    window.addEventListener("afterprint", function () {
      setTimeout(function () {
        try { window.close(); } catch (error) {}
      }, 120);
    }, { once: true });
  }
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
        @page { size: ${pageSize} portrait; margin: ${pageMarginMm}mm !important; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: ${pageWidthMm}mm !important; min-width: ${pageWidthMm}mm !important; max-width: ${pageWidthMm}mm !important; height: auto !important; overflow: hidden !important; }
          iframe, [data-lovable], a[href*="lovable"], #lovable-badge, [id*="lovable"], [class*="lovable"] { display: none !important; visibility: hidden !important; }
          body > *:not(.print-root):not(script):not(style) { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .print-document { page-break-inside: avoid; break-inside: avoid; page-break-after: always; break-after: page; }
          .print-document:last-child { page-break-after: auto; break-after: auto; }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { background: #ffffff; color: #000000; }
        body {
          font-family: ${bodyFontFamily};
          font-size: ${bodyFontSizePx}px;
          font-weight: 900;
          width: ${pageWidthMm}mm;
          padding: ${bodyPaddingMm}mm;
          line-height: 1.3;
          letter-spacing: 0;
          -webkit-font-smoothing: none;
          text-rendering: geometricPrecision;
        }
        .print-root { display: flex; flex-direction: column; gap: 0; width: ${pageWidthMm}mm; }
        .print-document { display: block; background: #ffffff; width: ${pageWidthMm}mm; }
        .print-document + .print-document { margin-top: 0; border-top: 0; padding-top: 0; }
        .print-document:last-child { page-break-after: auto; break-after: auto; }
        .print-section { display: block; width: 100%; max-width: 100%; }
        ${frameCss}
        .center { display: block; width: 100%; text-align: center; }
        .separator { border-top: 1.5px dashed #000; margin: 1.5px 0; }
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
  const documents = Array.from({ length: Math.max(1, repeatCount) }, () => {
    const content = templateSections
      .map(({ content: sectionTemplate, wrapperClass }) => {
        const markup = renderAdminTemplateMarkup(sectionTemplate, variables, blocks);
        if (!markup) return "";

        const sectionClasses = ["print-section", wrapperClass].filter(Boolean).join(" ");
        return `<section class="${sectionClasses}" style="${minHeightStyle}padding:${sectionPaddingMm}mm;border:${sectionBorder};">${markup}</section>`;
      })
      .filter(Boolean)
      .join("");

    return `<article class="print-document" style="width:${pageWidthMm}mm;">${content}</article>`;
  }).join("");

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
    <body>
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
    <body>
      <main class="print-root">${documents}</main>
      ${PRINT_BOOTSTRAP_SCRIPT}
    </body>
  </html>`;
};
