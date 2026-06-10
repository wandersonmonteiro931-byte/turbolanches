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
  productCode?: string | number | null;
  highlightQuantity?: boolean;
  highlightComplements?: boolean;
  highlightObservations?: boolean;
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

const normalizeItemMarker = (value: string) =>
  String(value || "")
    .replace(/\b_+item_(\d+)\b/gi, "$1 - ")
    .replace(/\bitem_(\d+)\b/gi, "$1 - ")
    .replace(/_{2,}/g, "_");

const normalizeReceiptFormattingTagsFinal = (value: string) =>
  String(value || "")
    .replace(/\[CENTRO\]([^\n]*?)\[CENTRO\]/gi, "[CENTRO]$1[/CENTRO]")
    .replace(/\[DIREITA\]([^\n]*?)\[DIREITA\]/gi, "[DIREITA]$1[/DIREITA]")
    .replace(/\[TXTMEDIO\]([^\n]*?)\[TXTMEDIO\]/gi, "[TXTMEDIO]$1[/TXTMEDIO]")
    .replace(/\[TXTPEQUENO\]([^\n]*?)\[TXTPEQUENO\]/gi, "[TXTPEQUENO]$1[/TXTPEQUENO]")
    .replace(/\[TXTGIGANTE\]([^\n]*?)\[TXTGIGANTE\]/gi, "[TXTGIGANTE]$1[/TXTGIGANTE]")
    .replace(/\[GRANDE\]([^\n]*?)\[GRANDE\]/gi, "[GRANDE]$1[/GRANDE]")
    .replace(/\[NEGRITO\]([^\n]*?)\[NEGRITO\]/gi, "[NEGRITO]$1[/NEGRITO]")
    .replace(/\[TZTBORDA\]([^\n]*?)\[TZTBORDA\]/gi, "[TZTBORDA]$1[/TZTBORDA]")
    .replace(/\[TXTBORDA\]([^\n]*?)\[TXTBORDA\]/gi, "[TXTBORDA]$1[/TXTBORDA]")
    .replace(/\[TXTBORDATXT\]([^\n]*?)\[TXTBORDATXT\]/gi, "[TXTBORDATXT]$1[/TXTBORDATXT]")
    .replace(/\[FUNDPRETO\]([^\n]*?)\[FUNDPRETO\]/gi, "[FUNDPRETO]$1[/FUNDPRETO]")
    .replace(/\[DESTAQUE\]([^\n]*?)\[DESTAQUE\]/gi, "[DESTAQUE]$1[/DESTAQUE]")
    .replace(/\[BORDA\]([^\n]*?)\[BORDA\]/gi, "[BORDA]$1[/BORDA]")
    .replace(/\[CAIXA\]([^\n]*?)\[CAIXA\]/gi, "[CAIXA]$1[/CAIXA]")
    // Erro comum: [TXTMEDIO][TZTBORDA][ENDEREÇO][/TZTBORDA][/TXTMEDIO]
    // deve manter as duas formatações ao mesmo tempo.
    .replace(/\[CENTRO\](\[(?:ENDEREÇO|ENDERECO)\])\[\/TXTMEDIO\]/gi, "[CENTRO]$1[/CENTRO]");

