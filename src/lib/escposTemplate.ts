/**
 * Renderiza um template de comanda (com tags [CENTRO], [GRANDE], [NEGRITO],
 * [TXTMEDIO], [CAIXA], [QUADRADONEGRITO], [TZTBORDA], etc) diretamente em
 * comandos ESC/POS para impressão raw via QZ Tray.
 *
 * Mantém o MESMO formato visual configurado pelo admin no template HTML,
 * sem layout hardcoded.
 */

import { EscPosBuilder, type EscPosBuilderOptions, type Align } from "./escposBuilder";

export interface RenderTemplateInput {
  template: string; // body_template do receipt_templates
  variables: Record<string, string>; // [NOMECLIENTE], [TOTAL] etc já formatados
  itemsBlock?: string[]; // linhas pré-renderizadas para [ITENS] (quando usado sozinho)
  itemTemplate?: string | null; // se [ITENS] aparece junto de outras tags
  items?: ItemForTemplate[];
}

export interface ItemForTemplate {
  productName: string;
  quantity: number;
  unitPrice: number;
  observations?: string | null;
  addons?: { name: string; quantity?: number; price?: number }[];
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

const ADDRESS_OPEN = "\uE000ADDR\uE000";
const ADDRESS_CLOSE = "\uE000/ADDR\uE000";

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));

const removeEmojisAndControls = (value: string) =>
  value
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[📦🛵🚚🛍️🍔🍕✅❌⚠️🧾💰🔒🔓🔥⭐❤️❤]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

const normalizeHtmlForEscPos = (value: string) => {
  let out = String(value || "");

  out = out.replace(
    /<div[^>]*class=["'][^"']*report-row[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi,
    (_, left, right) =>
      `\n__ITEM__${decodeHtmlEntities(String(left).replace(/<[^>]*>/g, "")).trim()}__SEP__${decodeHtmlEntities(String(right).replace(/<[^>]*>/g, "")).trim()}\n`,
  );

  out = out
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:div|p|tr|li|h1|h2|h3|h4)>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<\/td>/gi, " ")
    .replace(/<th[^>]*>/gi, " ")
    .replace(/<\/th>/gi, " ")
    .replace(/<[^>]*>/g, "");

  out = decodeHtmlEntities(out);
  out = removeEmojisAndControls(out);

  return out
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n");
};

const isAddressToken = (token: string) => /^\[(ENDEREÇO|ENDERECO)\]$/i.test(token);
const formatAddressValue = (value: string) => value.toLocaleUpperCase("pt-BR");
const formatPrintAddressForEscPos = (value: string) => normalizeHtmlForEscPos(value).toLocaleUpperCase("pt-BR");

const replaceTokens = (text: string, vars: Record<string, string>): string => {
  let out = text;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [k, v] of Object.entries(vars)) {
      const value = normalizeHtmlForEscPos(v ?? "");
      const replacement = isAddressToken(k)
        ? `${ADDRESS_OPEN}${formatPrintAddressForEscPos(value)}${ADDRESS_CLOSE}`
        : value;
      out = out.split(k).join(replacement);
    }
  }
  return out;
};

const ITEM_TOKENS = [
  "[ITENS]",
  "[ITEM]",
  "[PRODUTO]",
  "[PRODUTOS]",
  "[QNTITENS]",
  "[QUANTIDADEPROD]",
  "[VALORITEM]",
  "[PREÇOPROD]",
  "[OBSITEM]",
  "[ADICIONAIS]",
  "[CÓDIGOPROD]",
  "[CODIGOPROD]",
];

const lineHasItemToken = (line: string) => ITEM_TOKENS.some((t) => line.includes(t));

