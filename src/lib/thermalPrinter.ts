/* Thermal-style printing using window.print() */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { makeTightThermalPrintHtml } from "./adminPrintTemplates";

export interface PrintOrderData {
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

function buildReceiptHTML(order: PrintOrderData): string {
  const time = new Date(order.createdAt).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });

  const subtotal = order.total - order.deliveryFee;

  const itemsHTML = order.items.map((item) => {
    const lineTotal = item.unitPrice * item.quantity;
    let html = `<div class="item"><span>${item.quantity}x ${item.name}</span><span>R$ ${lineTotal.toFixed(2).replace(".", ",")}</span></div>`;
    if (item.addons && item.addons.length > 0) {
      for (const addon of item.addons) {
        html += `<div class="addon">+ ${addon.name}</div>`;
      }
    }
    if (item.observations) {
      html += `<div class="addon">Obs: ${item.observations}</div>`;
    }
    return html;
  }).join("");

  return makeTightThermalPrintHtml(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Pedido #${order.orderId.slice(0, 6)}</title>
<style>
  @page {
    size: 72mm auto;
    margin: 0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Courier New', monospace;
    font-size: 12px;
    width: 72mm;
    padding: 0;
    color: #000;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .title { font-size: 18px; font-weight: bold; }
  .subtitle { font-size: 11px; margin-bottom: 4px; }
  .separator { border-top: 1px dashed #000; margin: 6px 0; }
  .item { display: flex; justify-content: space-between; margin: 2px 0; }
  .addon { font-size: 10px; padding-left: 12px; color: #333; }
  .total-line { display: flex; justify-content: space-between; margin: 2px 0; }
  .grand-total { font-size: 16px; font-weight: bold; display: flex; justify-content: space-between; margin: 4px 0; }
  .info { font-size: 11px; margin: 1px 0; }
  .footer { font-size: 10px; text-align: center; margin-top: 8px; }
  @media print {
    body { width: 72mm; }
  }
</style>
</head>
<body>
  <div class="center">
    <div class="title">TURBO LANCHES</div>
  </div>
  <div class="separator"></div>

  <div class="bold">PEDIDO #${order.orderId.slice(0, 6).toUpperCase()}</div>
  <div class="info">Data: ${time}</div>
  <div class="separator"></div>

  <div class="info">Cliente: ${order.customerName}</div>
  <div class="info">Tel: ${order.customerPhone}</div>
  <div class="info">End: ${order.address}</div>
  <div class="separator"></div>

  <div class="bold">ITENS:</div>
  ${itemsHTML}
  <div class="separator"></div>

  <div class="total-line"><span>Subtotal</span><span>R$ ${subtotal.toFixed(2).replace(".", ",")}</span></div>
  <div class="total-line"><span>Entrega</span><span>R$ ${order.deliveryFee.toFixed(2).replace(".", ",")}</span></div>
  <div class="grand-total"><span>TOTAL</span><span>R$ ${order.total.toFixed(2).replace(".", ",")}</span></div>
  <div class="info">Pagamento: ${order.paymentMethod.toUpperCase()}</div>

  ${order.observations ? `<div class="separator"></div><div class="info">OBS: ${order.observations}</div>` : ""}

  <div class="separator"></div>
  <div class="footer">Obrigado pela preferencia!</div>
  <div class="separator thermal-cut-marker" data-thermal-cut="true"></div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`, 72);
}

export function printOrder(order: PrintOrderData): boolean {
  try {
    const receiptHTML = buildReceiptHTML(order);
    const printWindow = window.open("", "_blank", "width=300,height=600");
    if (!printWindow) {
      alert("Permita pop-ups para imprimir pedidos.");
      return false;
    }
    printWindow.document.open();
    printWindow.document.write(receiptHTML);
    printWindow.document.close();
    return true;
  } catch (err) {
    console.error("Erro ao imprimir:", err);
    return false;
  }
}

export function isPrinterSupported(): boolean {
  return true; // window.print works everywhere
}

// No-op for compatibility
export async function connectPrinter(): Promise<boolean> {
  return true;
}
