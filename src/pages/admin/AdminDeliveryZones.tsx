import { useEffect, useState, useMemo } from "react";
import {
  Plus, Trash2, Edit2, Save, X, MapPin, Store, DollarSign, Search,
  RefreshCw, Navigation, Filter, Gift, Truck, AlertTriangle, ToggleLeft, ToggleRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useDeliveryCalculation } from "@/hooks/useDeliveryCalculation";

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
    const { error } = await supabase.from("store_settings").update({
      store_address: form.store_address,
      store_neighborhood: form.store_neighborhood,
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
          <h3 className="text-sm font-bold text-foreground">Frete Grátis Automático</h3>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
            <Edit2 size={12} className="inline mr-1" /> Editar
          </button>
        )}
      </div>
      {editing ? (
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
      ) : (
        <p className="text-sm text-muted-foreground">
          {config.free_delivery_min_order > 0 ? (
            <>Pedidos acima de <span className="font-bold text-foreground">R$ {config.free_delivery_min_order.toFixed(0)}</span> {config.free_delivery_max_km > 0 ? <>até <span className="font-bold text-foreground">{config.free_delivery_max_km} km</span></> : ""} ganham frete grátis.</>
          ) : (
            <span className="italic">Desativado (defina pedido mínimo &gt; 0 para ativar).</span>
          )}
        </p>
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
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ neighborhood: "", delivery_fee: 0, active: true, distance_km: null as number | null });
  const [newZone, setNewZone] = useState({ neighborhood: "", delivery_fee: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(DEFAULT_STORE);
  const { state: calcState, start: startCalc, cancel: cancelCalc } = useDeliveryCalculation();

  // Filters
  const [filterKmMin, setFilterKmMin] = useState("");
  const [filterKmMax, setFilterKmMax] = useState("");
  const [filterPriceMin, setFilterPriceMin] = useState("");
  const [filterPriceMax, setFilterPriceMax] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const { toast } = useToast();

  const fetchZones = async () => {
    const { data } = await supabase.from("delivery_zones").select("*").order("neighborhood");
    if (data) setZones(data as DeliveryZone[]);
  };

  const fetchStoreConfig = async () => {
    const { data } = await supabase.from("store_settings")
      .select("store_address, store_neighborhood, price_per_km, free_delivery_min_order, free_delivery_max_km, temp_free_delivery_all, max_serving_km, max_serving_km_active")
      .limit(1).single();
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

  useEffect(() => { fetchZones(); fetchStoreConfig(); }, []);

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
    await supabase.from("delivery_zones").insert({ neighborhood: newZone.neighborhood.trim(), delivery_fee: newZone.delivery_fee });
    toast({ title: "✅ Região adicionada!" });
    setNewZone({ neighborhood: "", delivery_fee: 0 }); setShowAdd(false); fetchZones();
  };

  const startEdit = (zone: DeliveryZone) => {
    setEditingId(zone.id);
    setEditData({ neighborhood: zone.neighborhood, delivery_fee: zone.delivery_fee, active: zone.active, distance_km: zone.distance_km });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await supabase.from("delivery_zones").update({
      neighborhood: editData.neighborhood,
      delivery_fee: editData.delivery_fee,
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

  // ── Filtering ──
  const filteredZones = useMemo(() => {
    return zones.filter(z => {
      if (searchTerm && !z.neighborhood.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filterKmMin && (z.distance_km === null || z.distance_km < Number(filterKmMin))) return false;
      if (filterKmMax && (z.distance_km === null || z.distance_km > Number(filterKmMax))) return false;
      if (filterPriceMin && z.delivery_fee < Number(filterPriceMin)) return false;
      if (filterPriceMax && z.delivery_fee > Number(filterPriceMax)) return false;
      return true;
    });
  }, [zones, searchTerm, filterKmMin, filterKmMax, filterPriceMin, filterPriceMax]);

  const zonesWithoutDistance = zones.filter(z => z.distance_km === null).length;
  const activeFilters = [filterKmMin, filterKmMax, filterPriceMin, filterPriceMax].filter(Boolean).length;

  return (
    <div className="space-y-4">
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
              : "bg-primary/10 text-primary"
          }`}>
            <div className="flex items-center justify-between">
              <span>{calcState.message}</span>
              {calcState.running && <RefreshCw size={14} className="animate-spin" />}
            </div>
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
            <button onClick={() => { setFilterKmMin(""); setFilterKmMax(""); setFilterPriceMin(""); setFilterPriceMax(""); }} className="text-xs text-primary font-medium">Limpar</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Km mín</label>
              <input type="number" step="0.5" min="0" value={filterKmMin} onChange={e => setFilterKmMin(e.target.value)} placeholder="0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Km máx</label>
              <input type="number" step="0.5" min="0" value={filterKmMax} onChange={e => setFilterKmMax(e.target.value)} placeholder="∞" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Preço mín</label>
              <input type="number" step="1" min="0" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} placeholder="R$ 0" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground mb-1 block">Preço máx</label>
              <input type="number" step="1" min="0" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} placeholder="R$ ∞" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" />
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
                      {!zone.active && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground shrink-0">Inativo</span>}

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