const expandItemsLines = (template: string, items: ItemForTemplate[]): string => {
  return template
    .split("\n")
    .flatMap((rawLine) => {
      if (!lineHasItemToken(rawLine)) return [rawLine];
      if (items.length === 0) return [];

      // Caso 1: linha é só [ITENS] → expande em formato padrão
      if (/^\s*\[(ITENS|ITEM)\]\s*$/i.test(rawLine)) {
        const out: string[] = [];
        for (const it of items) {
          const lineTotal =
            it.unitPrice * it.quantity +
            (it.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0);
          out.push(`__ITEM__${it.quantity}x ${it.productName}__SEP__${fmt(lineTotal)}`);
          for (const ad of it.addons || []) {
            const q = (ad.quantity || 1) > 1 ? ` x${ad.quantity}` : "";
            out.push(`  + ${ad.name}${q}`);
          }
          if (it.observations?.trim()) out.push(`  Obs: ${it.observations.trim()}`);
        }
        return out;
      }

      // Caso 2: template inline com tokens → expande para cada item
      return items.flatMap((it) => {
        const lineTotal =
          it.unitPrice * it.quantity +
          (it.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0);
        const addonsText = (it.addons || [])
          .map((a) => `+ ${a.name}${(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}`)
          .join(" | ");
        const itemVars = {
          "[ITENS]": "",
          "[PRODUTO]": it.productName,
          "[PRODUTOS]": it.productName,
          "[QNTITENS]": String(it.quantity),
          "[QUANTIDADEPROD]": String(it.quantity),
          "[VALORITEM]": fmt(lineTotal),
          "[PREÇOPROD]": fmt(it.unitPrice),
          "[OBSITEM]": [addonsText, it.observations?.trim() ? `Obs: ${it.observations.trim()}` : ""]
            .filter(Boolean)
            .join(" "),
          "[ADICIONAIS]": addonsText,
          "[CÓDIGOPROD]": "",
          "[CODIGOPROD]": "",
        };
        return [replaceTokens(rawLine, itemVars)];
      });
    })
    .join("\n");
};

// =============================================================================
// Parser de tags inline → ESC/POS
// =============================================================================

interface LineStyle {
  align: Align;
  bold: boolean;
  big: boolean; // [GRANDE]/[DESTAQUE]
  giant: boolean; // [TXTGIGANTE]
  medium: boolean; // [TXTMEDIO]
  small: boolean; // [TXTPEQUENO]
  box: boolean; // [CAIXA]
  underline: 0 | 1 | 2;
  invert: boolean; // [FUNDPRETO]/[TXTBORDATXT] = fundo preto só ao redor
  invertFull: boolean; // [TZTBORDA]/[TXTBORDA] = fundo preto ponta-a-ponta
  frame: "none" | "thin" | "strong" | "rect";
  address: boolean;
}

const DEFAULT_STYLE: LineStyle = {
  align: "left",
  bold: false,
  big: false,
  giant: false,
  medium: false,
  small: false,
  box: false,
  underline: 0,
  invert: false,
  invertFull: false,
  frame: "none",
  address: false,
};

const ALL_TAGS_RE =
  /\[\/?(?:CENTRO|NEGRITO|GRANDE|TXTGIGANTE|TXTMEDIO|TXTPEQUENO|CAIXA|TZTBORDA|TXTBORDA|BORDA|TXTBORDATXT|FUNDPRETO|DESTAQUE|QUADRADONEGRITO|QUADRADO|RETANGULO)\]/gi;

const parseLineStyle = (rawLine: string): { style: LineStyle; text: string } => {
  const style: LineStyle = { ...DEFAULT_STYLE };
  if (rawLine.includes(ADDRESS_OPEN)) style.address = true;

  if (/\[CENTRO\]/i.test(rawLine)) style.align = "center";
  if (/\[NEGRITO\]|\[DESTAQUE\]|\[QUADRADONEGRITO\]/i.test(rawLine)) style.bold = true;
  if (/\[TXTGIGANTE\]/i.test(rawLine)) style.giant = true;
  if (/\[GRANDE\]|\[DESTAQUE\]/i.test(rawLine) && !style.giant) style.big = true;
  if (/\[TXTMEDIO\]|\[NEGRITO\]/i.test(rawLine) && !style.big && !style.giant) style.medium = true;
  if (/\[TXTPEQUENO\]/i.test(rawLine)) style.small = true;
  if (/\[CAIXA\]/i.test(rawLine)) {
    style.box = true;
    style.bold = true;
  }
  if (/\[BORDA\]/i.test(rawLine)) style.frame = "thin";
  if (/\[QUADRADO\]/i.test(rawLine)) style.frame = "thin";
  if (/\[RETANGULO\]/i.test(rawLine)) style.frame = "rect";
  // Fundo preto, texto branco — diferenciamos os dois modos:
  // [TZTBORDA]/[TXTBORDA] = ponta a ponta (preenche a linha inteira invertida)
  // [TXTBORDATXT]/[FUNDPRETO] = só ao redor das letras
  if (/\[TZTBORDA\]|\[TXTBORDA\]/i.test(rawLine)) style.invertFull = true;
  if (/\[TXTBORDATXT\]|\[FUNDPRETO\]/i.test(rawLine)) style.invert = true;
  if (/\[QUADRADONEGRITO\]/i.test(rawLine)) {
    // Inline com conteúdo na mesma linha: faixa preta sólida ponta-a-ponta
    // (equivalente a [TZTBORDA]). Quando aparece sozinho em uma linha,
    // o renderer principal trata como banner separador antes de chegar aqui.
    style.invertFull = true;
    style.bold = true;
  }

  const text = rawLine.replace(ALL_TAGS_RE, "").split(ADDRESS_OPEN).join("").split(ADDRESS_CLOSE).join("");
  return { style, text };
};

