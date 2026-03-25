const TAG_RULES = [
  { open: "[CENTRO]", close: "[/CENTRO]", className: "center" },
  { open: "[GRANDE]", close: "[/GRANDE]", className: "tipo-label" },
  { open: "[DESTAQUE]", close: "[/DESTAQUE]", className: "pedido-destaque" },
  { open: "[CAIXA]", close: "[/CAIXA]", className: "box-highlight" },
  { open: "[NEGRITO]", close: "[/NEGRITO]", className: "grand-total" },
  { open: "[TXTMEDIO]", close: "[/TXTMEDIO]", className: "txt-medio" },
  { open: "[TXTPEQUENO]", close: "[/TXTPEQUENO]", className: "txt-pequeno" },
  { open: "[TXTGIGANTE]", close: "[/TXTGIGANTE]", className: "txt-gigante" },
  { open: "[TZTBORDA]", close: "[/TZTBORDA]", className: "txt-borda-preta" },
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
  bodyPaddingMm?: number;
  sectionPaddingMm?: number;
  sectionMinHeightMm?: number;
  sectionBorder?: string;
  extraCss?: string;
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

const replaceVariables = (input: string, variables: Record<string, string | number | null | undefined>) => {
  let output = input;

  Object.entries(variables).forEach(([key, rawValue]) => {
    output = replaceAllToken(output, key, rawValue == null ? "" : String(rawValue));
  });

  return output;
};

const stripFormattingTags = (input: string) => {
  let output = input;

  TAG_RULES.forEach((rule) => {
    output = replaceAllToken(output, rule.open, "");
    output = replaceAllToken(output, rule.close, "");
  });

  return replaceAllToken(output, "[CENTRO]", "").trim();
};

const resolveClasses = (input: string) => {
  const classes = ["info"];

  TAG_RULES.forEach((rule) => {
    if (input.includes(rule.open) || input.includes(rule.close)) {
      classes.push(rule.className);
    }
  });

  if (input.includes("[CENTRO]")) {
    classes.push("center");
  }

  return unique(classes).join(" ");
};

export const renderAdminTemplateMarkup = (
  template: string,
  variables: Record<string, string | number | null | undefined> = {},
  blocks: Record<string, string | undefined> = {},
) => {
  const lines = template.split("\n");

  return lines
    .map((rawLine) => {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (!trimmed) return "";
      if (trimmed === "---") return '<div class="separator"></div>';
      if (blocks[trimmed]) return blocks[trimmed] ?? "";

      const classes = resolveClasses(line);
      const replaced = replaceVariables(line, variables);
      const content = stripFormattingTags(replaced);
      if (!content) return "";

      return `<div class="${classes}">${escapeHtml(content)}</div>`;
    })
    .filter(Boolean)
    .join("");
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
  bodyFontFamily = "'Arial Black', Arial, Helvetica, sans-serif",
  bodyFontSizePx = 10,
  bodyPaddingMm = 0,
  sectionPaddingMm = 2,
  sectionMinHeightMm,
  sectionBorder = "none",
  extraCss = "",
}: BuildAdminPrintDocumentOptions) => {
  const pageSize = pageHeightMm === "auto" ? `${pageWidthMm}mm auto` : `${pageWidthMm}mm ${pageHeightMm}mm`;
  const minHeightStyle = sectionMinHeightMm ? `min-height:${sectionMinHeightMm}mm;` : "";
  const sections = Array.from({ length: Math.max(1, repeatCount) }, () => {
    const content = renderAdminTemplateMarkup(template, variables, blocks);
    return `<section class="print-page" style="width:${pageWidthMm}mm;${minHeightStyle}padding:${sectionPaddingMm}mm;border:${sectionBorder};">${content}</section>`;
  }).join("");

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: ${pageSize}; margin: ${pageMarginMm}mm !important; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; width: ${pageWidthMm}mm !important; }
          iframe, [data-lovable], a[href*="lovable"], #lovable-badge, [id*="lovable"], [class*="lovable"] { display: none !important; visibility: hidden !important; }
          body > *:not(.print-root):not(script):not(style) { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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
          letter-spacing: 0.2px;
          -webkit-font-smoothing: none;
          text-rendering: geometricPrecision;
        }
        .print-root { display: flex; flex-direction: column; gap: ${Math.max(0, pageMarginMm)}mm; }
        .print-page { display: block; page-break-after: always; break-after: page; overflow: hidden; background: #ffffff; }
        .print-page:last-child { page-break-after: auto; break-after: auto; }
        .center { text-align: center; }
        .separator { border-top: 1.5px dashed #000; margin: 3px 0; }
        .info { font-size: ${bodyFontSizePx}px; margin: 1px 0; font-weight: 900; line-height: 1.35; }
        .grand-total { font-size: ${bodyFontSizePx + 2}px; font-weight: 900; margin: 2px 0; }
        .txt-medio { font-size: ${bodyFontSizePx + 4}px; font-weight: 900; margin: 2px 0; line-height: 1.35; }
        .txt-pequeno { font-size: ${Math.max(bodyFontSizePx - 2, 8)}px; font-weight: 700; margin: 1px 0; line-height: 1.3; }
        .txt-gigante { font-size: ${bodyFontSizePx + 14}px; font-weight: 900; margin: 3px 0; line-height: 1.2; letter-spacing: 0.6px; }
        .txt-borda-preta { display: block; width: 100%; margin: 2px 0; padding: 3px 4px; background: #000; color: #fff; font-weight: 900; letter-spacing: 0.4px; }
        .tipo-label { font-size: ${bodyFontSizePx + 8}px; font-weight: 900; text-align: center; letter-spacing: 2px; margin: 3px 0; padding: 4px 0; border: 2px solid #000; text-transform: uppercase; }
        .pedido-destaque { font-size: ${bodyFontSizePx + 10}px; font-weight: 900; text-align: center; margin: 3px 0; letter-spacing: 1px; }
        .box-highlight { font-size: ${bodyFontSizePx + 1}px; font-weight: 900; margin: 3px 0; padding: 4px 3px; border: 2px solid #000; line-height: 1.4; }
        .list-block { display: flex; flex-direction: column; gap: 4px; margin: 2px 0; }
        .list-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; border-bottom: 1px solid #d4d4d4; padding: 4px 0; }
        .list-name { flex: 1; min-width: 0; word-break: break-word; }
        .list-qty { white-space: nowrap; }
        ${extraCss}
      </style>
    </head>
    <body>
      <main class="print-root">${sections}</main>
      <script>window.onload = function () { window.print(); };</script>
    </body>
  </html>`;
};