import { useEffect, useState } from "react";
import { Pencil, Save, X, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import ImageUpload from "@/components/admin/ImageUpload";

interface ContentItem {
  id: string;
  key: string;
  value: string;
  content_type: string;
  updated_at: string;
}

const LABELS: Record<string, string> = {
  home_greeting_prefix: "Saudação da Home (ex: Olá)",
  home_promo_badge: "Badge Promoção (ex: 🔥 PROMOÇÃO DO DIA)",
  home_promo_text: "Texto Promoção (ex: Turbo Smash por R$ 32,90)",
  whatsapp_number: "Número WhatsApp (com DDD, ex: 5562994753582)",
  whatsapp_message: "Mensagem padrão WhatsApp",
  instagram_handle: "Instagram (ex: @turboolanches)",
  flash_phrases: "Frases Flash (gerenciado abaixo)",
};

const AdminSiteContent = () => {
  const { storeId } = useStore();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  // Flash phrases state
  const [flashPhrases, setFlashPhrases] = useState<string[]>([]);
  const [flashItem, setFlashItem] = useState<ContentItem | null>(null);
  const [newPhrase, setNewPhrase] = useState("");

  const fetchData = async () => {
    let query = supabase.from("site_content").select("*").order("key");
    if (storeId) query = query.or(`store_id.eq.${storeId},store_id.is.null`);
    const { data } = await query;
    if (data) {
      setItems(data);
      const fp = data.find((d) => d.key === "flash_phrases");
      if (fp) {
        setFlashItem(fp);
        try {
          setFlashPhrases(JSON.parse(fp.value) || []);
        } catch {
          setFlashPhrases([]);
        }
      }
    }
  };

  useEffect(() => { fetchData(); }, [storeId]);

  const startEdit = (item: ContentItem) => {
    setEditingId(item.id);
    setEditValue(item.value);
  };

  const handleSave = async (item: ContentItem) => {
    await supabase.from("site_content").update({ value: editValue, updated_at: new Date().toISOString() }).eq("id", item.id);
    toast({ title: "Conteúdo atualizado!" });
    setEditingId(null);
    fetchData();
  };

  const handleAdd = async () => {
    const key = prompt("Chave do conteúdo (ex: home_new_section):");
    if (!key) return;
    const type = prompt("Tipo: text ou image") || "text";
    const payload: any = { key, value: "", content_type: type };
    if (storeId) payload.store_id = storeId;
    await supabase.from("site_content").insert(payload);
    toast({ title: "Conteúdo criado!" });
    fetchData();
  };

  // Flash phrases handlers
  const saveFlashPhrases = async (updated: string[]) => {
    const json = JSON.stringify(updated);
    if (flashItem) {
      await supabase.from("site_content").update({ value: json, updated_at: new Date().toISOString() }).eq("id", flashItem.id);
    } else {
      const payload: any = { key: "flash_phrases", value: json, content_type: "text" };
      if (storeId) payload.store_id = storeId;
      await supabase.from("site_content").insert(payload);
    }
    setFlashPhrases(updated);
    fetchData();
  };

  const addPhrase = () => {
    if (!newPhrase.trim()) return;
    saveFlashPhrases([...flashPhrases, newPhrase.trim()]);
    setNewPhrase("");
    toast({ title: "Frase adicionada!" });
  };

  const removePhrase = (idx: number) => {
    saveFlashPhrases(flashPhrases.filter((_, i) => i !== idx));
    toast({ title: "Frase removida!" });
  };

  const regularItems = items.filter((i) => i.key !== "flash_phrases");

  return (
    <div className="space-y-6">
      {/* Flash Phrases Section */}
      <div className="rounded-xl border border-primary/30 bg-card p-4 shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-3">⚡ Frases Flash (rotativas na home)</h3>
        <div className="space-y-2">
          {flashPhrases.map((phrase, idx) => (
            <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="flex-1 text-sm text-foreground truncate">{phrase}</span>
              <button onClick={() => removePhrase(idx)} className="p-1 text-destructive hover:text-destructive/80">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPhrase()}
              placeholder="Nova frase..."
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <button onClick={addPhrase} className="rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Regular Content */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{regularItems.length} itens de conteúdo</p>
        <button onClick={handleAdd} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          + Novo
        </button>
      </div>

      <div className="space-y-2">
        {regularItems.map((item) => (
          <div key={item.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-foreground">{LABELS[item.key] || item.key}</p>
                <p className="text-[10px] text-muted-foreground font-mono">{item.key}</p>
              </div>
              {editingId === item.id ? (
                <div className="flex gap-1">
                  <button onClick={() => handleSave(item)} className="p-1.5 text-primary hover:text-primary/80"><Save size={16} /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 text-muted-foreground"><X size={16} /></button>
                </div>
              ) : (
                <button onClick={() => startEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
              )}
            </div>

            {editingId === item.id ? (
              item.content_type === "image" ? (
                <ImageUpload value={editValue} onChange={(url) => setEditValue(url)} folder="content" />
              ) : (
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  rows={2}
                />
              )
            ) : (
              <p className="text-sm text-muted-foreground break-all">
                {item.content_type === "image" && item.value ? (
                  <img src={item.value} alt={item.key} className="h-16 rounded-lg object-cover" />
                ) : (
                  item.value || "(vazio)"
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminSiteContent;
