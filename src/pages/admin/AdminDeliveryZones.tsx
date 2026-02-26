import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Save, X, MapPin, Store, DollarSign, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeliveryZone {
  id: string;
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
}

interface StoreConfig {
  store_address: string;
  store_neighborhood: string;
  price_per_km: number;
}

const AdminDeliveryZones = () => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ neighborhood: "", delivery_fee: 0, active: true });
  const [newZone, setNewZone] = useState({ neighborhood: "", delivery_fee: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({ store_address: "", store_neighborhood: "", price_per_km: 2 });
  const [editingStore, setEditingStore] = useState(false);
  const [storeForm, setStoreForm] = useState<StoreConfig>({ store_address: "", store_neighborhood: "", price_per_km: 2 });
  const [applyingPerKm, setApplyingPerKm] = useState(false);
  const { toast } = useToast();

  const fetchZones = async () => {
    const { data } = await supabase
      .from("delivery_zones")
      .select("*")
      .order("neighborhood");
    if (data) setZones(data);
  };

  const fetchStoreConfig = async () => {
    const { data } = await supabase
      .from("store_settings")
      .select("store_address, store_neighborhood, price_per_km")
      .limit(1)
      .single();
    if (data) {
      const config = {
        store_address: (data as any).store_address || "",
        store_neighborhood: (data as any).store_neighborhood || "",
        price_per_km: (data as any).price_per_km || 2,
      };
      setStoreConfig(config);
      setStoreForm(config);
    }
  };

  useEffect(() => { fetchZones(); fetchStoreConfig(); }, []);

  const saveStoreConfig = async () => {
    const { error } = await supabase
      .from("store_settings")
      .update({
        store_address: storeForm.store_address,
        store_neighborhood: storeForm.store_neighborhood,
        price_per_km: storeForm.price_per_km,
      } as any)
      .not("id", "is", null);
    if (error) {
      toast({ title: "Erro ao salvar configuração", variant: "destructive" });
      return;
    }
    setStoreConfig(storeForm);
    setEditingStore(false);
    toast({ title: "✅ Endereço da hamburgueria salvo!" });
  };

  const applyPricePerKm = async () => {
    if (!storeConfig.price_per_km || storeConfig.price_per_km <= 0) {
      toast({ title: "Defina o valor por km primeiro", variant: "destructive" });
      return;
    }
    setApplyingPerKm(true);
    // Aplica uma taxa estimada baseada na distância (simulação por posição alfabética como proxy)
    // Na prática, seria necessário usar geocoding. Aqui aplicamos o valor por km como taxa base.
    toast({ 
      title: "ℹ️ Valor por km configurado", 
      description: `R$ ${storeConfig.price_per_km.toFixed(2).replace(".", ",")} por km. Edite manualmente cada bairro para ajustar a taxa com base na distância real.` 
    });
    setApplyingPerKm(false);
  };

  const addZone = async () => {
    if (!newZone.neighborhood.trim()) {
      toast({ title: "Informe o nome do bairro/região", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("delivery_zones").insert({
      neighborhood: newZone.neighborhood.trim(),
      delivery_fee: newZone.delivery_fee,
    });
    if (error) {
      toast({ title: "Erro ao adicionar", variant: "destructive" });
      return;
    }
    toast({ title: "✅ Região adicionada!" });
    setNewZone({ neighborhood: "", delivery_fee: 0 });
    setShowAdd(false);
    fetchZones();
  };

  const startEdit = (zone: DeliveryZone) => {
    setEditingId(zone.id);
    setEditData({ neighborhood: zone.neighborhood, delivery_fee: zone.delivery_fee, active: zone.active });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase.from("delivery_zones").update(editData).eq("id", editingId);
    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
      return;
    }
    toast({ title: "✅ Região atualizada!" });
    setEditingId(null);
    fetchZones();
  };

  const deleteZone = async (id: string) => {
    if (!confirm("Remover esta região?")) return;
    await supabase.from("delivery_zones").delete().eq("id", id);
    toast({ title: "🗑️ Região removida" });
    fetchZones();
  };

  const filteredZones = zones.filter(z =>
    z.neighborhood.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Store Address Config */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Store size={18} className="text-primary" />
            <h3 className="text-sm font-bold text-foreground">Endereço da Hamburgueria</h3>
          </div>
          {!editingStore && (
            <button
              onClick={() => setEditingStore(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Edit2 size={12} className="inline mr-1" /> Editar
            </button>
          )}
        </div>

        {editingStore ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                placeholder="Endereço completo (Rua, Nº)"
                value={storeForm.store_address}
                onChange={e => setStoreForm(f => ({ ...f, store_address: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <input
                placeholder="Bairro da hamburgueria"
                value={storeForm.store_neighborhood}
                onChange={e => setStoreForm(f => ({ ...f, store_neighborhood: e.target.value }))}
                className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <DollarSign size={14} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Valor por km:</span>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  value={storeForm.price_per_km}
                  onChange={e => setStoreForm(f => ({ ...f, price_per_km: Number(e.target.value) }))}
                  className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button onClick={saveStoreConfig} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                  Salvar
                </button>
                <button onClick={() => { setEditingStore(false); setStoreForm(storeConfig); }} className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground space-y-1">
            {storeConfig.store_address ? (
              <>
                <p><span className="font-medium text-foreground">{storeConfig.store_address}</span> — {storeConfig.store_neighborhood || "Sem bairro"}</p>
                <p>Valor por km: <span className="font-bold text-foreground">R$ {storeConfig.price_per_km.toFixed(2).replace(".", ",")}</span></p>
              </>
            ) : (
              <p className="italic">Endereço não configurado. Clique em Editar para definir.</p>
            )}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Regiões de Entrega</h2>
          <p className="text-xs text-muted-foreground">{zones.length} bairros cadastrados. Edite a taxa de cada um manualmente.</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={16} /> Nova Região
        </button>
      </div>

      {/* Add Form */}
      {showAdd && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
          <h3 className="text-sm font-bold text-foreground">Adicionar Região</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="Nome do bairro/região"
              value={newZone.neighborhood}
              onChange={e => setNewZone(z => ({ ...z, neighborhood: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground sm:col-span-2"
            />
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Taxa (R$)"
                value={newZone.delivery_fee}
                onChange={e => setNewZone(z => ({ ...z, delivery_fee: Number(e.target.value) }))}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground"
              />
              <button onClick={addZone} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Buscar bairro..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full rounded-lg border border-border bg-background pl-10 pr-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Zones List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredZones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MapPin size={40} className="mb-3 opacity-40" />
            <p className="text-sm">{searchTerm ? "Nenhum bairro encontrado" : "Nenhuma região cadastrada"}</p>
          </div>
        ) : (
          <div className="divide-y divide-border max-h-[60vh] overflow-auto">
            {filteredZones.map(zone => (
              <div key={zone.id} className="flex items-center gap-3 px-4 py-3">
                {editingId === zone.id ? (
                  <>
                    <input
                      value={editData.neighborhood}
                      onChange={e => setEditData(d => ({ ...d, neighborhood: e.target.value }))}
                      className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editData.delivery_fee}
                      onChange={e => setEditData(d => ({ ...d, delivery_fee: Number(e.target.value) }))}
                      className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                    <label className="flex items-center gap-1 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={editData.active}
                        onChange={e => setEditData(d => ({ ...d, active: e.target.checked }))}
                      />
                      Ativo
                    </label>
                    <button onClick={saveEdit} className="rounded-lg bg-primary p-2 text-primary-foreground">
                      <Save size={14} />
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg border border-border p-2 text-muted-foreground">
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <MapPin size={16} className="text-muted-foreground shrink-0" />
                    <span className={`flex-1 text-sm font-medium ${zone.active ? "text-foreground" : "text-muted-foreground line-through"}`}>
                      {zone.neighborhood}
                    </span>
                    <span className={`text-sm font-bold ${zone.delivery_fee === 0 ? "text-green-600" : "text-foreground"}`}>
                      {zone.delivery_fee === 0 ? "GRÁTIS" : `R$ ${zone.delivery_fee.toFixed(2).replace(".", ",")}`}
                    </span>
                    {!zone.active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        Inativo
                      </span>
                    )}
                    <button onClick={() => startEdit(zone)} className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted">
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => deleteZone(zone.id)} className="rounded-lg border border-border p-2 text-destructive hover:bg-destructive/10">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDeliveryZones;
