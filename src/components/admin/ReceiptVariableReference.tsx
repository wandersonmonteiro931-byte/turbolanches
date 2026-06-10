import { useState } from "react";
import { Copy, Check, ChevronDown, ChevronUp, Info } from "lucide-react";
import { toast } from "sonner";

const VARIABLES = [
  { key: "[NUMEROPEDIDO]", desc: "Número do pedido (ex: #00001)" },
  { key: "[MESA]", desc: "Código da mesa (ex: #MESA01)" },
  { key: "[NOMECLIENTE]", desc: "Nome do cliente" },
  { key: "[CODIGOCLIENTE]", desc: "Código do cliente (ex: T00001)" },
  { key: "[TELEFONECLIENTE]", desc: "Telefone do cliente" },
  { key: "[ENDEREÇO]", desc: "Endereço completo de entrega em caixa alta" },
  { key: "[ENDERECO]", desc: "Endereço completo sem acento; igual [ENDEREÇO]" },
  { key: "[FORMAPAGTO]", desc: "Forma de pagamento (ex: PIX - PAGO ONLINE)" },
  { key: "[TOTALRECEBER]", desc: "Total a receber na entrega" },
  { key: "[TOTALPAGO]", desc: "Total já pago online" },
  { key: "[SUBTOTAL]", desc: "Subtotal dos itens" },
  { key: "[TOTAL]", desc: "Valor total do pedido" },
  { key: "[TAXAENTREGA]", desc: "Taxa de entrega" },
  { key: "[DESCONTO]", desc: "Valor do desconto" },
  { key: "[CUPOM]", desc: "Código do cupom e valor do desconto" },
  { key: "[TROCO]", desc: "Valor do troco, se houver" },
  { key: "[NOMELOJA]", desc: "Nome da loja, campo editável" },
  { key: "[TIPOCOMANDA]", desc: "Título da comanda, campo editável" },
  { key: "[DATAHORA]", desc: "Data e hora atual" },
  { key: "[DATAAGORA]", desc: "Data e hora atual, agora" },
  { key: "[DATAHORAPEDIDO]", desc: "Data e hora em que o pedido foi feito" },
  { key: "[DATAHORAENTREGA]", desc: "Horário máximo previsto para entrega" },
  { key: "[DATAHORASAÍDAENTREGA]", desc: "Data/hora de saída para entrega" },
  { key: "[HORASAIDA]", desc: "Horário de saída para entrega" },
  { key: "[OBS]", desc: "Observações do pedido" },
  { key: "[DELIVERYRETIRADAVIAGEM]", desc: "Tipo: DELIVERY / RETIRADA / MESA / VIAGEM" },
  { key: "[RODAPÉ]", desc: "Mensagem de rodapé, campo editável" },
  { key: "[DIVULGAÇÃO]", desc: "Mensagem promocional, campo editável" },
  { key: "[NOMEENTREGADOR]", desc: "Nome do entregador" },

  { key: "[ITENS]", desc: "Lista/tabela dinâmica de itens do pedido" },
  { key: "[ITEM]", desc: "Igual [ITENS]; se usado com variáveis na linha, repete para cada item" },
  { key: "[PRODUTO]", desc: "Nome do produto atual, item ou etiqueta" },
  { key: "[PRODUTOS]", desc: "Nome do produto dentro da repetição de itens" },
  { key: "[QNTITENS]", desc: "Quantidade do item" },
  { key: "[QUANTIDADEPROD]", desc: "Quantidade do produto" },
  { key: "[VALORITEM]", desc: "Valor total do item" },
  { key: "[PREÇOPROD]", desc: "Preço unitário do produto" },
  { key: "[OBSITEM]", desc: "Observação do item" },
  { key: "[ADICIONAIS]", desc: "Complementos/adicionais do item" },
  { key: "[CÓDIGOPROD]", desc: "Código do produto com acento" },
  { key: "[CODIGOPROD]", desc: "Código do produto sem acento" },

  { key: "[LOGOLOJA]", desc: "Logotipo enviado no modelo da comanda/panfleto" },
  { key: "[LOGOLOJA_LARGURA]", desc: "Largura do logotipo em milímetros" },
  { key: "[IMAGEM]", desc: "Imagem enviada para impressão" },
  { key: "[IMAGEMPANFLETO]", desc: "Imagem inteira do panfleto" },
  { key: "[IMAGEM_LARGURA]", desc: "Largura da imagem em milímetros" },

  { key: "[MARCA]", desc: "Marca do ingrediente/item selecionado na etiqueta" },
  { key: "[DATAFABRICACAO]", desc: "Data de fabricação da etiqueta" },
  { key: "[VALIDADE]", desc: "Data de validade da etiqueta" },
  { key: "[RESPONSAVEL]", desc: "Responsável pela produção/preparo" },
  { key: "[RESFRIADO]", desc: "Exibe RESFRIADO quando selecionado" },
  { key: "[CONGELADO]", desc: "Exibe CONGELADO quando selecionado" },
  { key: "[ARMAZENAR]", desc: "Tipo de armazenamento: RESFRIADO / CONGELADO / AMBIENTE" },
  { key: "[GRAUS]", desc: "Temperatura em °C" },
  { key: "[FRASEARMAZ]", desc: "Frase configurável de armazenamento" },

  { key: "[NOMEPRODUTO]", desc: "Nome do produto na etiqueta de preço" },
  { key: "[TITULO]", desc: "Título da lista de reposição" },
  { key: "[TOTALITENS]", desc: "Quantidade total de itens marcados" },
  { key: "[LISTA]", desc: "Lista dinâmica de reposição" },

  { key: "[PERIODO]", desc: "Período do relatório" },
  { key: "[LINHAS]", desc: "Linhas dinâmicas do relatório" },
  { key: "[TOTALENTREGAS]", desc: "Total de entregas do relatório" },
  { key: "[TOTALTAXAS]", desc: "Total das taxas de entrega" },
  { key: "[TAXAFIXA]", desc: "Taxa fixa do entregador" },
  { key: "[TOTALENTREGADOR]", desc: "Total a pagar ao entregador" },
];

