import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Save, Store, MessageCircle, Image as ImageIcon } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";

interface StoreSettingsData {
  id: string;
  store_display_name: string;
  store_logo_url: string;
  whatsapp_number: string;
  whatsapp_name: string;
}

const AdminStoreSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<StoreSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("id, store_display_name, store_logo_url, whatsapp_number, whatsapp_name")
        .limit(1)
        .single();
      if (data) setSettings(data as any);
      setLoading(false);
    };
    fetch();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    setUploading(true);
    const url = await uploadImage(file, "logos");
    if (url) {
      setSettings({ ...settings, store_logo_url: url });
      toast({ title: "✅ Logo enviado!" });
    } else {
      toast({ title: "Erro ao enviar logo", variant: "destructive" });
    }
    setUploading(false);
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("store_settings")
      .update({
        store_display_name: settings.store_display_name,
        store_logo_url: settings.store_logo_url,
        whatsapp_number: settings.whatsapp_number,
        whatsapp_name: settings.whatsapp_name,
      } as any)
      .eq("id", settings.id);

    if (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } else {
      toast({ title: "✅ Configurações salvas!" });
    }
    setSaving(false);
  };

  const whatsappLink = settings?.whatsapp_number
    ? `https://wa.me/55${settings.whatsapp_number.replace(/\D/g, "")}`
    : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground text-center py-8">Configurações não encontradas.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Store Identity */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Store size={20} className="text-primary" />
            Identidade da Loja
          </h2>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save size={16} />
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome da Loja</label>
            <input
              type="text"
              value={settings.store_display_name}
              onChange={(e) => setSettings({ ...settings, store_display_name: e.target.value })}
              placeholder="Ex: Turbo Lanches"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Logotipo</label>
            <div className="mt-1 flex items-center gap-3">
              {settings.store_logo_url && (
                <img
                  src={settings.store_logo_url}
                  alt="Logo"
                  className="h-12 w-12 rounded-lg object-cover border border-border"
                />
              )}
              <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <ImageIcon size={14} />
                {uploading ? "Enviando..." : "Enviar Logo"}
                <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* WhatsApp */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <MessageCircle size={20} className="text-green-600" />
          WhatsApp
        </h2>
        <p className="text-xs text-muted-foreground">
          Configure o número e nome que aparecerá no link de contato da loja.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nome do Contato</label>
            <input
              type="text"
              value={settings.whatsapp_name}
              onChange={(e) => setSettings({ ...settings, whatsapp_name: e.target.value })}
              placeholder="Ex: Atendimento Turbo Lanches"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Número (DDD + Número)</label>
            <input
              type="text"
              value={settings.whatsapp_number}
              onChange={(e) => setSettings({ ...settings, whatsapp_number: e.target.value })}
              placeholder="Ex: 62999999999"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
        </div>

        {whatsappLink && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-xs text-green-700 font-medium">Link gerado:</p>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-800 font-bold break-all hover:underline"
            >
              {whatsappLink}
            </a>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">💡 Dicas</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>O <strong>nome da loja</strong> aparecerá no cabeçalho do site e nas comandas.</li>
          <li>O <strong>logotipo</strong> será exibido no topo do cardápio.</li>
          <li>O <strong>link do WhatsApp</strong> será disponibilizado para os clientes no checkout e na tela de pedidos.</li>
          <li>Insira o número com DDD sem o +55 (ex: 62999999999).</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminStoreSettings;
