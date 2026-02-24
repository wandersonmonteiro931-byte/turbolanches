// ESC/POS commands for thermal printers via WebUSB
/* eslint-disable @typescript-eslint/no-explicit-any */
const nav = navigator as any;

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const encoder = new TextEncoder();

function cmd(...bytes: number[]): Uint8Array {
  return new Uint8Array(bytes);
}

function text(str: string): Uint8Array {
  return encoder.encode(str);
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

// ESC/POS helpers
const INIT = cmd(ESC, 0x40); // Initialize printer
const BOLD_ON = cmd(ESC, 0x45, 0x01);
const BOLD_OFF = cmd(ESC, 0x45, 0x00);
const ALIGN_CENTER = cmd(ESC, 0x61, 0x01);
const ALIGN_LEFT = cmd(ESC, 0x61, 0x00);
const DOUBLE_SIZE = cmd(GS, 0x21, 0x11); // Double width + height
const NORMAL_SIZE = cmd(GS, 0x21, 0x00);
const CUT = cmd(GS, 0x56, 0x00); // Full cut
const FEED = cmd(LF);
const SEPARATOR = text("--------------------------------\n");

interface PrintOrderData {
  orderId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: { name: string; quantity: number; unitPrice: number; observations?: string | null; addons?: any[] }[];
  total: number;
  deliveryFee: number;
  paymentMethod: string;
  observations?: string | null;
  createdAt: string;
}

function buildReceipt(order: PrintOrderData): Uint8Array {
  const time = new Date(order.createdAt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const parts: Uint8Array[] = [
    INIT,
    ALIGN_CENTER,
    DOUBLE_SIZE,
    BOLD_ON,
    text("TURBO DELIVERY\n"),
    NORMAL_SIZE,
    BOLD_OFF,
    text("LANCHES\n"),
    FEED,
    SEPARATOR,
    ALIGN_LEFT,
    BOLD_ON,
    text(`PEDIDO #${order.orderId.slice(0, 6).toUpperCase()}\n`),
    BOLD_OFF,
    text(`Data: ${time}\n`),
    SEPARATOR,
    text(`Cliente: ${order.customerName}\n`),
    text(`Tel: ${order.customerPhone}\n`),
    text(`End: ${order.address}\n`),
    SEPARATOR,
    BOLD_ON,
    text("ITENS:\n"),
    BOLD_OFF,
  ];

  for (const item of order.items) {
    const lineTotal = item.unitPrice * item.quantity;
    parts.push(text(`${item.quantity}x ${item.name}\n`));
    parts.push(text(`   R$ ${lineTotal.toFixed(2).replace(".", ",")}\n`));
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        parts.push(text(`   + ${addon.name}\n`));
      }
    }
    if (item.observations) {
      parts.push(text(`   Obs: ${item.observations}\n`));
    }
  }

  parts.push(SEPARATOR);

  const subtotal = order.total - order.deliveryFee;
  parts.push(text(`Subtotal:  R$ ${subtotal.toFixed(2).replace(".", ",")}\n`));
  parts.push(text(`Entrega:   R$ ${order.deliveryFee.toFixed(2).replace(".", ",")}\n`));
  parts.push(BOLD_ON, DOUBLE_SIZE);
  parts.push(text(`TOTAL: R$ ${order.total.toFixed(2).replace(".", ",")}\n`));
  parts.push(NORMAL_SIZE, BOLD_OFF);
  parts.push(text(`Pagamento: ${order.paymentMethod.toUpperCase()}\n`));

  if (order.observations) {
    parts.push(SEPARATOR);
    parts.push(text(`OBS: ${order.observations}\n`));
  }

  parts.push(SEPARATOR);
  parts.push(ALIGN_CENTER);
  parts.push(text("Obrigado pela preferencia!\n"));
  parts.push(FEED, FEED, FEED, CUT);

  return concat(...parts);
}

let savedDevice: any = null;

export async function connectPrinter(): Promise<any> {
  try {
    const device = await nav.usb.requestDevice({
      filters: [],
    });
    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    await device.claimInterface(0);
    savedDevice = device;
    return device;
  } catch (err) {
    console.error("Erro ao conectar impressora:", err);
    return null;
  }
}

export async function printOrder(order: PrintOrderData): Promise<boolean> {
  try {
    let device = savedDevice;

    if (device) {
      try {
        if (!device.opened) {
          await device.open();
          if (device.configuration === null) {
            await device.selectConfiguration(1);
          }
          await device.claimInterface(0);
        }
      } catch {
        device = null;
        savedDevice = null;
      }
    }

    if (!device) {
      const devices = await nav.usb.getDevices();
      if (devices.length > 0) {
        device = devices[0];
        if (!device.opened) {
          await device.open();
          if (device.configuration === null) {
            await device.selectConfiguration(1);
          }
          await device.claimInterface(0);
        }
        savedDevice = device;
      } else {
        device = await connectPrinter();
        if (!device) return false;
      }
    }

    const receipt = buildReceipt(order);

    const iface = device.configuration?.interfaces[0];
    const endpoint = iface?.alternate?.endpoints.find((e: any) => e.direction === "out");
    const endpointNumber = endpoint?.endpointNumber || 1;

    await device.transferOut(endpointNumber, receipt);
    return true;
  } catch (err) {
    console.error("Erro ao imprimir:", err);
    return false;
  }
}

export function isPrinterSupported(): boolean {
  return !!nav.usb;
}
