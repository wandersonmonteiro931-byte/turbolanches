import { useEffect, useState } from "react";
import { Plus, Trash2, Edit2, Save, X, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface DeliveryZone {
  id: string;
  neighborhood: string;
  delivery_fee: number;
  active: boolean;
}

const AdminDeliveryZones = () => {
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ neighborhood: "", delivery_fee: 0, active: true });
  const [newZone, setNewZone] = useState({ neighborhood: "", delivery_fee: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const { toast } = useToast();

  const fetchZones = async () => {
    const { data } = await supabase
      .from("delivery_zones")
      .select("*")
      .order("neighborhood");
    if (data) setZones(data);
  };

  useEffect(() => { fetchZones(); }, []);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Regiões de Entrega</h2>
          <p className="text-xs text-muted-foreground">Defina bairros e taxas de entrega. Coloque R$ 0,00 para frete grátis.</p>
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

      {/* Zones List */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {zones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MapPin size={40} className="mb-3 opacity-40" />
            <p className="text-sm">Nenhuma região cadastrada</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {zones.map(zone => (
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
