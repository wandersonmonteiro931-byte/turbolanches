/**
 * Builder de comandos ESC/POS para impressoras térmicas (Epson-compatíveis).
 *
 * Gera um Uint8Array pronto para envio raw via QZ Tray, WebUSB ou WebSerial.
 * Cuidados:
 *  - Acentos: convertemos UTF-8 → CP1252 (codepage 16) por padrão.
 *  - Largura: 48 colunas para impressoras 80mm/72mm; 32 para 58mm.
 *  - Corte: enviamos GS V 0 (corte total) após FEED de algumas linhas.
 */

const ESC = 0x1b;
const GS = 0x1d;

// Tabela mínima UTF-8 → CP1252 cobrindo PT-BR.
const CP1252_MAP: Record<string, number> = {
  "á": 0xe1, "à": 0xe0, "â": 0xe2, "ã": 0xe3, "ä": 0xe4,
  "é": 0xe9, "è": 0xe8, "ê": 0xea, "ë": 0xeb,
  "í": 0xed, "ì": 0xec, "î": 0xee, "ï": 0xef,
  "ó": 0xf3, "ò": 0xf2, "ô": 0xf4, "õ": 0xf5, "ö": 0xf6,
  "ú": 0xfa, "ù": 0xf9, "û": 0xfb, "ü": 0xfc,
  "ç": 0xe7, "ñ": 0xf1,
  "Á": 0xc1, "À": 0xc0, "Â": 0xc2, "Ã": 0xc3, "Ä": 0xc4,
  "É": 0xc9, "È": 0xc8, "Ê": 0xca, "Ë": 0xcb,
  "Í": 0xcd, "Ì": 0xcc, "Î": 0xce, "Ï": 0xcf,
  "Ó": 0xd3, "Ò": 0xd2, "Ô": 0xd4, "Õ": 0xd5, "Ö": 0xd6,
  "Ú": 0xda, "Ù": 0xd9, "Û": 0xdb, "Ü": 0xdc,
  "Ç": 0xc7, "Ñ": 0xd1,
  "ª": 0xaa, "º": 0xba, "°": 0xb0,
  "€": 0x80, "£": 0xa3, "¥": 0xa5, "¢": 0xa2,
  "“": 0x93, "”": 0x94, "‘": 0x91, "’": 0x92,
  "–": 0x96, "—": 0x97, "•": 0x95,
};

const encodeCp1252 = (text: string): number[] => {
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      out.push(code);
    } else if (CP1252_MAP[ch] !== undefined) {
      out.push(CP1252_MAP[ch]);
    } else {
      // Fallback: tira o acento via NFD e pega ASCII.
      const stripped = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const fallback = stripped.charCodeAt(0);
      out.push(fallback < 0x80 ? fallback : 0x3f); // '?'
    }
  }
  return out;
};

export type Align = "left" | "center" | "right";

export interface EscPosBuilderOptions {
  columns: number;
  codepage: number;
  feedLines: number;
}

const DEFAULT_OPTS: EscPosBuilderOptions = {
  columns: 48,
  codepage: 16,
  feedLines: 3,
};

export class EscPosBuilder {
  private bytes: number[] = [];
  private opts: EscPosBuilderOptions;

  constructor(options: Partial<EscPosBuilderOptions> = {}) {
    this.opts = { ...DEFAULT_OPTS, ...options };
    // Init + selecionar codepage.
    this.push(ESC, 0x40); // ESC @ — initialize
    this.push(ESC, 0x74, this.opts.codepage); // ESC t n — codepage
  }

  private push(...vals: number[]) {
    for (const v of vals) this.bytes.push(v & 0xff);
  }

  align(a: Align): this {
    const n = a === "center" ? 1 : a === "right" ? 2 : 0;
    this.push(ESC, 0x61, n);
    return this;
  }

  bold(on: boolean): this {
    this.push(ESC, 0x45, on ? 1 : 0);
    return this;
  }

  /** GS ! n — duplica largura/altura. width/height: 0..7 */
  size(width: number, height: number): this {
    const n = ((Math.min(7, Math.max(0, width)) & 0x07) << 4) | (Math.min(7, Math.max(0, height)) & 0x07);
    this.push(GS, 0x21, n);
    return this;
  }