const applyStyleToBuilder = (b: EscPosBuilder, style: LineStyle) => {
  b.align(style.align);
  b.font(style.small ? "B" : "A");
  b.bold(style.bold);
  if (style.giant) b.size(2, 2);
  else if (style.big) b.size(1, 1);
  else if (style.medium) b.size(1, 1);
  else b.size(0, 0);
  b.underline(style.underline);
  b.invert(style.invert || style.invertFull);
};

const resetStyle = (b: EscPosBuilder) => {
  b.align("left").font("A").bold(false).size(0, 0).underline(0).invert(false);
};

const frameChar = (frame: LineStyle["frame"]) => (frame === "strong" ? "=" : "-");

const frameBorder = (frame: LineStyle["frame"], cols: number) => {
  const ch = frameChar(frame);
  return `+${ch.repeat(Math.max(0, cols - 2))}+`;
};

const boxedLine = (text: string, cols: number, align: Align = "left") => {
  const inner = Math.max(1, cols - 4);
  if (text.length >= inner) return `| ${text} |`;
  const remaining = inner - text.length;
  const left = align === "center" ? Math.floor(remaining / 2) : align === "right" ? remaining : 0;
  const right = remaining - left;
  return `| ${" ".repeat(left)}${text}${" ".repeat(right)} |`;
};

const paddedFullLine = (text: string, cols: number, align: Align = "left") => {
  const value = text.trim();
  if (value.length >= cols) return value;
  const remaining = cols - value.length;
  const left = align === "center" ? Math.floor(remaining / 2) : align === "right" ? remaining : 0;
  const right = remaining - left;
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
};

const effectiveColumns = (cols: number, style: LineStyle) => {
  if (style.giant) return Math.max(8, Math.floor(cols / 3));
  if (style.big || style.medium) return Math.max(8, Math.floor(cols / 2));
  if (style.small) return Math.max(cols, Math.floor(cols * 1.25));
  return cols;
};

const fitStyleToSingleLine = (style: LineStyle, lines: string[], cols: number): LineStyle => {
  if (style.address) return style;
  const maxLength = Math.max(...lines.map((line) => line.trim().length));
  if (maxLength <= effectiveColumns(cols, style)) return style;

  // Degraus do maior → menor. Escolhe o MAIOR que ainda caiba (mínima redução possível,
  // texto encostando borda a borda).
  const ladder: LineStyle[] = [
    { ...style, giant: true, big: false, medium: false, small: false },
    { ...style, giant: false, big: true, medium: false, small: false },
    { ...style, giant: false, big: false, medium: true, small: false },
    { ...style, giant: false, big: false, medium: false, small: false },
    { ...style, giant: false, big: false, medium: false, small: true },
  ];

  // Considera apenas degraus que NÃO sejam maiores que o estilo atual (nunca aumenta a fonte).
  const currentCols = effectiveColumns(cols, style);
  for (const candidate of ladder) {
    const candCols = effectiveColumns(cols, candidate);
    if (candCols < currentCols) continue;
    if (maxLength <= candCols) return candidate;
  }

  return { ...style, giant: false, big: false, medium: false, small: true };
};

