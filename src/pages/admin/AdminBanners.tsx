import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import ImageUpload from "@/components/admin/ImageUpload";

interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  link: string;
  sort_order: number;
  active: boolean;
}

const AdminBanners = () => {
  const { storeId } = useStore();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Banner | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "", subtitle: "", image_url: "", link: "", sort_order: "0", active: true,
  });

  const fetchData = async () => {
    let query = supabase.from("banners").select("*").order("sort_order");
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query;
    if (data) setBanners(data);
  };

  useEffect(() => { fetchData(); }, [storeId]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", subtitle: "", image_url: "", link: "", sort_order: "0", active: true });
    setShowForm(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title, subtitle: b.subtitle, image_url: b.image_url,
      link: b.link, sort_order: String(b.sort_order), active: b.active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const payload: any = {
      title: form.title, subtitle: form.subtitle, image_url: form.image_url,
      link: form.link, sort_order: parseInt(form.sort_order) || 0, active: form.active,
    };
    if (!editing && storeId) payload.store_id = storeId;
    if (editing) {
      await supabase.from("banners").update(payload).eq("id", editing.id);
      toast({ title: "Banner atualizado!" });
    } else {
      await supabase.from("banners").insert(payload);
      toast({ title: "Banner criado!" });
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    await supabase.from("banners").delete().eq("id", id);
    toast({ title: "Banner removido!" });
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{banners.length} banners</p>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-5 shadow-lg max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Novo"} Banner</h3>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-muted-foreground" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Título" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <input placeholder="Subtítulo" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <ImageUpload value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="banners" />
              <input placeholder="Link (opcional)" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <input placeholder="Ordem" type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm" />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
              </label>
              <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {banners.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
            {b.image_url && <img src={b.image_url} alt={b.title} className="h-12 w-20 rounded-lg object-cover" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{b.title || "(sem título)"}</p>
              <p className="text-xs text-muted-foreground">Ordem: {b.sort_order}</p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${b.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
              {b.active ? "Ativo" : "Inativo"}
            </span>
            <button onClick={() => openEdit(b)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
            <button onClick={() => handleDelete(b.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminBanners;