  /** ESC - n — sublinhado: 0 off, 1 fino, 2 grosso */
  underline(level: 0 | 1 | 2): this {
    this.push(ESC, 0x2d, level);
    return this;
  }

  /** GS B n — modo invertido (branco no preto). 0 off, 1 on. */
  invert(on: boolean): this {
    this.push(GS, 0x42, on ? 1 : 0);
    return this;
  }

  /** ESC M n — fonte A/B. Em muitas térmicas, B é menor/condensada. */
  font(mode: "A" | "B"): this {
    this.push(ESC, 0x4d, mode === "B" ? 1 : 0);
    return this;
  }

  text(value: string): this {
    for (const b of encodeCp1252(value)) this.bytes.push(b);
    return this;
  }

  newline(n = 1): this {
    for (let i = 0; i < n; i += 1) this.push(0x0a);
    return this;
  }

  line(value = ""): this {
    return this.text(value).newline();
  }

  /** Linha completa de "-" ou "=" cobrindo as colunas. */
  separator(char = "-"): this {
    return this.line(char.repeat(this.opts.columns));
  }

  /** Linha com label à esquerda e valor à direita, alinhados nas bordas. */
  twoCols(left: string, right: string): this {
    const cols = this.opts.columns;
    const lTrim = left.trim();
    const rTrim = right.trim();
    if (lTrim.length + rTrim.length + 1 > cols) {
      // Quebra: label numa linha, valor à direita na próxima.
      this.line(lTrim);
      const padded = rTrim.padStart(cols);
      return this.line(padded);
    }
    const spaces = cols - lTrim.length - rTrim.length;
    return this.line(`${lTrim}${" ".repeat(spaces)}${rTrim}`);
  }

  /**
   * Quebra texto longo em múltiplas linhas respeitando largura.
   * - Preserva espaços literais (múltiplos espaços continuam múltiplos).
   * - NUNCA corta palavra ao meio: palavra > cols só é fragmentada como último
   *   recurso, sozinha em sua linha.
   * - Aceita largura efetiva customizada (ex: 24 para texto duplo).
   */
  wrap(value: string, effectiveCols?: number): this {
    const cols = effectiveCols && effectiveCols > 0 ? effectiveCols : this.opts.columns;
    const tokens = value.match(/\s+|\S+/g) || [];
    let line = "";
    const flush = () => {
      this.line(line.replace(/\s+$/u, ""));
      line = "";
    };
    for (const tk of tokens) {
      const isSpace = /^\s+$/.test(tk);
      if (isSpace) {
        if (line.length > 0 && line.length < cols) {
          const room = cols - line.length;
          line += tk.slice(0, room);
        }
        continue;
      }
      if (tk.length > cols) {
        if (line) flush();
        // Regra da comanda: nunca cortar palavra ao meio. Se uma palavra for
        // maior que a largura, enviamos a palavra inteira numa linha e deixamos
        // a impressora lidar fisicamente com ela, sem fragmentar no software.
        this.line(tk);
        continue;
      }
      if (line.length === 0) {
        line = tk;
      } else if (line.length + tk.length <= cols) {
        line += tk;
      } else {
        flush();
        line = tk;
      }
    }
    if (line.length > 0) this.line(line.replace(/\s+$/u, ""));
    return this;
  }

  /** Escreve texto literal preservando todos os espaços (sem wrap). */
  rawText(value: string): this {
    return this.text(value).newline();
  }

  feed(n = this.opts.feedLines): this {
    return this.newline(n);
  }

  /** GS V 0 — corte total. Em impressoras sem guilhotina, é ignorado. */
  cut(): this {
    this.push(GS, 0x56, 0);
    return this;
  }

