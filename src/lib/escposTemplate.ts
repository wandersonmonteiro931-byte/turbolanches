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
  upper: boolean;     // [CAIXA]
  underline: boolean; // [TZTBORDA]/[TXTBORDA]/[BORDA]
  invert: boolean;    // [FUNDPRETO]
  frameStrong: boolean; // [QUADRADONEGRITO] envolvendo a linha inteira
}

const DEFAULT_STYLE: LineStyle = {
  align: "left",
  bold: false,
  big: false,
  medium: false,
  upper: false,
  underline: false,
  invert: false,
  frameStrong: false,
};

const TAG_PAIRS: { open: RegExp; key: keyof LineStyle; closeRe?: RegExp }[] = [
  { open: /\[CENTRO\]/gi, key: "align" },
  { open: /\[NEGRITO\]/gi, key: "bold" },
  { open: /\[GRANDE\]/gi, key: "big" },
  { open: /\[TXTGIGANTE\]/gi, key: "big" },
  { open: /\[TXTMEDIO\]/gi, key: "medium" },
  { open: /\[CAIXA\]/gi, key: "upper" },
  { open: /\[TZTBORDA\]/gi, key: "underline" },
  { open: /\[TXTBORDA\]/gi, key: "underline" },
  { open: /\[BORDA\]/gi, key: "underline" },
  { open: /\[TXTBORDATXT\]/gi, key: "underline" },
  { open: /\[FUNDPRETO\]/gi, key: "invert" },
  { open: /\[DESTAQUE\]/gi, key: "bold" },
  { open: /\[QUADRADONEGRITO\]/gi, key: "frameStrong" },
  { open: /\[QUADRADO\]/gi, key: "frameStrong" },
  { open: /\[RETANGULO\]/gi, key: "frameStrong" },
];

const ALL_TAGS_RE = /\[\/?(?:CENTRO|NEGRITO|GRANDE|TXTGIGANTE|TXTMEDIO|TXTPEQUENO|CAIXA|TZTBORDA|TXTBORDA|BORDA|TXTBORDATXT|FUNDPRETO|DESTAQUE|QUADRADONEGRITO|QUADRADO|RETANGULO)\]/gi;

/**
 * Detecta o estilo aplicado à linha analisando tags abertas (sem rigor
 * sobre fechamento, já que muitos templates usam tags como toggles).
 * Retorna o estilo + texto limpo de tags.
 */
const parseLineStyle = (rawLine: string): { style: LineStyle; text: string } => {
  const style: LineStyle = { ...DEFAULT_STYLE };

  if (/\[CENTRO\]/i.test(rawLine)) style.align = "center";
  if (/\[NEGRITO\]|\[DESTAQUE\]|\[QUADRADONEGRITO\]/i.test(rawLine)) style.bold = true;
  if (/\[GRANDE\]|\[TXTGIGANTE\]/i.test(rawLine)) style.big = true;
  if (/\[TXTMEDIO\]/i.test(rawLine) && !style.big) style.medium = true;
  if (/\[CAIXA\]/i.test(rawLine)) style.upper = true;
  if (/\[TZTBORDA\]|\[TXTBORDA\]|\[BORDA\]|\[TXTBORDATXT\]/i.test(rawLine)) style.underline = true;
  if (/\[FUNDPRETO\]/i.test(rawLine)) style.invert = true;
  if (/\[QUADRADONEGRITO\]|\[QUADRADO\]|\[RETANGULO\]/i.test(rawLine)) {
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
  b.underline(style.underline ? 1 : 0);
};

const resetStyle = (b: EscPosBuilder) => {
  b.align("left").bold(false).size(0, 0).underline(0);
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

    // Caso especial: linha com [TROCO]/[FUNDPRETO] vazio resolve em "R$ 0,00" sem conteúdo útil
    const finalText = style.upper ? text.toLocaleUpperCase("pt-BR") : text;

    if (!finalText.trim()) {
      // Linha que sobrou só com tags vazias — pula
      continue;
    }

    applyStyleToBuilder(b, style);
    // Quebra texto longo respeitando largura
    b.wrap(finalText);
    resetStyle(b);
  }

  // Feed + corte exato
  b.feed().cut();

  return b.build();
};