const normalizeHtmlForEscPos = (value: string) => {
  let out = normalizeReceiptFormattingTagsFinal(String(value || ""));

  out = out.replace(
    /<div[^>]*class=["'][^"']*report-row[^"']*["'][^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/div>/gi,
    (_, left, right) =>
      `\n@@ITEM@@${decodeHtmlEntities(String(left).replace(/<[^>]*>/g, "")).trim()}@@SEP@@${decodeHtmlEntities(String(right).replace(/<[^>]*>/g, "")).trim()}\n`,
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
  out = normalizeItemMarker(removeEmojisAndControls(out));

  return normalizeItemMarker(out)
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{4,}/g, "\n\n");
};

const isAddressToken = (token: string) => /^\[(ENDEREÇO|ENDERECO)\]$/i.test(token);
const formatAddressValue = (value: string) => value.toLocaleUpperCase("pt-BR");
const formatPrintAddressForEscPos = (value: string) => normalizeHtmlForEscPos(value).toLocaleUpperCase("pt-BR");

const ALL_KNOWN_VARIABLES = [
  "[NUMEROPEDIDO]",
  "[MESA]",
  "[NOMECLIENTE]",
  "[CODIGOCLIENTE]",
  "[TELEFONECLIENTE]",
  "[ENDEREÇO]",
  "[ENDERECO]",
  "[FORMAPAGTO]",
  "[TOTALRECEBER]",
  "[TOTALPAGO]",
  "[SUBTOTAL]",
  "[TOTAL]",
  "[TAXAENTREGA]",
  "[DESCONTO]",
  "[CUPOM]",
  "[TROCO]",
  "[NOMELOJA]",
  "[TIPOCOMANDA]",
  "[DATAHORA]",
  "[DATAAGORA]",
  "[DATAHORAPEDIDO]",
  "[DATAHORAENTREGA]",
  "[DATAHORASAÍDAENTREGA]",
  "[DATAHORASAIDAENTREGA]",
  "[HORASAIDA]",
  "[OBS]",
  "[ITENS]",
  "[ITEM]",
  "[VALORITEM]",
  "[QNTITENS]",
  "[PRODUTOS]",
  "[PREÇOPROD]",
  "[PRECOPROD]",
  "[QUANTIDADEPROD]",
  "[OBSITEM]",
  "[ADICIONAIS]",
  "[CÓDIGOPROD]",
  "[CODIGOPROD]",
  "[DELIVERYRETIRADAVIAGEM]",
  "[RODAPÉ]",
  "[RODAPE]",
  "[DIVULGAÇÃO]",
  "[DIVULGACAO]",
  "[PRODUTO]",
  "[MARCA]",
  "[DATAFABRICACAO]",
  "[VALIDADE]",
  "[RESPONSAVEL]",
  "[TITULO]",
  "[TOTALITENS]",
  "[LISTA]",
  "[RESFRIADO]",
  "[CONGELADO]",
  "[ARMAZENAR]",
  "[GRAUS]",
  "[FRASEARMAZ]",
  "[NOMEENTREGADOR]",
];

const completeVariables = (vars: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const key of ALL_KNOWN_VARIABLES) out[key] = "";
  for (const [key, value] of Object.entries(vars || {}))
    out[key] = normalizeItemMarker(normalizeHtmlForEscPos(value ?? ""));
  return out;
};

const parseMoneyToNumber = (value: string) => {
  const raw = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".")
    .trim();

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
};

const hasPositiveMoneyValue = (value: string) => parseMoneyToNumber(value) > 0;

const removeZeroTrocoLines = (template: string, variables: Record<string, string>) => {
  const troco = variables["[TROCO]"] ?? "";
  if (hasPositiveMoneyValue(troco)) return template;

  // Remove a linha inteira onde existir [TROCO], mesmo que esteja dentro de tags:
  // [TXTMEDIO][TZTBORDA]TROCO: [TROCO][/TZTBORDA][/TXTMEDIO]
  return String(template || "")
    .split("\n")
    .filter((line) => !/\[TROCO\]/i.test(line))
    .join("\n");
};