const FORMATTING = [
  { marker: "---", desc: "Linha separadora tracejada" },
  { marker: "[CENTRO]texto[/CENTRO]", desc: "Centraliza o texto dentro da mesma margem da comanda" },
  { marker: "[DIREITA]texto[/DIREITA]", desc: "Alinha o texto à direita" },
  { marker: "[GRANDE]texto[/GRANDE]", desc: "Texto grande; se não couber, quebra linha mantendo o tamanho" },
  { marker: "[CAIXA]texto[/CAIXA]", desc: "Texto em caixa com borda espessa" },
  { marker: "[DESTAQUE]texto[/DESTAQUE]", desc: "Texto grande destacado com fundo preto ponta a ponta" },
  { marker: "[NEGRITO]texto[/NEGRITO]", desc: "Texto em negrito maior" },
  { marker: "[TXTMEDIO]texto[/TXTMEDIO]", desc: "Texto médio: aumenta altura sem estourar a largura" },
  { marker: "[TXTPEQUENO]texto[/TXTPEQUENO]", desc: "Texto menor" },
  { marker: "[TXTGIGANTE]texto[/TXTGIGANTE]", desc: "Texto muito grande; quebra linha se necessário" },
  { marker: "[TZTBORDA]texto[/TZTBORDA]", desc: "Fundo preto ponta a ponta; em itens mantém 1x/2x legível" },
  { marker: "[TXTBORDA]texto[/TXTBORDA]", desc: "Igual [TZTBORDA], fundo preto ponta a ponta" },
  { marker: "[TXTBORDATXT]texto[/TXTBORDATXT]", desc: "Fundo preto apenas no bloco do texto" },
  { marker: "[FUNDPRETO]texto[/FUNDPRETO]", desc: "Fundo preto no texto/bloco" },
  { marker: "[BORDA]texto[/BORDA]", desc: "Moldura fina ao redor do texto" },
  { marker: "[QUADRADO] ... [/QUADRADO]", desc: "Bloco com moldura fina, abrir e fechar" },
  { marker: "[QUADRADONEGRITO] ... [/QUADRADONEGRITO]", desc: "Bloco com moldura grossa, abrir e fechar" },
  { marker: "[RETANGULO] ... [/RETANGULO]", desc: "Bloco com bordas de ponta a ponta, abrir e fechar" },
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
        <div className="border-t border-border px-4 pb-4 space-y-4">
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
                  <span className="text-xs text-muted-foreground truncate flex-1">{v.desc}</span>
                  {copied === v.key ? (
                    <Check size={12} className="text-green-500 shrink-0" />
                  ) : (
                    <Copy size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Formatação</h4>
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
                  <span className="text-xs text-muted-foreground truncate flex-1">{f.desc}</span>
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