  /** Pulso para gaveta de dinheiro (opcional). */
  openDrawer(): this {
    this.push(ESC, 0x70, 0, 25, 250);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

// =============================================================================
// Builder de pedido (alto nível)
// =============================================================================

export interface EscPosOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
  observations?: string | null;
  addons?: { name: string; quantity?: number; price?: number }[];
}

export interface EscPosOrderInput {
  storeName: string;
  orderLabel: string; // ex: "PEDIDO" ou "MESA"
  orderNumber: string; // já formatado (#00431)
  dateTime: string; // já formatado pt-BR
  customerName?: string;
  customerPhone?: string;
  customerCode?: string;
  address?: string;
  deliveryLabel?: string; // DELIVERY / RETIRADA / MESA
  items: EscPosOrderItem[];
  subtotal: number;
  deliveryFee?: number;
  discount?: number;
  total: number;
  paymentMethod: string;
  paymentLabel: string;
  changeFor?: number;
  observations?: string | null;
  customMessage?: string;
  footerMessage?: string;
}

const fmt = (n: number) => `R$ ${n.toFixed(2).replace(".", ",")}`;

export const buildOrderEscPos = (
  order: EscPosOrderInput,
  opts: Partial<EscPosBuilderOptions> = {},
): Uint8Array => {
  const b = new EscPosBuilder(opts);

  // Cabeçalho
  b.align("center").bold(true).size(1, 1).line(order.storeName).size(0, 0).bold(false);
  b.separator("=");

  // Tipo + número
  b.align("center").bold(true).size(1, 1).line(`${order.orderLabel} ${order.orderNumber}`).size(0, 0).bold(false);
  b.align("left").line(`Data: ${order.dateTime}`);
  if (order.deliveryLabel) b.line(`Tipo: ${order.deliveryLabel}`);
  b.separator("-");

  // Cliente
  if (order.customerName) {
    b.bold(true).line("CLIENTE").bold(false);
    b.wrap(order.customerName);
    if (order.customerCode) b.line(`Código: ${order.customerCode}`);
    if (order.customerPhone) b.line(`Tel: ${order.customerPhone}`);
    if (order.address) {
      b.line("Endereço:");
      b.wrap(order.address);
    }
    b.separator("-");
  }

  // Itens
  b.bold(true).line("ITENS").bold(false);
  for (const item of order.items) {
    const lineTotal = item.unitPrice * item.quantity
      + (item.addons || []).reduce((s, a) => s + (Number(a.price) || 0) * (Number(a.quantity) || 1), 0);
    b.bold(true).twoCols(`${item.quantity}x ${item.name}`, fmt(lineTotal)).bold(false);
    for (const addon of item.addons || []) {
      const q = (addon.quantity || 1) > 1 ? ` x${addon.quantity}` : "";
      b.line(`  + ${addon.name}${q}`);
    }
    if (item.observations?.trim()) {
      b.wrap(`  Obs: ${item.observations.trim()}`);
    }
  }
  b.separator("-");

  // Totais
  b.twoCols("Subtotal", fmt(order.subtotal));
  if (order.deliveryFee && order.deliveryFee > 0) b.twoCols("Entrega", fmt(order.deliveryFee));
  if (order.discount && order.discount > 0) b.twoCols("Desconto", `-${fmt(order.discount)}`);
  b.bold(true).size(1, 1).twoCols("TOTAL", fmt(order.total)).size(0, 0).bold(false);

  b.line(`Pagamento: ${order.paymentMethod.toUpperCase()} - ${order.paymentLabel}`);
  if (order.changeFor && order.changeFor > order.total) {
    b.bold(true).line(`DEVOLVER: ${fmt(order.changeFor - order.total)}`).bold(false);
  }

  if (order.observations?.trim()) {
    b.separator("-");
    b.bold(true).line("OBSERVAÇÕES").bold(false);
    b.wrap(order.observations.trim());
  }

  // Rodapé
  if (order.customMessage?.trim() || order.footerMessage?.trim()) {
    b.separator("=");
    b.align("center");
    if (order.customMessage?.trim()) b.wrap(order.customMessage.trim());
    if (order.footerMessage?.trim()) b.wrap(order.footerMessage.trim());
    b.align("left");
  }

  // Feed + corte (corte exato no fim do conteúdo)
  b.feed().cut();

  return b.build();
};
