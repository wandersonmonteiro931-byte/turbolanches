import { useState, useEffect, useMemo } from "react";
import { Calculator as CalcIcon, X, Trash2, ArrowLeft, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Op = "+" | "-" | "*" | "/" | null;

interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  type: "calc" | "change";
  at: number;
}

const STORAGE_KEY = "admin_calculator_history_v1";

const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const opLabel = (o: Op) => (o === "*" ? "×" : o === "/" ? "÷" : o ?? "");

interface Props {
  open: boolean;
  onClose: () => void;
}

const CalculatorModal = ({ open, onClose }: Props) => {
  const [display, setDisplay] = useState("0");
  const [previous, setPrevious] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [waitingNew, setWaitingNew] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Change mode
  const [mode, setMode] = useState<"calc" | "change">("calc");
  const [received, setReceived] = useState("");
  const [total, setTotal] = useState("");
  const [activeChangeField, setActiveChangeField] = useState<"received" | "total">("received");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
    } catch {}
  }, [history]);

  const reset = () => {
    setDisplay("0");
    setPrevious(null);
    setOp(null);
    setWaitingNew(false);
  };

  const compute = (a: number, b: number, o: Op): number => {
    switch (o) {
      case "+": return a + b;
      case "-": return a - b;
      case "*": return a * b;
      case "/": return b === 0 ? 0 : a / b;
      default: return b;
    }
  };

  const inputDigit = (d: string) => {
    if (mode === "change") {
      const setter = activeChangeField === "received" ? setReceived : setTotal;
      const cur = activeChangeField === "received" ? received : total;
      if (d === "." && cur.includes(".")) return;
      setter(cur === "0" || cur === "" ? (d === "." ? "0." : d) : cur + d);
      return;
    }
    if (waitingNew) {
      setDisplay(d === "." ? "0." : d);
      setWaitingNew(false);
      return;
    }
    if (d === "." && display.includes(".")) return;
    setDisplay(display === "0" && d !== "." ? d : display + d);
  };

  const inputOp = (next: Op) => {
    const cur = parseFloat(display);
    if (previous === null) {
      setPrevious(cur);
    } else if (!waitingNew && op) {
      const result = compute(previous, cur, op);
      const expr = `${formatBRL(previous)} ${opLabel(op)} ${formatBRL(cur)}`;
      setHistory((h) => [
        { id: crypto.randomUUID(), expression: expr, result: formatBRL(result), type: "calc", at: Date.now() },
        ...h,
      ]);
      setPrevious(result);
      setDisplay(formatBRL(result).replace(/\./g, "").replace(",", "."));
    }
    setOp(next);
    setWaitingNew(true);
  };

  const equals = () => {
    if (op === null || previous === null) return;
    const cur = parseFloat(display);
    const result = compute(previous, cur, op);
    const expr = `${formatBRL(previous)} ${opLabel(op)} ${formatBRL(cur)}`;
    setHistory((h) => [
      { id: crypto.randomUUID(), expression: expr, result: formatBRL(result), type: "calc", at: Date.now() },
      ...h,
    ]);
    setDisplay(String(result));
    setPrevious(null);
    setOp(null);
    setWaitingNew(true);
  };

  const backspace = () => {
    if (mode === "change") {
      const setter = activeChangeField === "received" ? setReceived : setTotal;
      const cur = activeChangeField === "received" ? received : total;
      setter(cur.length <= 1 ? "" : cur.slice(0, -1));
      return;
    }
    if (waitingNew) return;
    setDisplay(display.length <= 1 ? "0" : display.slice(0, -1));
  };

  const change = useMemo(() => {
    const r = parseFloat(received || "0");
    const t = parseFloat(total || "0");
    return r - t;
  }, [received, total]);

  const confirmChange = () => {
    if (!received || !total) return;
    const r = parseFloat(received);
    const t = parseFloat(total);
    setHistory((h) => [
      {
        id: crypto.randomUUID(),
        expression: `Troco: recebido ${formatBRL(r)} − total ${formatBRL(t)}`,
        result: formatBRL(r - t),
        type: "change",
        at: Date.now(),
      },
      ...h,
    ]);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      const k = e.key;
      if (/^[0-9]$/.test(k)) { e.preventDefault(); inputDigit(k); return; }
      if (k === "." || k === ",") { e.preventDefault(); inputDigit("."); return; }
      if (k === "Backspace") { e.preventDefault(); backspace(); return; }
      if (k === "Escape") { e.preventDefault(); mode === "calc" ? reset() : (setReceived(""), setTotal("")); return; }
      if (mode === "calc") {
        if (k === "+" || k === "-" || k === "*" || k === "/") { e.preventDefault(); inputOp(k as Op); return; }
        if (k === "Enter" || k === "=") { e.preventDefault(); equals(); return; }
      } else {
        if (k === "Tab") { e.preventDefault(); setActiveChangeField((f) => f === "received" ? "total" : "received"); return; }
        if (k === "Enter") { e.preventDefault(); confirmChange(); return; }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, mode, display, previous, op, waitingNew, received, total, activeChangeField]);

  const Btn = ({
    children, onClick, variant = "num", className,
  }: { children: React.ReactNode; onClick: () => void; variant?: "num" | "op" | "eq" | "fn"; className?: string }) => (
    <button
      onClick={onClick}
      className={cn(
        "h-12 rounded-lg text-lg font-bold transition-colors active:scale-95",
        variant === "num" && "bg-muted hover:bg-muted/70 text-foreground",
        variant === "op" && "bg-secondary hover:bg-secondary/70 text-secondary-foreground",
        variant === "fn" && "bg-destructive/10 hover:bg-destructive/20 text-destructive",
        variant === "eq" && "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {children}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[min(92vh,760px)] w-[calc(100vw-20px)] max-w-[980px] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2">
            <CalcIcon size={20} /> Calculadora
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_270px] lg:gap-4 lg:p-4">
          {/* Calculator */}
          <div className="min-h-0 overflow-y-auto pr-1 space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => setMode("calc")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold",
                  mode === "calc" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <CalcIcon size={14} className="mr-1 inline" /> Calcular
              </button>
              <button
                onClick={() => setMode("change")}
                className={cn(
                  "flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold",
                  mode === "change" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                <Banknote size={14} className="mr-1 inline" /> Devolver Troco
              </button>
            </div>

            {mode === "calc" ? (
              <>
                <div className="rounded-xl border border-border bg-card p-3.5">
                  <div className="min-h-[20px] text-right text-xs text-muted-foreground">
                    {previous !== null ? `${formatBRL(previous)} ${opLabel(op)}` : "\u00A0"}
                  </div>
                  <div className="break-all text-right text-3xl font-bold text-foreground md:text-4xl">
                    {display.includes(".") ? display : display}
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  <Btn variant="fn" onClick={reset}>C</Btn>
                  <Btn variant="fn" onClick={backspace}><ArrowLeft size={20} className="mx-auto" /></Btn>
                  <Btn variant="op" onClick={() => inputOp("/")}>÷</Btn>
                  <Btn variant="op" onClick={() => inputOp("*")}>×</Btn>

                  <Btn onClick={() => inputDigit("7")}>7</Btn>
                  <Btn onClick={() => inputDigit("8")}>8</Btn>
                  <Btn onClick={() => inputDigit("9")}>9</Btn>
                  <Btn variant="op" onClick={() => inputOp("-")}>−</Btn>

                  <Btn onClick={() => inputDigit("4")}>4</Btn>
                  <Btn onClick={() => inputDigit("5")}>5</Btn>
                  <Btn onClick={() => inputDigit("6")}>6</Btn>
                  <Btn variant="op" onClick={() => inputOp("+")}>+</Btn>

                  <Btn onClick={() => inputDigit("1")}>1</Btn>
                  <Btn onClick={() => inputDigit("2")}>2</Btn>
                  <Btn onClick={() => inputDigit("3")}>3</Btn>
                  <Btn variant="eq" onClick={equals} className="row-span-2 h-auto">=</Btn>

                  <Btn onClick={() => inputDigit("0")} className="col-span-2">0</Btn>
                  <Btn onClick={() => inputDigit(".")}>,</Btn>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveChangeField("total")}
                    className={cn(
                      "w-full rounded-xl border-2 bg-card p-3 text-left transition-colors",
                      activeChangeField === "total" ? "border-primary" : "border-border",
                    )}
                  >
                    <div className="text-xs font-semibold text-muted-foreground">TOTAL DA COMPRA</div>
                    <div className="text-[30px] font-bold leading-none text-foreground">
                      R$ {total ? formatBRL(parseFloat(total)) : "0,00"}
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveChangeField("received")}
                    className={cn(
                      "w-full rounded-xl border-2 bg-card p-3 text-left transition-colors",
                      activeChangeField === "received" ? "border-primary" : "border-border",
                    )}
                  >
                    <div className="text-xs font-semibold text-muted-foreground">VALOR RECEBIDO</div>
                    <div className="text-[30px] font-bold leading-none text-foreground">
                      R$ {received ? formatBRL(parseFloat(received)) : "0,00"}
                    </div>
                  </button>
                </div>

                <div className="rounded-2xl bg-primary p-4 text-center text-primary-foreground shadow-lg">
                  <div className="text-xs font-semibold uppercase opacity-90">Troco a devolver</div>
                  <div className="break-all text-4xl font-black tracking-tight md:text-5xl">
                    R$ {formatBRL(Math.max(0, change))}
                  </div>
                  {change < 0 && (
                    <div className="mt-1 text-sm font-semibold">
                      Falta R$ {formatBRL(Math.abs(change))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {["7","8","9","4","5","6","1","2","3"].map((d) => (
                    <Btn key={d} onClick={() => inputDigit(d)}>{d}</Btn>
                  ))}
                  <Btn onClick={() => inputDigit(".")}>,</Btn>
                  <Btn onClick={() => inputDigit("0")}>0</Btn>
                  <Btn variant="fn" onClick={backspace}><ArrowLeft size={20} className="mx-auto" /></Btn>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  <Button variant="outline" onClick={() => { setReceived(""); setTotal(""); }}>
                    Limpar
                  </Button>
                  <Button onClick={confirmChange} disabled={!received || !total}>
                    Salvar no histórico
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* History */}
          <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Histórico</h3>
              {history.length > 0 && (
                <button
                  onClick={() => setHistory([])}
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                  title="Limpar histórico"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
            <div className="h-full max-h-[calc(92vh-170px)] space-y-2 overflow-y-auto pr-1 md:max-h-none">
              {history.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">Nenhum cálculo ainda</p>
              ) : (
                history.map((h) => (
                  <div
                    key={h.id}
                    className={cn(
                      "rounded-lg border p-2",
                      h.type === "change"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-background",
                    )}
                  >
                    <div className="text-xs text-muted-foreground">{h.expression}</div>
                    <div className="text-base font-bold text-foreground">= R$ {h.result}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CalculatorModal;
