import { useState, useEffect } from "react";
import { Bell, Send, Users, User, Search, Clock, CheckCircle, XCircle, Settings, Save, Plus, Trash2, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useStore } from "@/contexts/StoreContext";
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

interface PushTemplate {
  id: string;
  trigger_status: string;
  title: string;
  body: string;
  active: boolean;
}

interface PushSubscriber {
  user_id: string;
  created_at: string;
  full_name: string;
  phone: string;
  customer_code: number;
  subscription_count: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pedido Recebido",
  paid: "Pagamento Confirmado",
  accepted: "Pedido Aceito",
  preparing: "Em Preparo",
  ready_delivery: "Pronto (Delivery)",
  ready_pickup: "Pronto (Retirada)",
  delivering: "Saiu p/ Entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const AdminNotifications = () => {
  const { user } = useAuth();
  const { storeId } = useStore();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetType, setTargetType] = useState<"all" | "selected">("all");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<NotificationLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Templates
  const [templates, setTemplates] = useState<PushTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [newTrigger, setNewTrigger] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  // Subscribers
  const [subscribers, setSubscribers] = useState<PushSubscriber[]>([]);
  const [loadingSubscribers, setLoadingSubscribers] = useState(true);

  useEffect(() => {
    loadProfiles();
    loadHistory();
    loadTemplates();
    loadSubscribers();
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

  const loadTemplates = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("push_templates")
      .select("*")
      .eq("store_id", storeId)
      .order("created_at");
    if (data) setTemplates(data as PushTemplate[]);
    setLoadingTemplates(false);
  };

  const loadSubscribers = async () => {
    try {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("user_id, created_at");

      if (!subs || subs.length === 0) {
        setSubscribers([]);
        setLoadingSubscribers(false);
        return;
      }

      const userMap = new Map<string, { count: number; earliest: string }>();
      for (const s of subs) {
        const existing = userMap.get(s.user_id);
        if (existing) {
          existing.count++;
          if (s.created_at && s.created_at < existing.earliest) existing.earliest = s.created_at;
        } else {
          userMap.set(s.user_id, { count: 1, earliest: s.created_at || "" });
        }
      }

      const userIds = Array.from(userMap.keys());
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, customer_code")
        .in("user_id", userIds);

      const result: PushSubscriber[] = userIds.map((uid) => {
        const prof = profs?.find((p) => p.user_id === uid);
        const info = userMap.get(uid)!;
        return {
          user_id: uid,
          created_at: info.earliest,
          full_name: prof?.full_name || "Sem nome",
          phone: prof?.phone || "",
          customer_code: prof?.customer_code || 0,
          subscription_count: info.count,
        };
      });

      setSubscribers(result);
    } catch (err) {
      console.error("Error loading subscribers:", err);
    } finally {
      setLoadingSubscribers(false);
    }
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

  const updateTemplate = (id: string, field: keyof PushTemplate, value: any) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const saveTemplates = async () => {
    setSavingTemplates(true);
    try {
      for (const t of templates) {
        await supabase
          .from("push_templates")
          .update({ title: t.title, body: t.body, active: t.active, updated_at: new Date().toISOString() })
          .eq("id", t.id);
      }
      toast.success("Templates salvos!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar");
    } finally {
      setSavingTemplates(false);
    }
  };

  const addTemplate = async () => {
    if (!newTrigger.trim() || !newTitle.trim() || !newBody.trim()) {
      toast.error("Preencha todos os campos do novo template");
      return;
    }
    const { data, error } = await supabase
      .from("push_templates")
      .insert({ trigger_status: newTrigger.trim(), title: newTitle.trim(), body: newBody.trim() })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setTemplates((prev) => [...prev, data as PushTemplate]);
    setNewTrigger("");
    setNewTitle("");
    setNewBody("");
    toast.success("Template adicionado!");
  };

  const deleteTemplate = async (id: string) => {
    await supabase.from("push_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    toast.success("Template removido");
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
      {/* Templates Section */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
            <Settings size={20} className="text-primary" />
            Mensagens Automáticas
          </h2>
          <button
            onClick={saveTemplates}
            disabled={savingTemplates}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] disabled:opacity-50"
          >
            <Save size={14} />
            {savingTemplates ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <p className="mb-3 text-xs text-muted-foreground">
          Personalize as notificações enviadas automaticamente a cada mudança de status.
          Use <code className="rounded bg-muted px-1 font-mono text-primary">{"{nome}"}</code> para o nome do cliente e <code className="rounded bg-muted px-1 font-mono text-primary">{"{pedido}"}</code> para o número do pedido.
        </p>

        {loadingTemplates ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <div
                key={t.id}
                className={`rounded-lg border p-3 transition-colors ${
                  t.active ? "border-border bg-background" : "border-border/50 bg-muted/50 opacity-60"
                }`}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    {STATUS_LABELS[t.trigger_status] || t.trigger_status}
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={t.active}
                        onChange={(e) => updateTemplate(t.id, "active", e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-border accent-primary"
                      />
                      Ativo
                    </label>
                    {!STATUS_LABELS[t.trigger_status] && (
                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="text-destructive hover:text-destructive/80"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  value={t.title}
                  onChange={(e) => updateTemplate(t.id, "title", e.target.value)}
                  placeholder="Título"
                  className="mb-1.5 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm font-semibold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <textarea
                  value={t.body}
                  onChange={(e) => updateTemplate(t.id, "body", e.target.value)}
                  placeholder="Mensagem... use {nome} e {pedido}"
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}

            {/* Add new template */}
            <div className="rounded-lg border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-bold text-muted-foreground">Adicionar Novo Template</p>
              <input
                value={newTrigger}
                onChange={(e) => setNewTrigger(e.target.value)}
                placeholder="Gatilho (ex: promo_semanal)"
                className="mb-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Título"
                className="mb-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                placeholder="Mensagem... use {nome} e {pedido}"
                rows={2}
                className="mb-2 w-full resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                onClick={addTemplate}
                className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
              >
                <Plus size={14} />
                Adicionar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Send Form */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <Bell size={20} className="text-primary" />
          Enviar Notificação Manual
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

      {/* Subscribers */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-foreground">
          <Smartphone size={20} className="text-primary" />
          Assinantes Push ({subscribers.length})
        </h2>

        {loadingSubscribers ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : subscribers.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum cliente ativou as notificações ainda
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3 rounded-lg bg-primary/10 p-3">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{subscribers.length}</p>
                <p className="text-xs text-muted-foreground">Ativaram</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {subscribers.reduce((acc, s) => acc + s.subscription_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Dispositivos</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">
                  {history.reduce((acc, h) => acc + h.sent_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Enviadas</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">
                  {history.reduce((acc, h) => acc + h.failed_count, 0)}
                </p>
                <p className="text-xs text-muted-foreground">Falharam</p>
              </div>
            </div>

            <div className="space-y-2">
              {subscribers.map((s) => (
                <div
                  key={s.user_id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      T{String(s.customer_code).padStart(5, "0")}
                      {s.phone ? ` • ${s.phone}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                      {s.subscription_count} disp.
                    </span>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {s.created_at ? format(new Date(s.created_at), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AdminNotifications;