const wrapAddressLines = (text: string, cols: number) => {
  const width = Math.max(1, cols);
  const words = text.trim().match(/\S+/g) || [];
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }

    if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
    } else {
      lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [text];
};

const renderStyledText = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  const finalText = text;
  if (!finalText.replace(/\s/g, "")) return;
  const outputLines = style.address ? wrapAddressLines(finalText, effectiveColumns(cols, style)) : [finalText];
  const fittedStyle = fitStyleToSingleLine(style, outputLines, cols);

  // Fundo preto em uma única faixa sólida ponta-a-ponta, sem linhas
  // transparentes cortando a caixa, mantendo o tamanho configurado.
  if (fittedStyle.invertFull || fittedStyle.invert) {
    const effectiveCols = effectiveColumns(cols, fittedStyle);
    applyStyleToBuilder(b, { ...fittedStyle, invert: true, invertFull: true, frame: "none", box: false });
    for (const line of outputLines) {
      const trimmedTxt = line.trim();
      let padded: string;
      if (trimmedTxt.length >= effectiveCols) {
        padded = trimmedTxt;
      } else {
        const total = effectiveCols - trimmedTxt.length;
        const left = Math.floor(total / 2);
        padded = " ".repeat(left) + trimmedTxt + " ".repeat(total - left);
      }
      b.rawText(padded);
    }
    resetStyle(b);
    return;
  }

  if (fittedStyle.box || fittedStyle.frame !== "none") {
    resetStyle(b);
    applyStyleToBuilder(b, { ...fittedStyle, frame: "none", box: false, invert: true, invertFull: true });
    for (const line of outputLines)
      b.rawText(paddedFullLine(line, effectiveColumns(cols, fittedStyle), fittedStyle.align));
    resetStyle(b);
    return;
  }

  applyStyleToBuilder(b, fittedStyle);
  // Regra do usuário: NUNCA quebrar texto/número para a linha de baixo.
  // Exceção do endereço: quebra somente em espaços para a impressora não cortar palavras.
  for (const line of outputLines) b.rawText(line);
  resetStyle(b);
};

const getBlockFrameTag = (trimmedLine: string): { kind: "open" | "close"; frame: LineStyle["frame"] } | null => {
  if (/^\[QUADRADONEGRITO\]$/i.test(trimmedLine)) return { kind: "open", frame: "strong" };
  if (/^\[\/QUADRADONEGRITO\]$/i.test(trimmedLine)) return { kind: "close", frame: "strong" };
  if (/^\[QUADRADO\]$/i.test(trimmedLine)) return { kind: "open", frame: "thin" };
  if (/^\[\/QUADRADO\]$/i.test(trimmedLine)) return { kind: "close", frame: "thin" };
  if (/^\[RETANGULO\]$/i.test(trimmedLine)) return { kind: "open", frame: "rect" };
  if (/^\[\/RETANGULO\]$/i.test(trimmedLine)) return { kind: "close", frame: "rect" };
  return null;
};

const renderBlockContentLine = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  // Dentro de um bloco (QUADRADO/QUADRADONEGRITO/RETANGULO) NÃO desenhamos bordas
  // com caracteres "| ... |" / "+---+". O bloco é apenas um agrupamento visual:
  // imprimimos o conteúdo normalmente respeitando o estilo configurado.
  if (!text.replace(/\s/g, "")) {
    b.newline();
    return;
  }
  const fittedStyle = fitStyleToSingleLine(style, [text], cols);
  applyStyleToBuilder(b, { ...fittedStyle, frame: "none", box: false });
  const lines = fittedStyle.address ? wrapAddressLines(text, effectiveColumns(cols, fittedStyle)) : [text];
  for (const line of lines) {
    if (fittedStyle.align === "center") {
      const eff = effectiveColumns(cols, fittedStyle);
      const trimmed = line.trim();
      if (trimmed.length < eff) {
        const total = eff - trimmed.length;
        const left = Math.floor(total / 2);
        b.rawText(" ".repeat(left) + trimmed + " ".repeat(total - left));
      } else {
        b.rawText(trimmed);
      }
    } else {
      b.rawText(line);
    }
  }
  resetStyle(b);
};

