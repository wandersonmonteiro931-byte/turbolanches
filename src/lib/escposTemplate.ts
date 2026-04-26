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

const replaceTokens = (text: string, vars: Record<string, string>): string => {
  let out = text;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(k).join(v ?? "");
  }
  return out;
};

const ITEM_TOKENS = ["[ITENS]", "[PRODUTO]", "[PRODUTOS]", "[QNTITENS]", "[QUANTIDADEPROD]", "[VALORITEM]", "[PREÇOPROD]", "[OBSITEM]", "[ADICIONAIS]"];

const lineHasItemToken = (line: string) => ITEM_TOKENS.some((t) => line.includes(t));

const expandItemsLines = (template: string, items: ItemForTemplate[]): string => {
  return template
    .split("\n")
    .flatMap((rawLine) => {
      if (!lineHasItemToken(rawLine)) return [rawLine];
      if (items.length === 0) return [];

      // Caso 1: linha é só [ITENS] → expande em formato padrão
      if (rawLine.trim() === "[ITENS]") {
        const out: string[] = [];
        for (const it of items) {
          const lineTotal = it.unitPrice * it.quantity
            + (it.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0);
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
        const lineTotal = it.unitPrice * it.quantity
          + (it.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0);
        const addonsText = (it.addons || []).map((a) => `+ ${a.name}${(a.quantity || 1) > 1 ? ` x${a.quantity}` : ""}`).join(" | ");
        const itemVars = {
          "[ITENS]": "",
          "[PRODUTO]": it.productName,
          "[PRODUTOS]": it.productName,
          "[QNTITENS]": String(it.quantity),
          "[QUANTIDADEPROD]": String(it.quantity),
          "[VALORITEM]": fmt(lineTotal),
          "[PREÇOPROD]": fmt(it.unitPrice),
          "[OBSITEM]": [addonsText, it.observations?.trim() ? `Obs: ${it.observations.trim()}` : ""].filter(Boolean).join(" "),
          "[ADICIONAIS]": addonsText,
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
  big: boolean;       // [GRANDE]/[TXTGIGANTE]
  medium: boolean;    // [TXTMEDIO]
  small: boolean;     // [TXTPEQUENO]
  upper: boolean;     // [CAIXA]
  underline: boolean; // [BORDA]/[QUADRADO]/[RETANGULO] = moldura → underline
  invert: boolean;    // [FUNDPRETO]/[TXTBORDATXT] = fundo preto só ao redor
  invertFull: boolean; // [TZTBORDA]/[TXTBORDA] = fundo preto ponta-a-ponta
  frameStrong: boolean; // [QUADRADONEGRITO]
}

const DEFAULT_STYLE: LineStyle = {
  align: "left",
  bold: false,
  big: false,
  medium: false,
  small: false,
  upper: false,
  underline: false,
  invert: false,
  invertFull: false,
  frameStrong: false,
};

const ALL_TAGS_RE = /\[\/?(?:CENTRO|NEGRITO|GRANDE|TXTGIGANTE|TXTMEDIO|TXTPEQUENO|CAIXA|TZTBORDA|TXTBORDA|BORDA|TXTBORDATXT|FUNDPRETO|DESTAQUE|QUADRADONEGRITO|QUADRADO|RETANGULO)\]/gi;

const parseLineStyle = (rawLine: string): { style: LineStyle; text: string } => {
  const style: LineStyle = { ...DEFAULT_STYLE };

  if (/\[CENTRO\]/i.test(rawLine)) style.align = "center";
  if (/\[NEGRITO\]|\[DESTAQUE\]|\[QUADRADONEGRITO\]/i.test(rawLine)) style.bold = true;
  if (/\[GRANDE\]|\[TXTGIGANTE\]/i.test(rawLine)) style.big = true;
  if (/\[TXTMEDIO\]/i.test(rawLine) && !style.big) style.medium = true;
  if (/\[TXTPEQUENO\]/i.test(rawLine)) style.small = true;
  if (/\[CAIXA\]/i.test(rawLine)) style.upper = true;
  // Moldura fina = underline (não há borda real em térmica)
  if (/\[BORDA\]|\[QUADRADO\]|\[RETANGULO\]/i.test(rawLine)) style.underline = true;
  // Fundo preto, texto branco — diferenciamos os dois modos:
  // [TZTBORDA]/[TXTBORDA] = ponta a ponta (preenche a linha inteira invertida)
  // [TXTBORDATXT]/[FUNDPRETO] = só ao redor das letras
  if (/\[TZTBORDA\]|\[TXTBORDA\]/i.test(rawLine)) style.invertFull = true;
  if (/\[TXTBORDATXT\]|\[FUNDPRETO\]/i.test(rawLine)) style.invert = true;
  if (/\[QUADRADONEGRITO\]/i.test(rawLine)) {
    style.frameStrong = true;
    style.bold = true;
  }

  const text = rawLine.replace(ALL_TAGS_RE, "");
  return { style, text };
};

const applyStyleToBuilder = (b: EscPosBuilder, style: LineStyle) => {
  b.align(style.align);
  b.bold(style.bold);
  if (style.big) b.size(1, 1);
  else if (style.medium) b.size(1, 0);
  else b.size(0, 0);
  // small não tem ESC/POS direto — fica no tamanho normal (térmicas raramente
  // suportam texto menor que o padrão sem mudar a fonte)
  b.underline(style.underline ? 1 : 0);
  b.invert(style.invert || style.invertFull);
};

const resetStyle = (b: EscPosBuilder) => {
  b.align("left").bold(false).size(0, 0).underline(0).invert(false);
};

// =============================================================================
// Renderização
// =============================================================================

export const renderTemplateToEscPos = (
  input: RenderTemplateInput,
  opts: Partial<EscPosBuilderOptions> = {},
): Uint8Array => {
  const b = new EscPosBuilder(opts);
  const cols = (opts.columns ?? 48);

  // 1. Substitui variáveis globais
  let resolved = replaceTokens(input.template, input.variables);

  // 2. Expande [ITENS]
  if (input.items && input.items.length > 0) {
    resolved = expandItemsLines(resolved, input.items);
  }

  // 3. Renderiza linha a linha
  const lines = resolved.split("\n");

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    // Linha vazia
    if (!trimmed) {
      b.newline();
      continue;
    }

    // Separador
    if (trimmed === "---") {
      resetStyle(b);
      b.line("-".repeat(cols));
      continue;
    }

    // Item com label/preço (gerado por expandItemsLines)
    if (trimmed.startsWith("__ITEM__")) {
      const [, rest] = trimmed.split("__ITEM__");
      const [left, right] = rest.split("__SEP__");
      resetStyle(b);
      b.bold(true).twoCols(left || "", right || "").bold(false);
      continue;
    }

    const { style, text } = parseLineStyle(rawLine);
    const finalText = style.upper ? text.toLocaleUpperCase("pt-BR") : text;

    if (!finalText.replace(/\s/g, "")) continue;

    // Largura efetiva: texto duplo ocupa 2x → metade das colunas.
    const effectiveCols = style.big || style.medium ? Math.floor(cols / 2) : cols;

    // [TZTBORDA]/[TXTBORDA] = barra preta ponta-a-ponta com texto branco.
    // Preenchemos com espaços invertidos para a barra atravessar todo o papel.
    if (style.invertFull) {
      const trimmedTxt = finalText.trim();
      const padded = trimmedTxt.length >= effectiveCols
        ? trimmedTxt.slice(0, effectiveCols)
        : (() => {
            const total = effectiveCols - trimmedTxt.length;
            const left = Math.floor(total / 2);
            const right = total - left;
            return " ".repeat(left) + trimmedTxt + " ".repeat(right);
          })();
      applyStyleToBuilder(b, style);
      b.rawText(padded);
      resetStyle(b);
      continue;
    }

    applyStyleToBuilder(b, style);
    if (finalText.length <= effectiveCols) {
      b.rawText(finalText);
    } else {
      b.wrap(finalText, effectiveCols);
    }
    resetStyle(b);
  }

  // Feed + corte exato
  b.feed().cut();

  return b.build();
};
