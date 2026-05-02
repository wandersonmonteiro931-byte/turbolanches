import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2, Plus, Sparkles, Terminal, Trash2, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  actions?: string[];
};

const WELCOME_MSG: ChatMessage = {
  role: "assistant",
  content:
    "Sou a IA de correção do sistema. Posso interpretar comandos do painel, ler dados da loja e executar ajustes administrativos em tempo real quando possível.",
};

const quickCommands = [
  "Leia as configurações atuais da loja e me resuma o que precisa ser corrigido.",
  "Verifique as regras da raspadinha e me diga se há inconsistências.",
  "Abra a loja manualmente agora e confirme a alteração.",
  "Leia as comandas e sugira melhorias no texto antes de alterar.",
];

const endpoint = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-ai-control`;

const AdminAiControl = () => {
  const { session, user } = useAuth();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MSG]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("ai_chat_messages")
      .select("role, content, actions")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) {
          setMessages([
            WELCOME_MSG,
            ...data.map((m: any) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              actions: m.actions?.length ? m.actions : undefined,
            })),
          ]);
        }
        setHistoryLoaded(true);
      });
  }, [user?.id]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const persistMessage = useCallback(
    async (role: string, content: string, actions?: string[]) => {
      if (!user?.id) return;
      await supabase.from("ai_chat_messages").insert({
        user_id: user.id,
        role,
        content,
        actions: actions || [],
      });
    },
    [user?.id],
  );

  const canSend = useMemo(() => !!input.trim() && !!session?.access_token && !isLoading, [input, session, isLoading]);

  const sendMessage = async (preset?: string) => {
    const content = (preset ?? input).trim();
    if (!content || !session?.access_token || isLoading) return;

    const userMsg: ChatMessage = { role: "user", content };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    await persistMessage("user", content);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          messages: nextMessages.map(({ role, content: c }) => ({ role, content: c })),
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível executar o comando agora.");

      const assistantActions = Array.isArray(data?.actions) ? data.actions : [];
      const assistantContent = data?.message || "Concluído.";

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: assistantContent,
        actions: assistantActions.length ? assistantActions : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      await persistMessage("assistant", assistantContent, assistantActions);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro inesperado ao falar com a IA.";
      toast({ title: message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!user?.id) return;
    await supabase.from("ai_chat_messages").delete().eq("user_id", user.id);
    setMessages([WELCOME_MSG]);
    toast({ title: "Histórico limpo com sucesso." });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
              <Sparkles size={14} className="text-primary" />
              Correção de erros com IA
            </div>
            <h2 className="text-2xl font-bold text-foreground">IA operacional do sistema</h2>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Envie comandos em linguagem natural para a IA ler o sistema, interpretar pedidos e aplicar ajustes administrativos em tempo real no painel.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Autorização ativa</p>
            <p>Leitura, análise e alterações administrativas em tempo real.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bot size={16} className="text-primary" />
              Conversa com a IA
            </div>
            <div className="flex gap-2">
              <button
                onClick={clearHistory}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <Trash2 size={12} />
                Limpar
              </button>
              <button
                onClick={() => setMessages([WELCOME_MSG])}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
              >
                <Plus size={12} />
                Nova conversa
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="space-y-3 max-h-[55vh] overflow-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={message.role === "user" ? "ml-auto max-w-[85%]" : "mr-auto max-w-[90%]"}
              >
                <div
                  className={message.role === "user"
                    ? "rounded-2xl rounded-br-md bg-primary px-4 py-3 text-sm text-primary-foreground"
                    : "rounded-2xl rounded-bl-md border border-border bg-background px-4 py-3 text-sm text-foreground"
                  }
                >
                  <div className="prose prose-sm max-w-none text-inherit prose-p:my-2 prose-strong:text-inherit prose-li:text-inherit prose-headings:text-inherit">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                  </div>
                </div>

                {!!message.actions?.length && (
                  <div className="mt-2 rounded-xl border border-border bg-muted/50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ações executadas
                    </p>
                    <ul className="space-y-1 text-sm text-foreground">
                      {message.actions.map((action, actionIndex) => (
                        <li key={`${index}-${actionIndex}`} className="flex gap-2">
                          <Wrench size={14} className="mt-0.5 shrink-0 text-primary" />
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="mr-auto max-w-[90%] rounded-2xl rounded-bl-md border border-border bg-background px-4 py-3 text-sm text-foreground">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TurboLoader size={22} />
                  Processando comando e aplicando correções...
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-4">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ex: leia as regras da raspadinha, corrija a mensagem principal e abra a loja manualmente"
              rows={4}
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition-[box-shadow] placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                A IA interpreta comandos, lê dados operacionais e executa ajustes administrativos permitidos.
              </p>
              <button
                onClick={() => sendMessage()}
                disabled={!canSend}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Terminal size={16} />}
                {isLoading ? "Executando" : "Executar comando"}
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">Comandos rápidos</h3>
            <div className="space-y-2">
              {quickCommands.map((command) => (
                <button
                  key={command}
                  onClick={() => sendMessage(command)}
                  disabled={isLoading}
                  className="w-full rounded-xl border border-border bg-background px-3 py-3 text-left text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {command}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">O que esta seção faz</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• lê configurações da loja, comandas, conteúdos e regras da raspadinha</li>
              <li>• interpreta instruções administrativas em linguagem natural</li>
              <li>• aplica alterações operacionais imediatamente quando permitido</li>
              <li>• responde em linguagem simples com o resumo do que foi feito</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default AdminAiControl;
