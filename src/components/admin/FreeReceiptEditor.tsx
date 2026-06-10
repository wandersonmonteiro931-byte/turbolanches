import { useEffect, useRef, useState } from "react";
import { Save, RotateCcw, Printer } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import ReceiptVariableReference from "@/components/admin/ReceiptVariableReference";

export interface FreeReceiptEditorProps {
  /** Título exibido acima do editor. */
  title?: string;
  /** Conteúdo inicial do template. */
  value: string;
  /** Valor padrão usado pelo botão "Restaurar". */
  defaultValue?: string;
  /** Disparado a cada alteração no textarea. */
  onChange?: (value: string) => void;
  /** Disparado ao clicar em "Salvar". Recebe o conteúdo atual. */
  onSave?: (value: string) => void | Promise<void>;
  /** Disparado ao clicar em "Imprimir teste". */
  onPrintTest?: (value: string) => void | Promise<void>;
  /** Desabilita os botões enquanto uma ação está em andamento. */
  saving?: boolean;
  /** Placeholder do textarea. */
  placeholder?: string;
  /** Altura mínima do editor em px. */
  minHeight?: number;
}

/**
 * Editor livre de modelos de impressão.
 *
 * Exibe um textarea monoespaçado com o painel de variáveis ao lado,
 * permitindo editar livremente o corpo de qualquer comanda/etiqueta/relatório.
 * Não acopla regras de salvamento — delegue via `onSave`.
 */
const FreeReceiptEditor = ({
  title = "Editor Livre",
  value,
  defaultValue,
  onChange,
  onSave,
  onPrintTest,
  saving = false,
  placeholder = "Digite o conteúdo da impressão. Use variáveis como [NUMEROPEDIDO], [ITENS], etc.",
  minHeight = 480,
}: FreeReceiptEditorProps) => {
  const [draft, setDraft] = useState(value ?? "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  const update = (next: string) => {
    setDraft(next);
    onChange?.(next);
  };

  const handleRestore = () => {
    if (defaultValue === undefined) return;
    update(defaultValue);
  };

  const handleSave = () => {
    onSave?.(draft);
  };

  const handlePrintTest = () => {
    onPrintTest?.(draft);
  };

  const insertAtCursor = (snippet: string) => {
    const el = textareaRef.current;
    if (!el) {
      update(draft + snippet);
      return;
    }
    const start = el.selectionStart ?? draft.length;
    const end = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + snippet + draft.slice(end);
    update(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-sm font-semibold text-foreground">{title}</Label>
          <div className="flex flex-wrap items-center gap-2">
            {defaultValue !== undefined && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={saving}
                className="gap-1"
              >
                <RotateCcw size={14} />
                Restaurar
              </Button>
            )}
            {onPrintTest && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrintTest}
                disabled={saving}
                className="gap-1"
              >
                <Printer size={14} />
                Imprimir teste
              </Button>
            )}
            {onSave && (
              <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                <Save size={14} />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            )}
          </div>
        </div>

        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => update(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          style={{ minHeight }}
          className="font-mono text-sm leading-relaxed"
        />

        <p className="text-xs text-muted-foreground">
          Dica: clique em uma variável no painel ao lado para copiar e colar no ponto desejado.
        </p>
      </div>

      <div className="space-y-3">
        <ReceiptVariableReference />
        <div className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          <div className="mb-2 font-semibold text-foreground">Inserir rápido</div>
          <div className="flex flex-wrap gap-1">
            {["---", "[CENTRO][/CENTRO]", "[NEGRITO][/NEGRITO]", "[GRANDE][/GRANDE]", "[ITENS]"].map((snippet) => (
              <button
                key={snippet}
                type="button"
                onClick={() => insertAtCursor(snippet)}
                className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[11px] text-primary hover:bg-muted"
              >
                {snippet}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FreeReceiptEditor;