const replaceTokens = (text: string, vars: Record<string, string>, preserveEmptyItemTokens = true): string => {
  let out = text;
  const mergedVars = completeVariables(vars);

  for (let pass = 0; pass < 3; pass += 1) {
    for (const [k, v] of Object.entries(mergedVars)) {
      const value = normalizeHtmlForEscPos(v ?? "");

      // Importante:
      // No primeiro passo global, NÃO podemos apagar [ITENS]/[ITEM]/[PRODUTO] etc.
      // Se apagar aqui, os produtos somem da comanda antes da expansão.
      if (preserveEmptyItemTokens && ITEM_TOKENS.includes(k) && !value) {
        continue;
      }

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
  "[PRECOPROD]",
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

      if (/^\s*\[(ITENS|ITEM)\]\s*$/i.test(rawLine)) {
        const out: string[] = [];

        for (const it of items) {
          const addonsTotal = (it.addons || []).reduce(
            (s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1),
            0,
          );
          const lineTotal = it.unitPrice * it.quantity + addonsTotal;

          if (it.highlightQuantity) {
            out.push(`@@ITEMQ@@${it.quantity}x@@SEP@@${it.productName}@@SEP@@${fmt(lineTotal)}`);
          } else {
            out.push(`@@ITEM@@${it.quantity}x ${it.productName}@@SEP@@${fmt(lineTotal)}`);
          }

          for (const ad of it.addons || []) {
            const q = (ad.quantity || 1) > 1 ? ` x${ad.quantity}` : "";
            const price = Number(ad.price || 0) > 0 ? ` ${fmt(Number(ad.price || 0) * Number(ad.quantity || 1))}` : "";
            const line = `+ ${ad.name}${q}${price}`;
            out.push(it.highlightComplements ? `@@BLACK@@${line}` : `  ${line}`);
          }

          if (it.observations?.trim()) {
            const obs = `OBS: ${it.observations.trim()}`;
            out.push(it.highlightObservations ? `@@BLACK@@${obs}` : `  ${obs}`);
          }
        }

        return out;
      }

      return items.flatMap((it) => {
        const addonsTotal = (it.addons || []).reduce(
          (s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1),
          0,
        );
        const lineTotal = it.unitPrice * it.quantity + addonsTotal;
        const addonsText = (it.addons || [])
          .map((a) => {
            const q = (a.quantity || 1) > 1 ? ` x${a.quantity}` : "";
            const price = Number(a.price || 0) > 0 ? ` ${fmt(Number(a.price || 0) * Number(a.quantity || 1))}` : "";
            return `+ ${a.name}${q}${price}`;
          })
          .join(" | ");
        const code = it.productCode == null ? "" : String(it.productCode);

        const itemVars = completeVariables({
          "[ITENS]": "",
          "[ITEM]": "",
          "[PRODUTO]": it.productName,
          "[PRODUTOS]": it.productName,
          "[QNTITENS]": String(it.quantity),
          "[QUANTIDADEPROD]": String(it.quantity),
          "[VALORITEM]": fmt(lineTotal),
          "[PREÇOPROD]": fmt(it.unitPrice),
          "[PRECOPROD]": fmt(it.unitPrice),
          "[OBSITEM]": [addonsText, it.observations?.trim() ? `OBS: ${it.observations.trim()}` : ""]
            .filter(Boolean)
            .join(" "),
          "[ADICIONAIS]": addonsText,
          "[CÓDIGOPROD]": code,
          "[CODIGOPROD]": code,
        });

        return [replaceTokens(rawLine, itemVars, false)];
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
  /\[\/?(?:CENTRO|DIREITA|NEGRITO|GRANDE|TXTGIGANTE|TXTMEDIO|TXTPEQUENO|CAIXA|TZTBORDA|TXTBORDA|TXTBORDATXT|FUNDPRETO|DESTAQUE|BORDA|QUADRADONEGRITO|QUADRADO|RETANGULO)\]/gi;

const parseLineStyle = (rawLine: string): { style: LineStyle; text: string } => {
  const style: LineStyle = { ...DEFAULT_STYLE };
  if (rawLine.includes(ADDRESS_OPEN)) style.address = true;

  const line = normalizeReceiptFormattingTagsFinal(rawLine || "");

  // Alinhamento
  if (/\[CENTRO\]/i.test(line)) style.align = "center";
  if (/\[DIREITA\]/i.test(line)) style.align = "right";

  // Tamanhos reais. Não reduzir automaticamente depois.
  if (/\[TXTPEQUENO\]/i.test(line)) style.small = true;
  if (/\[TXTMEDIO\]/i.test(line)) style.medium = true;
  if (/\[NEGRITO\]/i.test(line)) {
    style.bold = true;
    style.medium = true;
  }
  if (/\[GRANDE\]/i.test(line)) {
    style.bold = true;
    style.big = true;
    style.medium = false;
    style.small = false;
  }
  if (/\[TXTGIGANTE\]/i.test(line)) {
    style.bold = true;
    style.giant = true;
    style.big = false;
    style.medium = false;
    style.small = false;
  }
  if (/\[DESTAQUE\]/i.test(line)) {
    style.bold = true;
    style.big = true;
    style.medium = false;
    style.small = false;
    style.invertFull = true;
  }

  // Caixa/moldura
  if (/\[CAIXA\]/i.test(line)) {
    style.box = true;
    style.bold = true;
  }
  if (/\[BORDA\]/i.test(line)) style.frame = "thin";
  if (/\[QUADRADO\]/i.test(line)) style.frame = "thin";
  if (/\[QUADRADONEGRITO\]/i.test(line)) {
    style.frame = "strong";
    style.bold = true;
  }
  if (/\[RETANGULO\]/i.test(line)) style.frame = "rect";

  // Fundo preto
  if (/\[TZTBORDA\]|\[TXTBORDA\]/i.test(line)) {
    style.invertFull = true;
    style.bold = true;
  }
  if (/\[TXTBORDATXT\]|\[FUNDPRETO\]/i.test(line)) {
    style.invert = true;
    style.invertFull = false;
    style.bold = true;
  }

  const text = line.replace(ALL_TAGS_RE, "").split(ADDRESS_OPEN).join("").split(ADDRESS_CLOSE).join("");
  return { style, text };
};

const applyStyleToBuilder = (b: EscPosBuilder, style: LineStyle) => {
  // QZ/JP80H: alinhamento físico da impressora fica torto.
  // Mantemos a impressora em LEFT e centralizamos/direitamos com espaços calculados.
  b.align("left");
  b.font(style.small ? "B" : "A");
  b.bold(style.bold);
  if (style.giant) b.size(2, 2);
  else if (style.big) b.size(1, 1);
  // [TXTMEDIO] não pode ficar gigante/ilegível na térmica.
  // Usa altura maior, largura normal: destaca sem estourar a linha.
  else if (style.medium) b.size(0, 1);
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

const truncateLineToCols = (value: string, cols: number) => String(value || "").slice(0, Math.max(0, cols));

const fixedLine = (value: string, cols: number, align: Align = "left") => {
  const text = truncateLineToCols(normalizeItemMarker(String(value || "").trim()), cols);
  if (text.length >= cols) return text;
  const missing = cols - text.length;
  if (align === "right") return `${" ".repeat(missing)}${text}`;
  if (align === "center") {
    const left = Math.floor(missing / 2);
    return `${" ".repeat(left)}${text}${" ".repeat(missing - left)}`;
  }
  return `${text}${" ".repeat(missing)}`;
};

const boxedLineNoWrap = (text: string, cols: number, align: Align = "left") => {
  const inner = Math.max(1, cols - 4);
  return `| ${fixedLine(text, inner, align)} |`;
};

const safeThermalBoxStyle = (style: LineStyle): LineStyle => ({
  ...DEFAULT_STYLE,
  align: style.align,
  bold: style.bold || style.big || style.giant || style.medium,
  small: style.small,
  medium: style.medium,
  big: style.big,
  giant: style.giant,
  invert: style.invert || style.invertFull,
  invertFull: style.invertFull,
  frame: "none",
  box: false,
});

const splitValueAtRight = (line: string): { left: string; right: string } | null => {
  const valuePattern = /(R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}|R\$\s*-?\d+,\d{2}|-?\d+,\d{2})\s*$/i;
  const match = String(line || "").match(valuePattern);
  if (!match) return null;

  const right = match[0].trim();
  const left = String(line || "")
    .slice(0, match.index)
    .trim();
  if (!left || !right) return null;

  return { left, right };
};

const removeInternalPrintMarkers = (value: string) =>
  String(value || "")
    .replace(/@@ITEMQ@@/g, "")
    .replace(/@@ITEM@@/g, "")
    .replace(/@@ITEM3@@/g, "")
    .replace(/@@BLACK@@/g, "")
    .replace(/@@SEP@@/g, " ");

const renderFixedMoneyLine = (b: EscPosBuilder, line: string, cols: number) => {
  const pair = splitValueAtRight(removeInternalPrintMarkers(line));
  if (!pair) return false;
  b.twoCols(pair.left, pair.right);
  return true;
};

const paddedFullLine = (text: string, cols: number, align: Align = "left") => {
  const value = normalizeItemMarker(String(text || "").trim());
  const width = Math.max(1, cols);
  if (value.length >= width) return value.slice(0, width);
  const remaining = width - value.length;
  const left = align === "center" ? Math.floor(remaining / 2) : align === "right" ? remaining : 0;
  const right = remaining - left;
  return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
};

const effectiveColumns = (cols: number, style: LineStyle) => {
  if (style.giant) return Math.max(8, Math.floor(cols / 3));
  if (style.big) return Math.max(8, Math.floor(cols / 2));
  // [TXTMEDIO] agora só aumenta a altura, então mantém a largura completa.
  if (style.medium) return cols;
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

const renderFrameLine = (b: EscPosBuilder, frame: LineStyle["frame"], cols: number) => {
  const ch = frame === "strong" ? "=" : "-";
  b.rawText(`+${ch.repeat(Math.max(0, cols - 2))}+`);
};

const renderTextInsideFrame = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  const safeStyle = safeThermalBoxStyle(style);

  // Somente endereço pode quebrar dentro da caixa.
  if (style.address) {
    renderBoxedWrappedAddress(b, safeStyle, text, cols);
    return;
  }

  applyStyleToBuilder(b, safeStyle);
  b.rawText(boxedLineNoWrap(text, cols, safeStyle.align));
  resetStyle(b);
};

const wrapAddressFullLines = (value: string, cols: number) => {
  const max = Math.max(8, cols);
  const words = normalizeHtmlForEscPos(value).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;

    if (test.length <= max) {
      current = test;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    // Se uma palavra isolada for maior que a largura, aí sim corta em pedaços,
    // para não estourar a impressora.
    for (let i = 0; i < word.length; i += max) {
      lines.push(word.slice(i, i + max));
    }
    current = "";
  }

  if (current) lines.push(current);

  return lines.length ? lines : [normalizeHtmlForEscPos(value)];
};

const normalizeAddressUppercase = (value: string) =>
  normalizeHtmlForEscPos(value).replace(/\s+/g, " ").trim().toLocaleUpperCase("pt-BR");

const isItemQuantityLikeLine = (value: string) => splitItemQuantityLine(value) !== null;

const splitItemQuantityLine = (value: string): { qty: string; rest: string } | null => {
  const match = String(value || "")
    .trim()
    .match(/^(\d+\s*[xX])\s*[;:,.\\-]?\s*(.*)$/);
  if (!match) return null;
  return {
    qty: match[1].replace(/\s+/g, "").toLowerCase(),
    rest: match[2] || "",
  };
};

const renderBlackItemQuantityLine = (b: EscPosBuilder, line: string, cols: number) => {
  const parsed = splitItemQuantityLine(line);
  if (!parsed) return false;

  resetStyle(b);
  b.align("left").font("A").bold(true).invert(true);
  b.lineSpacing(0);

  // Quantidade maior e em negrito, mas sem ficar ilegível.
  // size(1, 0) = mais largo, altura normal. Fica mais destacado que o nome do item.
  const qtyBoxNormalCols = 5;
  b.size(1, 0);
  b.text(fixedLine(parsed.qty, qtyBoxNormalCols, "center"));

  // Como a quantidade está em largura dupla, ela ocupa fisicamente mais espaço.
  // O nome fica normal, ainda com fundo preto, preenchendo o resto da linha.
  b.size(0, 0).bold(true).invert(true);
  const remainingCols = Math.max(1, cols - qtyBoxNormalCols * 2);
  b.text(fixedLine(parsed.rest, remainingCols, "left"));
  b.newline();

  b.defaultLineSpacing();
  resetStyle(b);
  return true;
};

const renderContinuousBlackBlock = (
  b: EscPosBuilder,
  style: LineStyle,
  text: string,
  cols: number,
  align: Align = "center",
  uppercase = false,
) => {
  const rawValue = uppercase
    ? normalizeAddressUppercase(text)
    : normalizeHtmlForEscPos(text).replace(/\s+/g, " ").trim();

  // Em itens do pedido, "1x", "2x", "3x" com fundo preto precisa ficar legível.
  // Então, se for linha de quantidade/item, removemos o médio/grande do bloco preto.
  const readableBlackStyle = isItemQuantityLikeLine(rawValue)
    ? { ...style, medium: false, big: false, giant: false, small: false, bold: true }
    : style;

  const styled = safeThermalBoxStyle({ ...readableBlackStyle, invert: true, invertFull: true });
  const innerCols = effectiveColumns(cols, styled);
  const value = rawValue;
  const lines = wrapAddressFullLines(value, innerCols);

  resetStyle(b);
  applyStyleToBuilder(b, styled);
  b.lineSpacing(0);

  for (const line of lines) {
    // Fundo preto contínuo: cada linha é preenchida até a largura efetiva.
    b.rawText(fixedLine(line, innerCols, align).slice(0, innerCols));
  }

  b.defaultLineSpacing();
  resetStyle(b);
};

const renderAddressBlackLines = (b: EscPosBuilder, text: string, cols: number, align: Align = "center") => {
  renderContinuousBlackBlock(
    b,
    { ...DEFAULT_STYLE, bold: true, medium: true, invertFull: true },
    text,
    cols,
    align,
    true,
  );
};

const renderBoxedWrappedAddress = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  // Endereço do pedido: igual TOTAL A RECEBER.
  // Caixa alta, quebra linha, fundo preto ponta-a-ponta e alinhamento uniforme.
  renderAddressBlackLines(b, text, cols, style.align || "center");
};

const normalizeDeliveryReportTextForEscPos = (value: string) =>
  normalizeHtmlForEscPos(value)
    .replace(/\s+\|\s+/g, " | ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const isSignatureLine = (value: string) =>
  /^_+\s*(?:ASSINATURA|ASSINATURA DO FUNCIONARIO|ASSINATURA DO FUNCIONÁRIO)?$/i.test(String(value || "").trim());

const renderStyledText = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  const rawFinalText = normalizeDeliveryReportTextForEscPos(normalizeItemMarker(removeInternalPrintMarkers(text)));
  const finalText = style.address ? normalizeAddressUppercase(rawFinalText) : rawFinalText;

  if (!finalText.replace(/\s/g, "")) {
    b.rawText("");
    return;
  }

  if (isSignatureLine(finalText)) {
    b.rawText(paddedFullLine(truncateLineToCols(finalText.trim(), cols), cols, style.align));
    resetStyle(b);
    return;
  }

  // Formatação real: não reduz tamanho automaticamente.
  const fittedStyle = style;
  const textCols = effectiveColumns(cols, fittedStyle);
  const outputLines = fittedStyle.address
    ? wrapAddressLines(finalText, textCols)
    : wrapAddressFullLines(finalText, textCols);

  if (fittedStyle.box || fittedStyle.frame !== "none") {
    if (fittedStyle.address) {
      renderAddressBlackLines(b, finalText, cols, fittedStyle.align || "center");
      return;
    }

    const frame = fittedStyle.frame !== "none" ? fittedStyle.frame : "strong";
    const safeStyle = safeThermalBoxStyle(fittedStyle);
    const boxedCols = effectiveColumns(cols, safeStyle);

    resetStyle(b);
    renderFrameLine(b, frame, cols);
    applyStyleToBuilder(b, safeStyle);

    for (const line of wrapAddressFullLines(finalText, Math.max(8, boxedCols - 4))) {
      b.rawText(boxedLineNoWrap(line, boxedCols, safeStyle.align));
    }

    resetStyle(b);
    renderFrameLine(b, frame, cols);
    return;
  }

  if (fittedStyle.invertFull) {
    renderContinuousBlackBlock(
      b,
      fittedStyle,
      finalText,
      cols,
      fittedStyle.align || "center",
      Boolean(fittedStyle.address),
    );
    return;
  }

  if (fittedStyle.invert) {
    const safeStyle = safeThermalBoxStyle({ ...fittedStyle, invert: true });
    const invCols = effectiveColumns(cols, safeStyle);
    applyStyleToBuilder(b, safeStyle);
    b.lineSpacing(0);

    for (const line of outputLines) {
      b.rawText(paddedFullLine(line, invCols, safeStyle.align));
    }

    b.defaultLineSpacing();
    resetStyle(b);
    return;
  }

  applyStyleToBuilder(b, fittedStyle);
  for (const line of outputLines) {
    b.rawText(paddedFullLine(line, textCols, fittedStyle.align));
  }
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
  const safeStyle = safeThermalBoxStyle(style);

  if (!text.replace(/\s/g, "")) {
    b.rawText(boxedLineNoWrap("", cols, safeStyle.align));
    return;
  }

  applyStyleToBuilder(b, safeStyle);
  b.rawText(boxedLineNoWrap(text, cols, safeStyle.align));
  resetStyle(b);
};

const renderBlackFullLine = (b: EscPosBuilder, text: string, cols: number, align: Align = "left") => {
  resetStyle(b);
  b.align("left").font("A").bold(true).size(0, 1).invert(true);
  b.rawText(fixedLine(normalizeHtmlForEscPos(text), cols, align));
  resetStyle(b);
};

const renderItemQuantityHighlighted = (
  b: EscPosBuilder,
  qtyText: string,
  productText: string,
  priceText: string,
  cols: number,
) => {
  resetStyle(b);

  const qty = normalizeHtmlForEscPos(qtyText);
  const product = normalizeHtmlForEscPos(productText);
  const price = normalizeHtmlForEscPos(priceText);
  const qtyWidth = Math.min(8, Math.max(4, qty.length + 2));
  const priceWidth = Math.min(12, Math.max(9, price.length));
  const gap = 1;
  const productWidth = Math.max(1, cols - Math.max(4, Math.min(5, qtyWidth)) * 2 - priceWidth - gap * 2);

  // Quantidade do item precisa ficar mais forte e um pouco maior que o nome.
  b.align("left").font("A").bold(true).size(1, 0).invert(true);
  b.text(fixedLine(qty, Math.max(4, Math.min(5, qtyWidth)), "center"));

  b.invert(false).size(0, 0).bold(true);
  b.text(" ".repeat(gap));
  b.text(truncateLineToCols(product, productWidth).padEnd(productWidth));
  b.text(" ".repeat(gap));
  b.text(fixedLine(price, priceWidth, "right"));
  b.newline();

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
  // TROCO só imprime quando for maior que 0,00. Se for R$ 0,00/vazio, remove a linha toda antes de substituir.
  const completedVariables = completeVariables(input.variables);
  const templateWithoutZeroTroco = removeZeroTrocoLines(input.template, completedVariables);
  let resolved = normalizeHtmlForEscPos(replaceTokens(templateWithoutZeroTroco, completedVariables, true));

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
  const originalLines = templateWithoutZeroTroco.split("\n");
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
      renderFrameLine(b, blockTag.frame, cols);
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

    // Item com quantidade destacada automaticamente.
    if (trimmed.startsWith("@@ITEMQ@@")) {
      const [, rest] = trimmed.split("@@ITEMQ@@");
      const [qty, product, price] = rest.split("@@SEP@@");
      renderItemQuantityHighlighted(b, qty || "", product || "", price || "", cols);
      continue;
    }

    // Linha preta automática para complementos/observações.
    if (trimmed.startsWith("@@BLACK@@")) {
      const [, text] = trimmed.split("@@BLACK@@");
      renderBlackFullLine(b, text || "", cols, "left");
      continue;
    }

    // Item/linha de relatório com label/preço.
    // Regra Turbo: não quebra; texto à esquerda pode ser cortado, valor fica reto.
    if (trimmed.startsWith("@@ITEM@@")) {
      const [, rest] = trimmed.split("@@ITEM@@");
      const [left, right] = rest.split("@@SEP@@");
      resetStyle(b);
      b.bold(true)
        .twoCols(normalizeItemMarker(normalizeHtmlForEscPos(left || "")), normalizeHtmlForEscPos(right || ""))
        .bold(false);
      continue;
    }

    // Qualquer linha comum terminando com valor fica alinhada em 2 colunas.
    // Ex.: "#00001 RUA X - Bairro R$ 10,00" corta o endereço se não couber,
    // mas o valor permanece reto no final da linha.
    if (renderFixedMoneyLine(b, trimmed, cols)) {
      continue;
    }

    // Tabela de itens em 3 colunas: qtd | produto/endereço | valor.
    // Regra Turbo: NUNCA quebra para outra linha; corta produto/endereço e mantém valor reto.
    if (trimmed.startsWith("@@ITEM3@@")) {
      const [, rest] = trimmed.split("@@ITEM3@@");
      const [qtyRaw, nameRaw, priceRaw] = rest.split("@@SEP@@");
      const qty = normalizeHtmlForEscPos(qtyRaw || "");
      const name = normalizeItemMarker(normalizeHtmlForEscPos(nameRaw || ""));
      const price = normalizeHtmlForEscPos(priceRaw || "");

      resetStyle(b);
      b.bold(true);

      const qtyWidth = Math.min(6, Math.max(4, qty.length + 1));
      const priceWidth = Math.min(12, Math.max(9, price.length));
      const gap = 1;
      const nameWidth = Math.max(1, cols - qtyWidth - priceWidth - gap * 2);

      const line =
        `${fixedLine(qty, qtyWidth, "left")}${" ".repeat(gap)}` +
        `${truncateLineToCols(name, nameWidth).padEnd(nameWidth)}${" ".repeat(gap)}` +
        `${fixedLine(price, priceWidth, "right")}`;

      b.rawText(line.slice(0, cols));
      b.bold(false);
      continue;
    }

    const { style, text } = parseLineStyle(rawLine);
    if (activeBlockFrame !== "none" && style.frame === "none" && !style.box && !style.invertFull) {
      renderBlockContentLine(b, { ...style, frame: activeBlockFrame }, text, cols);
    } else {
      renderStyledText(b, style, text, cols);
    }
  }

  // Feed + corte exato
  b.feed().cut();

  return b.build();
};
