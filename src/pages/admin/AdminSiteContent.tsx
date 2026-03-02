import { useEffect, useState } from "react";
import { Pencil, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
};

const AdminSiteContent = () => {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  const fetchData = async () => {
    const { data } = await supabase.from("site_content").select("*").order("key");
    if (data) setItems(data);
  };

  useEffect(() => { fetchData(); }, []);

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
    await supabase.from("site_content").insert({ key, value: "", content_type: type });
    toast({ title: "Conteúdo criado!" });
    fetchData();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} itens de conteúdo</p>
        <button onClick={handleAdd} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          + Novo
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
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
