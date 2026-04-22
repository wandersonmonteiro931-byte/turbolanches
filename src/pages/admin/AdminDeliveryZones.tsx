import { useEffect, useState, useMemo } from "react";
import {
  Plus, Trash2, Edit2, Save, X, MapPin, Store, DollarSign, Search,
  RefreshCw, Navigation, Filter, Gift, Truck, AlertTriangle, ToggleLeft, ToggleRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDeliveryCalculation } from "@/hooks/useDeliveryCalculation";
import { useStore } from "@/contexts/StoreContext";

interface DeliveryZone {
  id: string;
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
  distance_km: number | null;
  temp_free_delivery: boolean;
}

interface StoreConfig {
  store_address: string;
  store_neighborhood: string;
  price_per_km: number;
  free_delivery_min_order: number;
  free_delivery_max_km: number;
  temp_free_delivery_all: boolean;
  max_serving_km: number | null;
  max_serving_km_active: boolean;
}

interface Courier {
  id: string;
  name: string;
  fixed_fee: number;
  active: boolean;
  code: string;
}

interface DailyFeeRow {
  id: string;
  courier_id: string;
  day_of_week: number;
  fixed_fee: number;
}

const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// ── Couriers Card ──────────────────────────────────────────────────
function CouriersCard({ storeId }: { storeId: string | null }) {
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [newName, setNewName] = useState("");
  const [newFee, setNewFee] = useState("");
  const [newCode, setNewCode] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFee, setEditFee] = useState("");
  const [editCode, setEditCode] = useState("");
  const [dailyFeesOpen, setDailyFeesOpen] = useState<string | null>(null);
  const [dailyFees, setDailyFees] = useState<DailyFeeRow[]>([]);
  const [dayFeeInputs, setDayFeeInputs] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const fetchCouriers = async () => {
    let q = supabase.from("couriers").select("*").order("created_at", { ascending: true });
    if (storeId) q = q.eq("store_id", storeId);
    const { data } = await q;
    setCouriers((data as any[] ?? []).map((c: any) => ({
      id: c.id, name: c.name, fixed_fee: Number(c.fixed_fee), active: c.active, code: c.code || "",
    })));
  };

  useEffect(() => { fetchCouriers(); }, [storeId]);

  const generateCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "ENT";
    for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
    return result;
  };

  const add = async () => {
    if (!newName.trim()) return;
    const code = newCode.trim().toUpperCase() || generateCode();
    await supabase.from("couriers").insert({
      name: newName.trim(), fixed_fee: Number(newFee) || 0, code, store_id: storeId,
    } as any);
    setNewName(""); setNewFee(""); setNewCode("");
    toast({ title: "✅ Entregador cadastrado!" });
    fetchCouriers();
  };

  const save = async () => {
    if (!editingId) return;
    await supabase.from("couriers").update({
      name: editName.trim(), fixed_fee: Number(editFee) || 0, code: editCode.trim().toUpperCase(),
    } as any).eq("id", editingId);
    setEditingId(null);
    toast({ title: "✅ Atualizado!" });
    fetchCouriers();
  };

  const toggleActive = async (c: Courier) => {
    await supabase.from("couriers").update({ active: !c.active } as any).eq("id", c.id);
    toast({ title: c.active ? "Desativado" : "Ativado" });
    fetchCouriers();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover entregador?")) return;
    await supabase.from("couriers").delete().eq("id", id);
    toast({ title: "🗑️ Removido" });
    fetchCouriers();
  };

  const openDailyFees = async (courierId: string) => {
    if (dailyFeesOpen === courierId) { setDailyFeesOpen(null); return; }
    setDailyFeesOpen(courierId);
    const { data } = await supabase.from("courier_daily_fees").select("*").eq("courier_id", courierId);
    const fees = (data as any[] ?? []).map((d: any) => ({
      id: d.id, courier_id: d.courier_id, day_of_week: d.day_of_week, fixed_fee: Number(d.fixed_fee),
    }));
    setDailyFees(fees);
    const inputs: Record<number, string> = {};
    for (let i = 0; i < 7; i++) {
      const f = fees.find((x: DailyFeeRow) => x.day_of_week === i);
      inputs[i] = f ? String(f.fixed_fee) : "";
    }
    setDayFeeInputs(inputs);
  };

  const saveDailyFees = async (courierId: string) => {
    for (let dow = 0; dow < 7; dow++) {
      const val = dayFeeInputs[dow]?.trim();
      const existing = dailyFees.find(f => f.day_of_week === dow);
      if (!val && existing) {
        await supabase.from("courier_daily_fees").delete().eq("id", existing.id);
      } else if (val) {
        const fee = Number(val) || 0;
        if (existing) {
          await supabase.from("courier_daily_fees").update({ fixed_fee: fee } as any).eq("id", existing.id);
        } else {
          await supabase.from("courier_daily_fees").insert({
            courier_id: courierId, day_of_week: dow, fixed_fee: fee, store_id: storeId,
          } as any);
        }
      }
    }
    toast({ title: "✅ Valores por dia salvos!" });
    setDailyFeesOpen(null);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Truck size={16} className="text-primary" />
        Entregadores
      </h3>

      <div className="flex flex-wrap gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome"
          className="flex-1 min-w-[120px] rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Código (auto)"
          className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <input value={newFee} onChange={e => setNewFee(e.target.value)} placeholder="Fixo (R$)" type="number" step="0.01"
          className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
        <button onClick={add} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={14} />
        </button>
      </div>

      {couriers.length === 0 && <p className="text-xs text-muted-foreground">Nenhum entregador cadastrado.</p>}

      {couriers.map(c => (
        <div key={c.id} className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-border p-2">
            {editingId === c.id ? (
              <>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-sm text-foreground" />
                <input value={editCode} onChange={e => setEditCode(e.target.value.toUpperCase())} placeholder="Código"
                  className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-foreground" />
                <input value={editFee} onChange={e => setEditFee(e.target.value)} type="number" step="0.01"
                  className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-foreground" />
                <button onClick={save} className="rounded-lg bg-primary p-1.5 text-primary-foreground"><Save size={14} /></button>
                <button onClick={() => setEditingId(null)} className="rounded-lg border border-border p-1.5 text-muted-foreground"><X size={14} /></button>
              </>
            ) : (
              <>
                <span className={`flex-1 text-sm font-semibold ${!c.active ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {c.name}
                  {c.code && <span className="ml-1.5 text-xs font-mono text-muted-foreground">({c.code})</span>}
                </span>
                <span className="text-xs font-bold text-muted-foreground">R$ {c.fixed_fee.toFixed(2).replace(".",",")}</span>
                <button onClick={() => openDailyFees(c.id)} title="Valores por dia da semana"
                  className={`rounded-lg border p-1.5 text-xs ${dailyFeesOpen === c.id ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted"}`}>
                  📅
                </button>
                <button onClick={() => toggleActive(c)} className={`rounded-lg border p-1.5 ${c.active ? "border-green-300 text-green-600" : "border-destructive/30 text-destructive"}`}>
                  {c.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                </button>
                <button onClick={() => { setEditingId(c.id); setEditName(c.name); setEditFee(String(c.fixed_fee)); setEditCode(c.code); }}
                  className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted"><Edit2 size={14} /></button>
                <button onClick={() => remove(c.id)} className="rounded-lg border border-border p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
              </>
            )}
          </div>
          {dailyFeesOpen === c.id && (
            <div className="ml-4 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Valor fixo por dia da semana (vazio = usa valor padrão R$ {c.fixed_fee.toFixed(2).replace(".",",")})</p>
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES_SHORT.map((name, i) => (
                  <div key={i} className="text-center space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground">{name}</p>
                    <input
                      value={dayFeeInputs[i] || ""}
                      onChange={e => setDayFeeInputs(prev => ({ ...prev, [i]: e.target.value }))}
                      type="number" step="0.01" placeholder="-"
                      className="w-full rounded border border-border bg-background px-1 py-1 text-center text-xs text-foreground"
                    />
                  </div>
                ))}
              </div>
              <button onClick={() => saveDailyFees(c.id)}
                className="rounded-lg bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground">
                Salvar Valores
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const DEFAULT_STORE: StoreConfig = {
  store_address: "", store_neighborhood: "", price_per_km: 2,
  free_delivery_min_order: 0, free_delivery_max_km: 0,
  temp_free_delivery_all: false, max_serving_km: null, max_serving_km_active: false,
};

// ── Sub-components ──────────────────────────────────────────────────

function StoreAddressCard({ config, onSaved }: { config: StoreConfig; onSaved: (c: StoreConfig) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(config);
  const { toast } = useToast();

  useEffect(() => setForm(config), [config]);

  const save = async () => {
    const fullAddress = [form.store_address, form.store_neighborhood].filter(Boolean).join(" — ");
    const { error } = await supabase.from("store_settings").update({
      store_address: form.store_address,
      store_neighborhood: form.store_neighborhood,
      store_address_full: fullAddress,
      price_per_km: form.price_per_km,
      store_lat: null, store_lng: null,
    } as any).not("id", "is", null);
    if (error) { toast({ title: "Erro ao salvar", variant: "destructive" }); return; }
    onSaved(form);
    setEditing(false);
    toast({ title: "✅ Endereço salvo!" });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Store size={18} className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Endereço da Hamburgueria</h3>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <Edit2 size={12} className="inline mr-1" /> Editar
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder="Endereço completo (Rua, Nº)" value={form.store_address} onChange={e => setForm(f => ({ ...f, store_address: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
            <input placeholder="Bairro da hamburgueria" value={form.store_neighborhood} onChange={e => setForm(f => ({ ...f, store_neighborhood: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">R$/km:</span>
              <input type="number" step="0.10" min="0" value={form.price_per_km} onChange={e => setForm(f => ({ ...f, price_per_km: Number(e.target.value) }))} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Salvar</button>
              <button onClick={() => { setEditing(false); setForm(config); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground space-y-1">
          {config.store_address ? (
            <>
              <p><span className="font-medium text-foreground">{config.store_address}</span> — {config.store_neighborhood || "Sem bairro"}</p>
              <p>R$/km: <span className="font-bold text-foreground">R$ {config.price_per_km.toFixed(2).replace(".", ",")}</span></p>
            </>
          ) : (
            <p className="italic">Endereço não configurado.</p>
          )}
        </div>
      )}
    </div>
  );
}

function FreeDeliveryCard({ config, onSaved }: { config: StoreConfig; onSaved: (c: StoreConfig) => void }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(config);
  const { toast } = useToast();

  useEffect(() => setForm(config), [config]);

  const save = async () => {
    const { error } = await supabase.from("store_settings").update({
      free_delivery_min_order: form.free_delivery_min_order,
      free_delivery_max_km: form.free_delivery_max_km,
    } as any).not("id", "is", null);
    if (error) { toast({ title: "Erro ao salvar", variant: "destructive" }); return; }
    onSaved({ ...config, free_delivery_min_order: form.free_delivery_min_order, free_delivery_max_km: form.free_delivery_max_km });
    setEditing(false);
    toast({ title: "✅ Configuração de frete grátis salva!" });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-green-500" />
          <h3 className="text-sm font-bold text-foreground">Frete Grátis por Regra</h3>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <Edit2 size={12} className="inline mr-1" /> Editar
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Pedido mínimo:</span>
              <span className="text-sm text-muted-foreground">R$</span>
              <input type="number" step="1" min="0" value={form.free_delivery_min_order} onChange={e => setForm(f => ({ ...f, free_delivery_min_order: Number(e.target.value) }))} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">Até distância:</span>
              <input type="number" step="0.5" min="0" value={form.free_delivery_max_km} onChange={e => setForm(f => ({ ...f, free_delivery_max_km: Number(e.target.value) }))} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
              <span className="text-xs text-muted-foreground">km</span>
            </div>
            <div className="flex gap-2 ml-auto">
              <button onClick={save} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Salvar</button>
              <button onClick={() => { setEditing(false); setForm(config); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Use o limite de km para liberar frete grátis por distância, ou ative bairros específicos no botão 🎁 da lista.</p>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground space-y-1">
          {config.free_delivery_max_km > 0 && (
            <p>📍 Distância: frete grátis até <span className="font-bold text-foreground">{config.free_delivery_max_km} km</span>.</p>
          )}
          {config.free_delivery_min_order > 0 && (
            <p>🧾 Pedido mínimo: frete grátis acima de <span className="font-bold text-foreground">R$ {config.free_delivery_min_order.toFixed(0)}</span>.</p>
          )}
          {config.free_delivery_max_km <= 0 && config.free_delivery_min_order <= 0 && (
            <p className="italic">Desativado (defina km ou pedido mínimo para ativar).</p>
          )}
          <p className="text-xs">🎁 Bairros selecionados continuam configuráveis na lista abaixo.</p>
        </div>
      )}
    </div>
  );
}

function TempFreeDeliveryCard({
  config, zones, onToggleAll, onRefresh,
}: {
  config: StoreConfig;
  zones: DeliveryZone[];
  onToggleAll: (val: boolean) => void;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const freeCount = zones.filter(z => z.temp_free_delivery).length;

  const toggleAll = async (val: boolean) => {
    await supabase.from("store_settings").update({ temp_free_delivery_all: val } as any).not("id", "is", null);
    if (val) {
      await supabase.from("delivery_zones").update({ temp_free_delivery: true } as any).not("id", "is", null);
    } else {
      await supabase.from("delivery_zones").update({ temp_free_delivery: false } as any).not("id", "is", null);
    }
    onToggleAll(val);
    onRefresh();
    toast({ title: val ? "🎉 Frete grátis temporário ATIVADO para todos!" : "⏹️ Frete grátis temporário DESATIVADO" });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-amber-500" />
          <h3 className="text-sm font-bold text-foreground">Frete Grátis Temporário</h3>
          {freeCount > 0 && (
            <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[11px] font-bold">{freeCount} bairro(s)</span>
          )}
        </div>
        <button
          onClick={() => toggleAll(!config.temp_free_delivery_all)}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            config.temp_free_delivery_all
              ? "bg-green-600 text-white hover:bg-green-700"
              : "border border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {config.temp_free_delivery_all ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
          {config.temp_free_delivery_all ? "Desativar Todos" : "Ativar para Todos"}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Ative para bairros específicos na lista abaixo (ícone 🎁) ou para todos de uma vez. Enquanto ativo, o frete desses bairros será grátis.
      </p>
    </div>
  );
}

function MaxServingCard({ config, onSaved }: { config: StoreConfig; onSaved: (c: StoreConfig) => void }) {
  const [editing, setEditing] = useState(false);
  const [km, setKm] = useState(config.max_serving_km ?? 20);
  const { toast } = useToast();

  useEffect(() => setKm(config.max_serving_km ?? 20), [config]);

  const toggle = async () => {
    const newActive = !config.max_serving_km_active;
    const updates: any = { max_serving_km_active: newActive };
    if (newActive && !config.max_serving_km) updates.max_serving_km = km;
    await supabase.from("store_settings").update(updates).not("id", "is", null);
    onSaved({ ...config, max_serving_km_active: newActive, max_serving_km: newActive ? (config.max_serving_km ?? km) : config.max_serving_km });
    toast({ title: newActive ? "🚫 Limite de atendimento ATIVADO" : "✅ Limite de atendimento DESATIVADO" });
  };

  const save = async () => {
    await supabase.from("store_settings").update({ max_serving_km: km } as any).not("id", "is", null);
    onSaved({ ...config, max_serving_km: km });
    setEditing(false);
    toast({ title: "✅ Distância máxima salva!" });
  };

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${config.max_serving_km_active ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle size={18} className={config.max_serving_km_active ? "text-destructive" : "text-muted-foreground"} />
          <h3 className="text-sm font-bold text-foreground">Limite de Área de Entrega</h3>
        </div>
        <div className="flex items-center gap-2">
          {config.max_serving_km_active && !editing && (
            <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              <Edit2 size={12} className="inline mr-1" /> Editar km
            </button>
          )}
          <button
            onClick={toggle}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
              config.max_serving_km_active
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "border border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {config.max_serving_km_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
            {config.max_serving_km_active ? "Desativar" : "Ativar Limite"}
          </button>
        </div>
      </div>
      {editing ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">Distância máxima:</span>
          <input type="number" step="0.5" min="1" value={km} onChange={e => setKm(Number(e.target.value))} className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
          <span className="text-xs text-muted-foreground">km</span>
          <button onClick={save} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">Salvar</button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancelar</button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {config.max_serving_km_active ? (
            <>Atendendo até <span className="font-bold text-foreground">{config.max_serving_km ?? 20} km</span>. Bairros além desse limite serão bloqueados no checkout.</>
          ) : (
            <span className="italic">Desativado — todos os bairros cadastrados podem pedir.</span>
          )}
        </p>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

const AdminDeliveryZones = () => {
  const { storeId } = useStore();
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ neighborhood: "", active: true, distance_km: null as number | null });
  const [newZone, setNewZone] = useState({ neighborhood: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE);
  const { state: calcState, start: startCalc, cancel: cancelCalc } = useDeliveryCalculation();

  const [filterKmMin, setFilterKmMin] = useState("");
  const [filterKmMax, setFilterKmMax] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [showFilters, setShowFilters] = useState(false);

  const { toast } = useToast();

  const fetchZones = async () => {
    let query = supabase.from("delivery_zones").select("*").order("neighborhood");
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query;
    if (data) setZones(data as DeliveryZone[]);
  };

  const fetchStoreConfig = async () => {
    let query = supabase.from("store_settings")
      .select("store_address, store_neighborhood, price_per_km, free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all, max_serving_km, max_serving_km_active")
      .limit(1);
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query.maybeSingle();
    if (data) {
      const d = data as any;
      setStoreConfig({
        store_address: d.store_address || "",
        store_neighborhood: d.store_neighborhood || "",
        price_per_km: d.price_per_km || 2,
        free_delivery_min_order: d.free_delivery_min_order || 0,
        free_delivery_max_km: d.free_delivery_max_km || 0,
        temp_free_delivery_all: d.temp_free_delivery_all || false,
        max_serving_km: d.max_serving_km ?? null,
        max_serving_km_active: d.max_serving_km_active || false,
      });
    }
  };

  useEffect(() => { fetchZones(); fetchStoreConfig(); }, [storeId]);

  // Auto-refresh zones while calculation is running
  useEffect(() => {
    if (!calcState.running) {
      fetchZones();
      return;
    }
    const interval = setInterval(fetchZones, 4000);
    return () => clearInterval(interval);
  }, [calcState.running, calcState.processed]);

  const calculateDistances = (recalcAll = false) => {
    if (!storeConfig.store_address && !storeConfig.store_neighborhood) {
      toast({ title: "Configure o endereço primeiro!", variant: "destructive" });
      return;
    }
    startCalc(recalcAll);
  };

  const addZone = async () => {
    if (!newZone.neighborhood.trim()) { toast({ title: "Informe o bairro", variant: "destructive" }); return; }
    await supabase.from("delivery_zones").insert({ neighborhood: newZone.neighborhood.trim(), store_id: storeId });
    toast({ title: "✅ Região adicionada!" });
    setNewZone({ neighborhood: "" }); setShowAdd(false); fetchZones();
  };

  const startEdit = (zone: DeliveryZone) => {
    setEditingId(zone.id);
    setEditData({ neighborhood: zone.neighborhood, active: zone.active, distance_km: zone.distance_km });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from("delivery_zones").update({
      neighborhood: editData.neighborhood,
      active: editData.active,
      distance_km: editData.distance_km,
    } as any).eq("id", editingId);
    toast({ title: "✅ Atualizado!" }); setEditingId(null); fetchZones();
  };

  const deleteZone = async (id: string) => {
    if (!confirm("Remover esta região?")) return;
    await supabase.from("delivery_zones").delete().eq("id", id);
    toast({ title: "🗑️ Removido" }); fetchZones();
  };

  const toggleTempFree = async (zone: DeliveryZone) => {
    const newVal = !zone.temp_free_delivery;
    await supabase.from("delivery_zones").update({ temp_free_delivery: newVal } as any).eq("id", zone.id);
    toast({ title: newVal ? `🎁 Frete grátis ativado: ${zone.neighborhood}` : `Frete grátis desativado: ${zone.neighborhood}` });
    fetchZones();
  };

  const toggleActive = async (zone: DeliveryZone) => {
    const newVal = !zone.active;
    await supabase.from("delivery_zones").update({ active: newVal } as any).eq("id", zone.id);
    toast({ title: newVal ? `✅ ${zone.neighborhood} ativado` : `⛔ ${zone.neighborhood} desativado` });
    fetchZones();
  };

  // ── Filtering ──
  const filteredZones = useMemo(() => {
    return zones.filter(z => {
      if (searchTerm && !z.neighborhood.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterStatus === "active" && !z.active) return false;
      if (filterStatus === "inactive" && z.active) return false;
      if (filterKmMin && (z.distance_km === null || z.distance_km < Number(filterKmMin))) return false;
      if (filterKmMax && (z.distance_km === null || z.distance_km > Number(filterKmMax))) return false;
      return true;
    });
  }, [zones, searchTerm, filterStatus, filterKmMin, filterKmMax]);

  const zonesWithoutDistance = zones.filter(z => z.distance_km === null).length;
  const activeFilters = [filterKmMin, filterKmMax, filterStatus !== "all" ? filterStatus : ""].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <CouriersCard storeId={storeId} />

      <StoreAddressCard config={storeConfig} onSaved={c => setStoreConfig(prev => ({ ...prev, ...c }))} />

      <FreeDeliveryCard config={storeConfig} onSaved={setStoreConfig} />

      <TempFreeDeliveryCard
        config={storeConfig}
        zones={zones}
        onToggleAll={val => setStoreConfig(c => ({ ...c, temp_free_delivery_all: val }))}
        onRefresh={fetchZones}
      />

      <MaxServingCard config={storeConfig} onSaved={setStoreConfig} />

      {/* Calculate Distances */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Navigation size={16} className="text-primary" />
              Cálculo Automático de Distâncias
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Calcula distância por estrada e aplica a taxa automaticamente.
              {zonesWithoutDistance > 0 && <span className="text-amber-600 font-medium"> ({zonesWithoutDistance} pendentes)</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {calcState.running ? (
              <button onClick={cancelCalc} className="flex items-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-bold text-destructive-foreground">
                <X size={14} /> Cancelar
              </button>
            ) : (
              <>
                <button onClick={() => calculateDistances(false)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
                  <RefreshCw size={14} /> Calcular
                </button>
                <button onClick={() => calculateDistances(true)} className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
                  Recalcular Tudo
                </button>
              </>
            )}
          </div>
        </div>
        {calcState.message && (
          <div className={`mt-3 rounded-lg px-4 py-2.5 text-sm font-medium ${
            calcState.message.includes("❌") 
              ? "bg-destructive/10 text-destructive" 
              : calcState.message.includes("✅")
              ? "bg-green-500/10 text-green-700"
              : "bg-primary/10 text-primary"
          }`}>
            <div className="flex items-center justify-between">
              <span>{calcState.message}</span>
              {calcState.running && <RefreshCw size={14} className="animate-spin" />}
            </div>
            {calcState.running && (calcState.processed + calcState.remaining) > 0 && (
              <div className="mt-2 w-full bg-muted rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.round((calcState.processed / (calcState.processed + calcState.remaining)) * 100)}%` }}
                />
              </div>
            )}
            {calcState.message.includes("❌") && zonesWithoutDistance > 0 && (
              <button
                onClick={() => calculateDistances(false)}
                className="mt-2 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCw size={14} /> Recalcular Pendentes ({zonesWithoutDistance})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Regiões de Entrega</h2>
          <p className="text-xs text-muted-foreground">{zones.length} bairros cadastrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchZones} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowFilters(!showFilters)} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium hover:bg-muted ${activeFilters > 0 ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
            <Filter size={14} /> {activeFilters > 0 && <span className="text-xs">({activeFilters})</span>}
          </button>
          <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90">
            <Plus size={16} /> Nova
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2"><Filter size={14} /> Filtros</h3>
            <button onClick={() => { setFilterKmMin(""); setFilterKmMax(""); setFilterStatus("all"); }} className="text-xs text-primary font-medium">Limpar</button>
          </div>
          <div className="flex gap-2 mb-2">
            {(["all", "active", "inactive"] as const).map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-muted"}`}>
                {s === "all" ? "Todos" : s === "active" ? "✅ Ativos" : "⛔ Inativos"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Km mín</label>
              <input type="number" step="0.5" min="0" value={filterKmMin} onChange={e => setFilterKmMin(e.target.value)} placeholder="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Km máx</label>
              <input type="number" step="0.5" min="0" value={filterKmMax} onChange={e => setFilterKmMax(e.target.value)} placeholder="∞" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{filteredZones.length} de {zones.length} bairros</p>
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Adicionar Região</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input placeholder="Nome do bairro" value={newZone.neighborhood} onChange={e => setNewZone(z => ({ ...z, neighborhood: e.target.value }))} className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground sm:col-span-2" />
            <div className="flex gap-2">
              <input type="number" step="0.01" min="0" placeholder="Taxa (R$)" value={newZone.delivery_fee} onChange={e => setNewZone(z => ({ ...z, delivery_fee: Number(e.target.value) }))} className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground" />
              <button onClick={addZone} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input placeholder="Buscar bairro..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground" />
      </div>

      {/* Zones List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredZones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MapPin size={40} className="mb-3 opacity-40" />
            <p className="text-sm">{searchTerm || activeFilters ? "Nenhum bairro encontrado com esses filtros" : "Nenhuma região cadastrada"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-auto">
            {filteredZones.map(zone => {
              const isBlocked = storeConfig.max_serving_km_active && zone.distance_km !== null && zone.distance_km >= 0 && zone.distance_km > (storeConfig.max_serving_km ?? 999);
              const isFree = zone.temp_free_delivery || storeConfig.temp_free_delivery_all;

              return (
                <div key={zone.id} className={`flex items-center gap-2 px-4 py-3 ${isBlocked ? "bg-destructive/5" : ""}`}>
                  {editingId === zone.id ? (
                    <>
                      <input value={editData.neighborhood} onChange={e => setEditData(d => ({ ...d, neighborhood: e.target.value }))} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground min-w-0" />
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">km:</span>
                        <input type="number" step="0.1" min="0" value={editData.distance_km ?? ""} onChange={e => setEditData(d => ({ ...d, distance_km: e.target.value ? Number(e.target.value) : null }))} className="w-16 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-muted-foreground">R$:</span>
                        <input type="number" step="0.01" min="0" value={editData.delivery_fee} onChange={e => setEditData(d => ({ ...d, delivery_fee: Number(e.target.value) }))} className="w-20 rounded-lg border border-border bg-background px-2 py-2 text-sm text-foreground" />
                      </div>
                      <label className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <input type="checkbox" checked={editData.active} onChange={e => setEditData(d => ({ ...d, active: e.target.checked }))} /> Ativo
                      </label>
                      <button onClick={saveEdit} className="rounded-lg bg-primary p-2 text-primary-foreground"><Save size={14} /></button>
                      <button onClick={() => setEditingId(null)} className="rounded-lg border border-border p-2 text-muted-foreground"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <MapPin size={14} className={`shrink-0 ${isBlocked ? "text-destructive" : "text-muted-foreground"}`} />
                      <span className={`flex-1 text-sm font-medium min-w-0 truncate ${zone.active ? (isBlocked ? "text-destructive" : "text-foreground") : "text-muted-foreground line-through"}`}>
                        {zone.neighborhood}
                      </span>

                      {zone.distance_km !== null && zone.distance_km >= 0 && (
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap shrink-0">
                          {zone.distance_km.toFixed(1)} km
                        </span>
                      )}
                      {zone.distance_km !== null && zone.distance_km < 0 && (
                        <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-semibold shrink-0">N/A</span>
                      )}

                      {isFree ? (
                        <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[11px] font-bold shrink-0">GRÁTIS 🎁</span>
                      ) : (
                        <span className={`text-sm font-bold shrink-0 ${zone.delivery_fee === 0 ? "text-green-600" : "text-foreground"}`}>
                          {zone.delivery_fee === 0 ? "GRÁTIS" : `R$ ${zone.delivery_fee.toFixed(0)}`}
                        </span>
                      )}

                      {isBlocked && <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-bold shrink-0">BLOQUEADO</span>}
                      {!zone.active && <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-[10px] font-bold shrink-0">INATIVO</span>}

                      <button onClick={() => toggleActive(zone)} className={`rounded-lg border p-2 shrink-0 ${zone.active ? "border-green-300 text-green-600 bg-green-50" : "border-destructive/30 text-destructive bg-destructive/5"}`} title={zone.active ? "Desativar bairro" : "Ativar bairro"}>
                        {zone.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>

                      <button onClick={() => toggleTempFree(zone)} className={`rounded-lg border p-2 shrink-0 ${zone.temp_free_delivery ? "border-green-300 text-green-600 bg-green-50" : "border-border text-muted-foreground hover:bg-muted"}`} title="Frete grátis temporário">
                        <Gift size={14} />
                      </button>
                      <button onClick={() => startEdit(zone)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted shrink-0">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteZone(zone.id)} className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10 shrink-0">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDeliveryZones;
