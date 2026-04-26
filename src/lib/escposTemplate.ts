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
  for (let pass = 0; pass < 2; pass += 1) {
    for (const [k, v] of Object.entries(vars)) {
      out = out.split(k).join(v ?? "");
    }
  }
  return out;
};

const ITEM_TOKENS = ["[ITENS]", "[ITEM]", "[PRODUTO]", "[PRODUTOS]", "[QNTITENS]", "[QUANTIDADEPROD]", "[VALORITEM]", "[PREÇOPROD]", "[OBSITEM]", "[ADICIONAIS]", "[CÓDIGOPROD]", "[CODIGOPROD]"];

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
  big: boolean;       // [GRANDE]/[DESTAQUE]
  giant: boolean;     // [TXTGIGANTE]
  medium: boolean;    // [TXTMEDIO]
  small: boolean;     // [TXTPEQUENO]
  box: boolean;       // [CAIXA]
  underline: 0 | 1 | 2;
  invert: boolean;    // [FUNDPRETO]/[TXTBORDATXT] = fundo preto só ao redor
  invertFull: boolean; // [TZTBORDA]/[TXTBORDA] = fundo preto ponta-a-ponta
  frame: "none" | "thin" | "strong" | "rect";
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
};

const ALL_TAGS_RE = /\[\/?(?:CENTRO|NEGRITO|GRANDE|TXTGIGANTE|TXTMEDIO|TXTPEQUENO|CAIXA|TZTBORDA|TXTBORDA|BORDA|TXTBORDATXT|FUNDPRETO|DESTAQUE|QUADRADONEGRITO|QUADRADO|RETANGULO)\]/gi;

const parseLineStyle = (rawLine: string): { style: LineStyle; text: string } => {
  const style: LineStyle = { ...DEFAULT_STYLE };

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
    style.frame = "strong";
    style.bold = true;
  }

  const text = rawLine.replace(ALL_TAGS_RE, "");
  return { style, text };
};

const applyStyleToBuilder = (b: EscPosBuilder, style: LineStyle) => {
  b.align(style.align);
  b.font(style.small ? "B" : "A");
  b.bold(style.bold);
  if (style.giant) b.size(2, 2);
  else if (style.big) b.size(1, 1);
  else if (style.medium) b.size(1, 0);
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

const effectiveColumns = (cols: number, style: LineStyle) => {
  if (style.giant) return Math.max(8, Math.floor(cols / 3));
  if (style.big || style.medium) return Math.max(8, Math.floor(cols / 2));
  if (style.small) return Math.max(cols, Math.floor(cols * 1.25));
  return cols;
};

const renderStyledText = (b: EscPosBuilder, style: LineStyle, text: string, cols: number) => {
  const finalText = text;
  if (!finalText.replace(/\s/g, "")) return;

  // Fundo preto em uma única faixa sólida: sem linhas extras transparentes
  // cortando a caixa no meio, e mantendo o tamanho configurado no template.
  if (style.invertFull || style.invert) {
    const trimmedTxt = finalText.trim();
    const effectiveCols = effectiveColumns(cols, style);
    const padded = trimmedTxt.length >= effectiveCols
      ? trimmedTxt
      : (() => {
          const total = effectiveCols - trimmedTxt.length;
          const left = Math.floor(total / 2);
          return " ".repeat(left) + trimmedTxt + " ".repeat(total - left);
        })();
    applyStyleToBuilder(b, { ...style, invert: true, invertFull: true, frame: "none", box: false });
    b.rawText(padded);
    resetStyle(b);
    return;
  }

  if (style.box || style.frame !== "none") {
    const frame = style.box ? "strong" : style.frame;
    const useStrong = frame === "strong";
    const border = frameBorder(frame, cols);
    resetStyle(b);
    b.bold(useStrong).line(border).bold(false);
    applyStyleToBuilder(b, { ...style, frame: "none", box: false, big: false, giant: false, medium: false, small: false });
    b.rawText(boxedLine(finalText, cols, style.align));
    resetStyle(b);
    b.bold(useStrong).line(border).bold(false);
    return;
  }

  applyStyleToBuilder(b, style);
  // Regra do usuário: NUNCA quebrar texto/número para a linha de baixo.
  // Mantém exatamente como foi configurado.
  b.rawText(finalText);
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
  const inner = Math.max(4, cols - 4);
  applyStyleToBuilder(b, { ...style, frame: "none", box: false });
  // Não quebrar: imprime a linha como veio, apenas preenche com espaços
  // para fechar a borda direita quando couber.
  const truncated = text.length > inner ? text.slice(0, inner) : text;
  const padded = truncated + " ".repeat(Math.max(0, inner - truncated.length));
  b.rawText(`| ${padded} |`);
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
  const cols = (opts.columns ?? 48);

  // 1. Substitui variáveis globais
  let resolved = replaceTokens(input.template, input.variables);

  // 2. Expande [ITENS]
  if (input.items && input.items.length > 0) {
    resolved = expandItemsLines(resolved, input.items);
  }

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
      b.bold(blockTag.frame === "strong").line(frameChar(blockTag.frame).repeat(cols)).bold(false);
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
      if (activeBlockFrame !== "none") renderBlockContentLine(b, DEFAULT_STYLE, "-".repeat(Math.max(4, cols - 4)), cols);
      else b.line("-".repeat(cols));
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
