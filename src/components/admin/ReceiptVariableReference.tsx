import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";

const VARIABLES = [
  { key: "[NUMEROPEDIDO]", desc: "Número do pedido (ex: #00001)" },
  { key: "[NOMECLIENTE]", desc: "Nome do cliente" },
  { key: "[CODIGOCLIENTE]", desc: "Código do cliente (ex: T00001)" },
  { key: "[TELEFONECLIENTE]", desc: "Telefone do cliente" },
  { key: "[ENDEREÇO]", desc: "Endereço completo de entrega" },
  { key: "[FORMAPAGTO]", desc: "Forma de pagamento (ex: PIX - PAGO ONLINE)" },
  { key: "[TOTALRECEBER]", desc: "Total a receber na entrega" },
  { key: "[TOTALPAGO]", desc: "Total já pago online" },
  { key: "[SUBTOTAL]", desc: "Subtotal dos itens" },
  { key: "[TOTAL]", desc: "Valor total do pedido" },
  { key: "[TAXAENTREGA]", desc: "Taxa de entrega" },
  { key: "[DESCONTO]", desc: "Valor do desconto" },
  { key: "[TROCO]", desc: "Valor do troco (se houver)" },
  { key: "[NOMELOJA]", desc: "Nome da loja (campo editável)" },
  { key: "[TIPOCOMANDA]", desc: "Título da comanda (campo editável)" },
  { key: "[DATAHORA]", desc: "Data e hora atual" },
  { key: "[DATAAGORA]", desc: "Data e hora atual (agora)" },
  { key: "[DATAHORAPEDIDO]", desc: "Data e hora do pedido" },
  { key: "[DATAHORAENTREGA]", desc: "Horário máximo para entrega" },
  { key: "[DATAHORASAÍDAENTREGA]", desc: "Horário de saída para entrega" },
  { key: "[OBS]", desc: "Observações do pedido" },
  { key: "[ITENS]", desc: "Lista completa dos itens (auto-renderizado)" },
  { key: "[VALORITEM]", desc: "Valor unitário × qtd (dentro de [ITENS])" },
  { key: "[QNTITENS]", desc: "Quantidade de cada item (dentro de [ITENS])" },
  { key: "[DELIVERYRETIRADAVIAGEM]", desc: "Tipo: DELIVERY / RETIRADA" },
  { key: "[RODAPÉ]", desc: "Mensagem de rodapé (campo editável)" },
  { key: "[DIVULGAÇÃO]", desc: "Mensagem promocional (campo editável)" },
];

const FORMATTING = [
  { marker: "---", desc: "Linha separadora tracejada" },
  { marker: "[CENTRO]texto[/CENTRO]", desc: "Texto centralizado (aceita também [CENTRO] no fechamento legado)" },
  { marker: "[GRANDE]texto[/GRANDE]", desc: "Texto grande com borda (título)" },
  { marker: "[CAIXA]texto[/CAIXA]", desc: "Texto em caixa com borda" },
  { marker: "[DESTAQUE]texto[/DESTAQUE]", desc: "Texto grande destacado" },
  { marker: "[NEGRITO]texto[/NEGRITO]", desc: "Texto em negrito maior" },
  { marker: "[TXTMEDIO]texto[/TXTMEDIO]", desc: "Texto maior, sem ser gigante" },
  { marker: "[TXTPEQUENO]texto[/TXTPEQUENO]", desc: "Texto menor" },
  { marker: "[TXTGIGANTE]texto[/TXTGIGANTE]", desc: "Texto muito grande em negrito" },
  { marker: "[TZTBORDA]texto[/TZTBORDA]", desc: "Texto branco em destaque com fundo preto e negrito" },
];

const ReceiptVariableReference = () => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(text);
    toast.success(`"${text}" copiado!`);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2">
          <Info size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">
            Variáveis e Formatação
          </span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="border-t border-border px-4 pb-4 space-y-4">
          {/* Variables */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Variáveis (clique para copiar)
            </h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => handleCopy(v.key)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50 group"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary whitespace-nowrap">
                    {v.key}
                  </code>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {v.desc}
                  </span>
                  {copied === v.key ? (
                    <Check size={12} className="text-green-500 shrink-0" />
                  ) : (
                    <Copy size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Formatting */}
          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Formatação
            </h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {FORMATTING.map((f) => (
                <button
                  key={f.marker}
                  onClick={() => handleCopy(f.marker)}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50 group"
                >
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary whitespace-nowrap">
                    {f.marker}
                  </code>
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {f.desc}
                  </span>
                  {copied === f.marker ? (
                    <Check size={12} className="text-green-500 shrink-0" />
                  ) : (
                    <Copy size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReceiptVariableReference;