// =============================================================================
// Renderização
// =============================================================================

export const renderTemplateToEscPos = (
  input: RenderTemplateInput,
  opts: Partial<EscPosBuilderOptions> = {},
): Uint8Array => {
  const b = new EscPosBuilder(opts);
  const cols = opts.columns ?? 48;

  // 1. Substitui variáveis globais e limpa qualquer HTML vindo do template/variáveis.
  let resolved = normalizeHtmlForEscPos(replaceTokens(input.template, input.variables));

  // 2. Expande [ITENS]
  if (input.items && input.items.length > 0) {
    resolved = expandItemsLines(resolved, input.items);
  }

  resolved = normalizeHtmlForEscPos(resolved);

  // 3. Limpeza pós-substituição:
  //   - Remove linhas que ficaram vazias por causa de variáveis sem valor
  //     (ex: [OBS], [CUPOM], [NOMEENTREGADOR] vazios), MAS preserva linhas
  //     em branco intencionais que existiam no template original.
  //   - Colapsa separadores '---' duplicados/consecutivos para um único.
  const originalLines = input.template.split("\n");
  const resolvedLines = resolved.split("\n");
  const cleaned: string[] = [];
  for (let i = 0; i < resolvedLines.length; i += 1) {
    const cur = resolvedLines[i];
    const trimmedCur = cur.trim();
    const original = (originalLines[i] ?? "").trim();
    // Se a linha original tinha conteúdo (ex: variável) e agora ficou vazia,
    // pulamos — evita "---\n\n---" virando 3 separadores grudados.
    if (!trimmedCur && original && !/^\s*$/.test(original)) continue;
    cleaned.push(cur);
  }
  // Colapsa separadores consecutivos
  const finalLines: string[] = [];
  for (const ln of cleaned) {
    const t = ln.trim();
    const prev = finalLines.length > 0 ? finalLines[finalLines.length - 1].trim() : null;
    if (t === "---" && prev === "---") continue;
    finalLines.push(ln);
  }
  resolved = finalLines.join("\n");

  // 4. Renderiza linha a linha
  const lines = resolved.split("\n");
  let activeBlockFrame: LineStyle["frame"] = "none";

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    const blockTag = getBlockFrameTag(trimmed);
    if (blockTag) {
      resetStyle(b);
      // [QUADRADONEGRITO] isolado em uma linha = faixa preta sólida ponta-a-ponta
      // (comportamento legado: serve como separador visual grosso/banner).
      // [QUADRADO]/[RETANGULO] continuam apenas como marcadores de agrupamento.
      if (blockTag.frame === "strong") {
        applyStyleToBuilder(b, { ...DEFAULT_STYLE, invert: true, invertFull: true, bold: true });
        b.rawText(" ".repeat(cols));
        resetStyle(b);
      }
      activeBlockFrame = blockTag.kind === "open" ? blockTag.frame : "none";
      continue;
    }

    // Linha vazia
    if (!trimmed) {
      if (activeBlockFrame !== "none") renderBlockContentLine(b, DEFAULT_STYLE, "", cols);
      else b.newline();
      continue;
    }

    // Separador
    if (trimmed === "---") {
      resetStyle(b);
      if (activeBlockFrame !== "none")
        renderBlockContentLine(b, DEFAULT_STYLE, "-".repeat(Math.max(1, cols - 4)), cols);
      else b.line("-".repeat(cols));
      continue;
    }

    // Item/linha de relatório com label/preço (gerado por expandItemsLines ou HTML report-row)
    if (trimmed.startsWith("__ITEM__")) {
      const [, rest] = trimmed.split("__ITEM__");
      const [left, right] = rest.split("__SEP__");
      resetStyle(b);
      b.bold(true)
        .twoCols(normalizeHtmlForEscPos(left || ""), normalizeHtmlForEscPos(right || ""))
        .bold(false);
      continue;
    }

    const { style, text } = parseLineStyle(rawLine);
    if (activeBlockFrame !== "none" && style.frame === "none" && !style.box && !style.invertFull) {
      renderBlockContentLine(b, style, text, cols);
    } else {
      renderStyledText(b, style, text, cols);
    }
  }

  // Feed + corte exato
  b.feed().cut();

  return b.build();
};
