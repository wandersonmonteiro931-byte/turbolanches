import { useEffect, useRef } from "react";

/**
 * Faz com que qualquer tecla digitada no documento (sem foco em outro input)
 * envie o foco para o input de busca alvo. Aceita também caracteres impressos
 * — esses são adicionados ao valor do input via onChange-like simulation.
 *
 * Funciona com inputs controlados quando se passa `onAppend` para acrescentar
 * caractere ao state. Se o input for não-controlado, basta focar e deixar o
 * próprio teclado escrever.
 */
export const useGlobalKeyboardSearch = (
  inputRef: React.RefObject<HTMLInputElement>,
  onAppend?: (text: string) => void,
  options: { enabled?: boolean } = {},
) => {
  const enabled = options.enabled !== false;
  const onAppendRef = useRef(onAppend);
  onAppendRef.current = onAppend;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Ignorar se já está digitando em outro campo editável
      if (target) {
        const tag = target.tagName;
        const editable =
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          (target as HTMLElement).isContentEditable;
        if (editable) return;
      }
      // Ignorar combinações de teclas (atalhos)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const input = inputRef.current;
      if (!input) return;

      // Backspace -> apaga último char
      if (e.key === "Backspace") {
        if (onAppendRef.current) {
          onAppendRef.current("\b");
        }
        input.focus();
        e.preventDefault();
        return;
      }

      // Escape -> limpa
      if (e.key === "Escape") {
        if (onAppendRef.current) onAppendRef.current("");
        input.focus();
        return;
      }

      // Apenas caracteres imprimíveis (1 char) ou espaço
      if (e.key.length === 1) {
        if (onAppendRef.current) {
          onAppendRef.current(e.key);
          e.preventDefault();
        }
        input.focus();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, inputRef]);
};
