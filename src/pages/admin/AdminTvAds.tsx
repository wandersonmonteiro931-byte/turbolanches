import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X, Tv, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import ImageUpload from "@/components/admin/ImageUpload";

interface TvAd {
  id: string;
  title: string;
  image_url: string;
  duration_seconds: number;
  sort_order: number;
  active: boolean;
}

const AdminTvAds = () => {
  const { storeId } = useStore();
  const [ads, setAds] = useState<TvAd[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TvAd | null>(null);
  const { toast } = useToast();

  const [form, setForm] = useState({
    title: "",
    image_url: "",
    duration_seconds: "8",
    sort_order: "0",
    active: true,
  });

  const fetchData = async () => {
    let query = supabase.from("tv_ads").select("*").order("sort_order");
    if (storeId) query = query.eq("store_id", storeId);
    const { data } = await query;
    if (data) setAds(data as TvAd[]);
  };

  useEffect(() => {
    fetchData();
  }, [storeId]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", image_url: "", duration_seconds: "8", sort_order: "0", active: true });
    setShowForm(true);
  };

  const openEdit = (a: TvAd) => {
    setEditing(a);
    setForm({
      title: a.title,
      image_url: a.image_url,
      duration_seconds: String(a.duration_seconds),
      sort_order: String(a.sort_order),
      active: a.active,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.image_url) {
      toast({ title: "Envie uma imagem", variant: "destructive" });
      return;
    }
    const payload: any = {
      title: form.title,
      image_url: form.image_url,
      duration_seconds: Math.max(2, parseInt(form.duration_seconds) || 8),
      sort_order: parseInt(form.sort_order) || 0,
      active: form.active,
    };
    if (!editing && storeId) payload.store_id = storeId;
    if (editing) {
      await supabase.from("tv_ads").update(payload).eq("id", editing.id);
      toast({ title: "Anúncio atualizado!" });
    } else {
      await supabase.from("tv_ads").insert(payload);
      toast({ title: "Anúncio criado!" });
    }
    setShowForm(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este anúncio?")) return;
    await supabase.from("tv_ads").delete().eq("id", id);
    toast({ title: "Anúncio removido!" });
    fetchData();
  };

  const openTv = () => {
    window.open(
      `/tv?kiosk=${Date.now()}`,
      "tv_ads_screen",
      "popup,width=1280,height=720"
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Tv size={20} /> TV / Tela Secundária
            </h2>
            <p className="text-xs text-muted-foreground">
              Abra esta tela em um segundo monitor para passar publicidade em loop.
            </p>
          </div>
          <button
            onClick={openTv}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground"
          >
            <ExternalLink size={16} /> Abrir tela TV
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{ads.length} anúncios</p>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
        >
          <Plus size={16} /> Novo
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-auto rounded-xl bg-card p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">
                {editing ? "Editar" : "Novo"} Anúncio
              </h3>
              <button onClick={() => setShowForm(false)}>
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                placeholder="Título (interno)"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
              <div>
                <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Imagem da publicidade
                </label>
                <ImageUpload
                  value={form.image_url}
                  onChange={(url) => setForm({ ...form, image_url: url })}
                  folder="tv-ads"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Duração (seg)
                  </label>
                  <input
                    type="number"
                    min={2}
                    value={form.duration_seconds}
                    onChange={(e) => setForm({ ...form, duration_seconds: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                    Ordem
                  </label>
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm({ ...form, active: e.target.checked })}
                />{" "}
                Ativo
              </label>
              <button
                onClick={handleSave}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {ads.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center text-sm text-muted-foreground">
            Nenhum anúncio cadastrado. Clique em "Novo" para adicionar.
          </div>
        )}
        {ads.map((a) => (
          <div
            key={a.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm"
          >
            {a.image_url && (
              <img
                src={a.image_url}
                alt={a.title}
                className="h-14 w-24 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">
                {a.title || "(sem título)"}
              </p>
              <p className="text-xs text-muted-foreground">
                {a.duration_seconds}s · ordem {a.sort_order}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                a.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
              }`}
            >
              {a.active ? "Ativo" : "Inativo"}
            </span>
            <button
              onClick={() => openEdit(a)}
              className="p-1.5 text-muted-foreground hover:text-foreground"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => handleDelete(a.id)}
              className="p-1.5 text-muted-foreground hover:text-destructive"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminTvAds;
