import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Search, ChevronDown, ChevronUp, Save, Plus, X, History } from "lucide-react";
import CustomerSearch from "@/components/admin/CustomerSearch";
import { useGlobalKeyboardSearch } from "@/hooks/useGlobalKeyboardSearch";

interface Profile {
  user_id: string;
  customer_code: number;
  full_name: string;
  phone: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string | null;
  quadra: string;
  lote: string;
  city: string;
  state: string;
  zip_code: string;
  created_at: string;
}

interface ProfileChange {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_by_role: string;
  created_at: string;
}

interface OrderSummary {
  id: string;
  order_number: number;
  status: string;
  total: number;
  payment_method: string;
  payment_confirmed: boolean;
  delivery_type: string;
  created_at: string;
}

interface Address {
  id: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string | null;
  quadra: string;
  lote: string;
  is_default: boolean;
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  preparing: "Preparando",
  ready: "Pronto",
  delivering: "Entregando",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const AdminCustomers = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useGlobalKeyboardSearch(searchInputRef, (text) => {
    if (text === "") setSearchQuery("");
    else if (text === "\b") setSearchQuery((s) => s.slice(0, -1));
    else setSearchQuery((s) => s + text);
  });
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, OrderSummary[]>>({});
  const [addresses, setAddresses] = useState<Record<string, Address[]>>({});
  const [changes, setChanges] = useState<Record<string, ProfileChange[]>>({});
  const [editingProfile, setEditingProfile] = useState<Record<string, Partial<Profile>>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newZipCode, setNewZipCode] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newNeighborhood, setNewNeighborhood] = useState("");
  const [newQuadra, setNewQuadra] = useState("");
  const [newLote, setNewLote] = useState("");
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState<string | null>(null);

  const fetchProfiles = useCallback(async () => {
    let query = supabase.from("profiles").select("user_id, customer_code, full_name, phone, street, number, neighborhood, complement, quadra, lote, city, state, zip_code, created_at").order("customer_code", { ascending: true });

    if (searchQuery.length >= 2) {
      const codeMatch = searchQuery.match(/^T?(\d+)$/i);
      if (codeMatch) {
        query = query.eq("customer_code", parseInt(codeMatch[1], 10));
      } else {
        const term = `%${searchQuery}%`;
        query = query.or(`full_name.ilike.${term},phone.ilike.${term},street.ilike.${term},neighborhood.ilike.${term}`);
      }
    }

    const { data } = await query.limit(50);
    setProfiles((data as Profile[]) || []);
  }, [searchQuery]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  const fetchCustomerDetails = async (userId: string) => {
    if (orders[userId]) return;

    const [ordersRes, addressesRes, changesRes] = await Promise.all([
      supabase.from("orders").select("id, order_number, status, total, payment_method, payment_confirmed, delivery_type, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10000),
      supabase.from("customer_addresses").select("id, label, street, number, neighborhood, complement, quadra, lote, is_default").eq("user_id", userId),
      supabase.from("profile_changes").select("id, field_name, old_value, new_value, changed_by_role, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);

    setOrders((prev) => ({ ...prev, [userId]: (ordersRes.data as OrderSummary[]) || [] }));
    setAddresses((prev) => ({ ...prev, [userId]: (addressesRes.data as Address[]) || [] }));
    setChanges((prev) => ({ ...prev, [userId]: (changesRes.data as ProfileChange[]) || [] }));
  };

  const toggleExpand = (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null);
    } else {
      setExpandedUser(userId);
      fetchCustomerDetails(userId);
    }
  };

  const startEditing = (profile: Profile) => {
    setEditingProfile((prev) => ({ ...prev, [profile.user_id]: { ...profile } }));
  };

  const saveProfile = async (userId: string) => {
    const edited = editingProfile[userId];
    if (!edited || !user) return;

    const original = profiles.find((p) => p.user_id === userId);
    if (!original) return;

    const fieldsToTrack = ["full_name", "phone", "street", "number", "neighborhood", "complement", "quadra", "lote", "city", "state", "zip_code"] as const;
    const changesLog: { field_name: string; old_value: string | null; new_value: string | null }[] = [];

    const updates: Record<string, string> = {};
    fieldsToTrack.forEach((field) => {
      const oldVal = (original as any)[field] ?? "";
      const newVal = (edited as any)[field] ?? "";
      if (oldVal !== newVal) {
        updates[field] = newVal;
        changesLog.push({ field_name: field, old_value: oldVal || null, new_value: newVal || null });
      }
    });

    if (Object.keys(updates).length === 0) {
      toast({ title: "Nenhuma alteração detectada" });
      return;
    }

    const { error } = await supabase.from("profiles").update(updates).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }

    // Log changes
    if (changesLog.length > 0) {
      const profileData = profiles.find((p) => p.user_id === userId);
      await supabase.from("profile_changes").insert(
        changesLog.map((c) => ({
          profile_id: userId,
          user_id: userId,
          changed_by: user.id,
          changed_by_role: "admin",
          ...c,
        }))
      );
    }

    setEditingProfile((prev) => {
      const copy = { ...prev };
      delete copy[userId];
      return copy;
    });
    toast({ title: "✅ Cliente atualizado com sucesso" });
    fetchProfiles();
    // Refresh changes
    const { data: newChanges } = await supabase.from("profile_changes").select("id, field_name, old_value, new_value, changed_by_role, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50);
    setChanges((prev) => ({ ...prev, [userId]: (newChanges as ProfileChange[]) || [] }));
  };

  const createCustomer = async () => {
    if (!newName || !newPhone || !newStreet || !newNumber || !newNeighborhood || !newQuadra || !newLote) {
      toast({ title: "Preencha todos os campos obrigatórios (*)", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-customer", {
        body: { full_name: newName, phone: newPhone, zip_code: newZipCode, street: newStreet, number: newNumber, neighborhood: newNeighborhood, quadra: newQuadra, lote: newLote, city: "Anápolis", state: "Goiás" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast({ title: "✅ Cliente criado com sucesso!" });
      setShowCreateForm(false);
      setNewName("");
      setNewPhone("");
      setNewZipCode("");
      setNewStreet("");
      setNewNumber("");
      setNewNeighborhood("");
      setNewQuadra("");
      setNewLote("");
      fetchProfiles();
    } catch (err: any) {
      toast({ title: err.message || "Erro ao criar cliente", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const getOrderStats = (userOrders: OrderSummary[]) => {
    const total = userOrders.length;
    const delivered = userOrders.filter((o) => o.status === "delivered").length;
    const cancelled = userOrders.filter((o) => o.status === "cancelled").length;
    const pending = userOrders.filter((o) => ["pending", "paid", "preparing", "ready", "delivering"].includes(o.status)).length;
    const totalSpent = userOrders.filter((o) => o.status === "delivered").reduce((sum, o) => sum + Number(o.total), 0);
    return { total, delivered, cancelled, pending, totalSpent };
  };

  const fieldLabels: Record<string, string> = {
    full_name: "Nome", phone: "Telefone", street: "Rua", number: "Número",
    neighborhood: "Bairro", complement: "Complemento", quadra: "Quadra",
    lote: "Lote", city: "Cidade", state: "Estado", zip_code: "CEP",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-foreground">Clientes</h2>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> Novo Cliente
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Criar Cliente</h3>
            <button onClick={() => setShowCreateForm(false)}><X size={16} className="text-muted-foreground" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome completo *" value={newName} onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <input placeholder="WhatsApp *" value={newPhone} onChange={(e) => setNewPhone(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <input placeholder="CEP" value={newZipCode} onChange={(e) => setNewZipCode(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <input placeholder="Rua/Av *" value={newStreet} onChange={(e) => setNewStreet(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <div className="flex gap-1">
              <input placeholder="Número *" value={newNumber} onChange={(e) => setNewNumber(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setNewNumber("S/N")} className="rounded-lg border border-border px-2 text-xs font-bold text-primary">S/N</button>
            </div>
            <input placeholder="Bairro *" value={newNeighborhood} onChange={(e) => setNewNeighborhood(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
            <div className="flex gap-1">
              <input placeholder="Quadra *" value={newQuadra} onChange={(e) => setNewQuadra(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setNewQuadra("Não tem")} className="rounded-lg border border-border px-2 text-xs font-bold text-primary">Não tem</button>
            </div>
            <div className="flex gap-1">
              <input placeholder="Lote *" value={newLote} onChange={(e) => setNewLote(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
              <button type="button" onClick={() => setNewLote("Não tem")} className="rounded-lg border border-border px-2 text-xs font-bold text-primary">Não tem</button>
            </div>
            <input value="Anápolis" disabled
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            <input value="Goiás" disabled
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          <button onClick={createCustomer} disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {creating ? "Criando..." : "Criar Cliente"}
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
        <Search size={16} className="text-muted-foreground" />
        <input
          placeholder="Buscar por código, nome, telefone ou endereço..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </div>

      <p className="text-xs text-muted-foreground">{profiles.length} cliente(s) encontrado(s)</p>

      {/* Customer List */}
      {profiles.map((profile) => {
        const isExpanded = expandedUser === profile.user_id;
        const isEditing = !!editingProfile[profile.user_id];
        const edited = editingProfile[profile.user_id] || profile;
        const userOrders = orders[profile.user_id] || [];
        const userAddresses = addresses[profile.user_id] || [];
        const userChanges = changes[profile.user_id] || [];
        const stats = getOrderStats(userOrders);

        return (
          <div key={profile.user_id} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <button onClick={() => toggleExpand(profile.user_id)} className="flex w-full items-center gap-3 p-4 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <span className="text-xs font-bold text-primary">T{String(profile.customer_code).padStart(5, "0")}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">{profile.full_name || "Sem nome"}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {profile.phone || "Sem telefone"} · {profile.neighborhood || "Sem endereço"}
                </p>
              </div>
              {isExpanded ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
            </button>

            {isExpanded && (
              <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                {/* Edit Profile */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-foreground uppercase">Dados do Cliente</h3>
                    <div className="flex gap-2">
                      {!isEditing ? (
                        <button onClick={() => startEditing(profile)}
                          className="text-xs font-medium text-primary hover:underline">Editar</button>
                      ) : (
                        <>
                          <button onClick={() => saveProfile(profile.user_id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
                            <Save size={12} /> Salvar
                          </button>
                          <button onClick={() => setEditingProfile((prev) => { const c = { ...prev }; delete c[profile.user_id]; return c; })}
                            className="text-xs text-muted-foreground hover:underline">Cancelar</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["full_name", "phone", "street", "number", "neighborhood", "complement", "quadra", "lote", "city", "state", "zip_code"] as const).map((field) => (
                      <div key={field}>
                        <label className="text-[10px] font-medium text-muted-foreground uppercase">{fieldLabels[field]}</label>
                        {isEditing ? (
                          <input
                            value={(edited as any)[field] || ""}
                            onChange={(e) => setEditingProfile((prev) => ({ ...prev, [profile.user_id]: { ...prev[profile.user_id], [field]: e.target.value } }))}
                            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                          />
                        ) : (
                          <p className="text-xs text-foreground">{(profile as any)[field] || "-"}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Cadastrado em: {new Date(profile.created_at).toLocaleDateString("pt-BR")}</p>
                </div>

                {/* Order Stats */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-foreground uppercase">Resumo de Pedidos</h3>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="rounded-lg bg-muted p-2 text-center">
                      <p className="text-lg font-bold text-foreground">{stats.total}</p>
                      <p className="text-[10px] text-muted-foreground">Total</p>
                    </div>
                    <div className="rounded-lg bg-green-50 p-2 text-center">
                      <p className="text-lg font-bold text-green-700">{stats.delivered}</p>
                      <p className="text-[10px] text-green-600">Entregues</p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-2 text-center">
                      <p className="text-lg font-bold text-red-700">{stats.cancelled}</p>
                      <p className="text-[10px] text-red-600">Cancelados</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-2 text-center">
                      <p className="text-lg font-bold text-amber-700">{stats.pending}</p>
                      <p className="text-[10px] text-amber-600">Em andamento</p>
                    </div>
                    <div className="rounded-lg bg-primary/5 p-2 text-center">
                      <p className="text-sm font-bold text-primary">R$ {stats.totalSpent.toFixed(0)}</p>
                      <p className="text-[10px] text-muted-foreground">Gasto total</p>
                    </div>
                  </div>
                </div>

                {/* Recent Orders */}
                {userOrders.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-foreground uppercase">Últimos Pedidos</h3>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {userOrders.map((o) => (
                        <div key={o.id} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5">
                          <span className="text-xs font-bold text-foreground">#{String(o.order_number).padStart(5, "0")}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${o.status === "delivered" ? "bg-green-100 text-green-800" : o.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
                            {statusLabels[o.status] || o.status}
                          </span>
                          <span className="text-xs text-muted-foreground">{o.payment_method.toUpperCase()}</span>
                          <span className="text-xs font-bold text-foreground">R$ {Number(o.total).toFixed(2)}</span>
                          <span className="text-[10px] text-muted-foreground">{new Date(o.created_at).toLocaleDateString("pt-BR")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Addresses */}
                {userAddresses.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-bold text-foreground uppercase">Endereços</h3>
                    {userAddresses.map((addr) => (
                      <div key={addr.id} className="rounded-lg bg-muted/50 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{addr.label}</span>
                          {addr.is_default && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary">Padrão</span>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {addr.street}, {addr.number} - {addr.neighborhood}
                          {addr.quadra ? ` · Qd ${addr.quadra}` : ""}{addr.lote ? ` Lt ${addr.lote}` : ""}
                          {addr.complement ? ` · ${addr.complement}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Change History */}
                <div className="space-y-2">
                  <button onClick={() => setShowHistory(showHistory === profile.user_id ? null : profile.user_id)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-foreground uppercase hover:text-primary">
                    <History size={12} /> Histórico de Alterações ({userChanges.length})
                  </button>
                  {showHistory === profile.user_id && userChanges.length > 0 && (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {userChanges.map((c) => (
                        <div key={c.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-[10px]">
                          <span className="font-bold text-foreground">{fieldLabels[c.field_name] || c.field_name}</span>
                          <span className="text-red-500 line-through">{c.old_value || "-"}</span>
                          <span>→</span>
                          <span className="text-green-600 font-semibold">{c.new_value || "-"}</span>
                          <span className="ml-auto text-muted-foreground">
                            {c.changed_by_role === "admin" ? "👑 Admin" : "👤 Cliente"} · {new Date(c.created_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {showHistory === profile.user_id && userChanges.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma alteração registrada.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {profiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Search size={48} className="mb-3 opacity-50" />
          <p className="text-sm">Nenhum cliente encontrado</p>
        </div>
      )}
    </div>
  );
};

export default AdminCustomers;
