import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";

const VARIABLES = [
  { key: "[NUMEROPEDIDO]", desc: "Número do pedido (ex: #00001)" },
  { key: "[MESA]", desc: "Código da mesa (ex: #MESA01)" },
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
  { key: "[CUPOM]", desc: "Código do cupom e valor do desconto" },
  { key: "[TROCO]", desc: "Valor do troco (se houver)" },
  { key: "[NOMELOJA]", desc: "Nome da loja (campo editável)" },
  { key: "[TIPOCOMANDA]", desc: "Título da comanda (editável, aceita variáveis como [PRODUTO])" },
  { key: "[DATAHORA]", desc: "Data e hora atual" },
  { key: "[DATAAGORA]", desc: "Data e hora atual (agora)" },
  { key: "[DATAHORAPEDIDO]", desc: "Data e hora do pedido" },
  { key: "[DATAHORAENTREGA]", desc: "Horário máximo para entrega" },
  { key: "[DATAHORASAÍDAENTREGA]", desc: "Horário de saída para entrega" },
  { key: "[OBS]", desc: "Observações do pedido" },
  { key: "[ITENS]", desc: "Tabela de itens em 3 colunas (qtd | item | valor) com obs abaixo" },
  { key: "[ITEM]", desc: "Igual [ITENS]; com variáveis na linha repete para cada item" },
  { key: "[VALORITEM]", desc: "Valor total do item (dentro da linha com [ITENS])" },
  { key: "[QNTITENS]", desc: "Quantidade de cada item (dentro da linha com [ITENS])" },
  { key: "[PRODUTOS]", desc: "Nome do produto (dentro da linha com [ITENS])" },
  { key: "[PREÇOPROD]", desc: "Preço unitário do produto (dentro da linha com [ITENS])" },
  { key: "[QUANTIDADEPROD]", desc: "Quantidade do produto (dentro da linha com [ITENS])" },
  { key: "[OBSITEM]", desc: "Observação do item (dentro da linha com [ITENS] ou [ITEM])" },
  { key: "[CÓDIGOPROD]", desc: "Código numérico do produto (ex.: 101). Use dentro da linha com [ITENS] ou [ITEM]" },
  { key: "[DELIVERYRETIRADAVIAGEM]", desc: "Tipo: DELIVERY / RETIRADA / MESA" },
  { key: "[RODAPÉ]", desc: "Mensagem de rodapé (campo editável)" },
  { key: "[DIVULGAÇÃO]", desc: "Mensagem promocional (campo editável)" },
  { key: "[PRODUTO]", desc: "Nome do produto/ingrediente da etiqueta" },
  { key: "[MARCA]", desc: "Marca do ingrediente/item selecionado na etiqueta" },
  { key: "[DATAFABRICACAO]", desc: "Data de fabricação da etiqueta" },
  { key: "[VALIDADE]", desc: "Data de validade da etiqueta" },
  { key: "[RESPONSAVEL]", desc: "Responsável pela produção/preparo" },
  { key: "[TITULO]", desc: "Título da lista de reposição" },
  { key: "[TOTALITENS]", desc: "Quantidade total de itens marcados" },
  { key: "[LISTA]", desc: "Lista dinâmica da reposição com item + quantidade" },
  { key: "[RESFRIADO]", desc: "Exibe 'RESFRIADO' se selecionado na etiqueta" },
  { key: "[CONGELADO]", desc: "Exibe 'CONGELADO' se selecionado na etiqueta" },
  { key: "[ARMAZENAR]", desc: "Tipo de armazenamento (RESFRIADO ou CONGELADO ou AMBIENTE)" },
  { key: "[GRAUS]", desc: "Temperatura em °C (ex: -18°C)" },
  { key: "[FRASEARMAZ]", desc: "Frase configurável de armazenamento" },
  { key: "[NOMEENTREGADOR]", desc: "Nome do entregador designado para a entrega" },
  { key: "[IMAGEMPANFLETO]", desc: "Mostra a imagem inteira cadastrada para o panfleto" },
  { key: "[LOGOLOJA]", desc: "Mostra o logotipo da loja com o tamanho escolhido" },
];

const FORMATTING = [
  { marker: "---", desc: "Linha separadora tracejada" },
  { marker: "[CENTRO]texto[/CENTRO]", desc: "Texto centralizado" },
  { marker: "[GRANDE]texto[/GRANDE]", desc: "Texto significativamente grande" },
  { marker: "[CAIXA]texto[/CAIXA]", desc: "Texto em caixa com borda espessa" },
  { marker: "[DESTAQUE]texto[/DESTAQUE]", desc: "Texto grande destacado" },
  { marker: "[NEGRITO]texto[/NEGRITO]", desc: "Texto em negrito maior" },
  { marker: "[TXTMEDIO]texto[/TXTMEDIO]", desc: "Texto médio" },
  { marker: "[TXTPEQUENO]texto[/TXTPEQUENO]", desc: "Texto menor" },
  { marker: "[TXTGIGANTE]texto[/TXTGIGANTE]", desc: "Texto muito grande" },
  { marker: "[TZTBORDA]texto[/TZTBORDA]", desc: "Fundo preto, texto branco, ponta a ponta" },
  { marker: "[TXTBORDATXT]texto[/TXTBORDATXT]", desc: "Fundo preto, texto branco, apenas ao redor das letras" },
  { marker: "[BORDA]texto[/BORDA]", desc: "Moldura fina ao redor do texto" },
  { marker: "[QUADRADO]", desc: "Bloco com moldura fina (abrir e fechar)" },
  { marker: "[QUADRADONEGRITO]", desc: "Bloco com moldura grossa (abrir e fechar)" },
  { marker: "[RETANGULO]", desc: "Bloco com bordas borda-a-borda (abrir e fechar)" },
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
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-4 text-left">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-primary" />
          <span className="text-sm font-semibold text-foreground">Variáveis e Formatação</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 pb-4">
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Aviso importante para impressão de imagens</div>
            <div className="mt-1">Sua imagem deve ser em texto/ícones pretos e fundo branco para boa qualidade.</div>
            <div className="mt-2 font-medium">Exemplos de uso:</div>
            <div className="mt-1 font-mono">[CENTRO][IMAGEMPANFLETO][/CENTRO]</div>
            <div className="mt-1 font-mono">[CENTRO][LOGOLOJA][/CENTRO]</div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Variáveis (clique para copiar)
            </h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {VARIABLES.map((v) => (
                <button
                  key={v.key}
                  onClick={() => handleCopy(v.key)}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  <code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    {v.key}
                  </code>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{v.desc}</span>
                  {copied === v.key ? (
                    <Check size={12} className="shrink-0 text-green-500" />
                  ) : (
                    <Copy size={12} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Formatação</h4>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {FORMATTING.map((f) => (
                <button
                  key={f.marker}
                  onClick={() => handleCopy(f.marker)}
                  className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                >
                  <code className="whitespace-nowrap rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-primary">
                    {f.marker}
                  </code>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{f.desc}</span>
                  {copied === f.marker ? (
                    <Check size={12} className="shrink-0 text-green-500" />
                  ) : (
                    <Copy size={12} className="shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
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
