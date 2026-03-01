import { useState, useEffect } from "react";
import { Bell, Send, Users, User, Search, Clock, CheckCircle, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  customer_code: number;
}

interface NotificationLog {
  id: string;
  title: string;
  body: string;
  target_type: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

const AdminNotifications = () => {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all" | "selected">("all");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<NotificationLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    loadProfiles();
    loadHistory();
  }, []);

  const loadProfiles = async () => {
    const { data } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, phone, customer_code")
      .order("full_name");
    if (data) setProfiles(data);
  };

  const loadHistory = async () => {
    const { data } = await supabase
      .from("push_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setHistory(data as NotificationLog[]);
    setLoadingHistory(false);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Preencha título e mensagem");
      return;
    }
    if (targetType === "selected" && selectedUsers.length === 0) {
      toast.error("Selecione ao menos um cliente");
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("push-notification", {
        body: {
          action: "send",
          title,
          body,
          icon: "/favicon.ico",
          target_type: targetType,
          target_ids: targetType === "selected" ? selectedUsers : [],
          sent_by: user?.id,
        },
      });

      if (error) throw error;

      toast.success(
        `Enviado: ${data.sent_count} sucesso, ${data.failed_count} falhas`
      );
      setTitle("");
      setBody("");
      setSelectedUsers([]);
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || "Erro ao enviar");
    } finally {
      setSending(false);
    }
  };

  const toggleUser = (userId: string) => {
    setSelectedUsers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const filteredProfiles = profiles.filter((p) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      p.full_name.toLowerCase().includes(q) ||
      p.phone.includes(q) ||
      `T${String(p.customer_code).padStart(5, "0")}`.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Send Form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <Bell size={20} className="text-primary" />
          Enviar Notificação Push
        </h2>

        <div className="space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da notificação"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Mensagem..."
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {/* Target selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setTargetType("all")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                targetType === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Users size={16} />
              Todos
            </button>
            <button
              onClick={() => setTargetType("selected")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                targetType === "selected"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <User size={16} />
              Selecionar
            </button>
          </div>

          {/* User selection */}
          {targetType === "selected" && (
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                <Search size={16} className="text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cliente..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
              {selectedUsers.length > 0 && (
                <p className="mb-2 text-xs text-primary font-medium">
                  {selectedUsers.length} selecionado(s)
                </p>
              )}
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {filteredProfiles.map((p) => (
                  <button
                    key={p.user_id}
                    onClick={() => toggleUser(p.user_id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      selectedUsers.includes(p.user_id)
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <div
                      className={`h-4 w-4 shrink-0 rounded border ${
                        selectedUsers.includes(p.user_id)
                          ? "border-primary bg-primary"
                          : "border-border"
                      }`}
                    >
                      {selectedUsers.includes(p.user_id) && (
                        <CheckCircle size={16} className="text-primary-foreground" />
                      )}
                    </div>
                    <span className="font-medium">{p.full_name || "Sem nome"}</span>
                    <span className="text-xs text-muted-foreground">
                      T{String(p.customer_code).padStart(5, "0")}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSend}
            disabled={sending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-bold text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Send size={18} />
            {sending ? "Enviando..." : "Enviar Notificação"}
          </button>
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <Clock size={20} className="text-muted-foreground" />
          Histórico de Envios
        </h2>

        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma notificação enviada ainda
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-border bg-background p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{n.title}</p>
                    <p className="text-sm text-muted-foreground">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(n.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-primary">
                    <CheckCircle size={12} /> {n.sent_count}
                  </span>
                  {n.failed_count > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <XCircle size={12} /> {n.failed_count}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {n.target_type === "all" ? "Todos" : "Selecionados"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;
