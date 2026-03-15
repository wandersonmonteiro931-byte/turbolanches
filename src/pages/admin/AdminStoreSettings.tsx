import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { Save, Store, MessageCircle, Image as ImageIcon, Plus, Building2 } from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";

interface StoreSettingsData {
  id: string;
  store_display_name: string;
  store_logo_url: string;
  whatsapp_number: string;
  whatsapp_name: string;
}

interface StoreData {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  whatsapp_number: string;
  whatsapp_name: string;
  active: boolean;
}

const AdminStoreSettings = () => {
  const { toast } = useToast();
  const { storeId } = useStore();
  const [settings, setSettings] = useState<StoreSettingsData | null>(null);
  const [stores, setStores] = useState<StoreData[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewStore, setShowNewStore] = useState(false);
  const [newStore, setNewStore] = useState({ name: "", slug: "", whatsapp_number: "", whatsapp_name: "" });
  const [creatingStore, setCreatingStore] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      let settingsQuery = supabase
        .from("store_settings")
        .select("id, store_display_name, store_logo_url, whatsapp_number, whatsapp_name")
        .limit(1);
      if (storeId) settingsQuery = settingsQuery.eq("store_id", storeId);

      const [settingsRes, storesRes] = await Promise.all([
        settingsQuery.single(),
        supabase.from("stores").select("*").order("created_at"),
      ]);

      if (settingsRes.data) setSettings(settingsRes.data as any);
      if (storesRes.data) setStores(storesRes.data as StoreData[]);
      setLoading(false);
    };
    fetch();
  }, [storeId]);

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

  const createStore = async () => {
    if (!newStore.name || !newStore.slug) {
      toast({ title: "Nome e slug são obrigatórios", variant: "destructive" });
      return;
    }
    setCreatingStore(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { data: store, error } = await supabase
        .from("stores")
        .insert({
          name: newStore.name,
          slug: newStore.slug.toLowerCase().replace(/[^a-z0-9-]/g, ""),
          owner_user_id: user.id,
          whatsapp_number: newStore.whatsapp_number,
          whatsapp_name: newStore.whatsapp_name,
        } as any)
        .select("id")
        .single();

      if (error) throw error;

      // Create default store_settings for this new store
      await supabase.from("store_settings").insert({
        store_id: store.id,
        store_display_name: newStore.name,
        whatsapp_number: newStore.whatsapp_number,
        whatsapp_name: newStore.whatsapp_name,
      } as any);

      // Create default schedule for this new store
      for (let day = 0; day <= 6; day++) {
        await supabase.from("store_schedule").insert({
          store_id: store.id,
          day_of_week: day,
          open_time: "18:00",
          close_time: "23:00",
          is_closed: false,
        } as any);
      }

      toast({ title: "✅ Nova loja criada com sucesso!" });
      setShowNewStore(false);
      setNewStore({ name: "", slug: "", whatsapp_number: "", whatsapp_name: "" });

      // Refresh stores list
      const { data: storesData } = await supabase.from("stores").select("*").order("created_at");
      if (storesData) setStores(storesData as StoreData[]);
    } catch (err: any) {
      toast({ title: err.message || "Erro ao criar loja", variant: "destructive" });
    } finally {
      setCreatingStore(false);
    }
  };

  const toggleStoreActive = async (store: StoreData) => {
    await supabase.from("stores").update({ active: !store.active } as any).eq("id", store.id);
    const { data } = await supabase.from("stores").select("*").order("created_at");
    if (data) setStores(data as StoreData[]);
    toast({ title: store.active ? "Loja desativada" : "Loja ativada" });
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

  return (
    <div className="space-y-6">
      {/* Store Identity */}
      {settings && (
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
      )}

      {/* WhatsApp */}
      {settings && (
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
      )}

      {/* Multi-tenant: Stores Management */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Building2 size={20} className="text-primary" />
            Lojas (Multi-tenant)
          </h2>
          <button
            onClick={() => setShowNewStore(!showNewStore)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            <Plus size={16} /> Nova Loja
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Crie novas lojas com cardápio e painel independente. Cada loja terá seu próprio subdomínio.
        </p>

        {showNewStore && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <h3 className="text-sm font-bold text-foreground">Criar Nova Loja</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome da Loja *</label>
                <input
                  type="text"
                  value={newStore.name}
                  onChange={(e) => setNewStore({ ...newStore, name: e.target.value })}
                  placeholder="Ex: Burger House"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Slug (URL) *</label>
                <input
                  type="text"
                  value={newStore.slug}
                  onChange={(e) => setNewStore({ ...newStore, slug: e.target.value })}
                  placeholder="Ex: burger-house"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Acessível em: {newStore.slug || "slug"}.seudominio.com
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">WhatsApp (DDD+Número)</label>
                <input
                  type="text"
                  value={newStore.whatsapp_number}
                  onChange={(e) => setNewStore({ ...newStore, whatsapp_number: e.target.value })}
                  placeholder="Ex: 62999999999"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome do Contato</label>
                <input
                  type="text"
                  value={newStore.whatsapp_name}
                  onChange={(e) => setNewStore({ ...newStore, whatsapp_name: e.target.value })}
                  placeholder="Ex: Atendimento"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={createStore}
              disabled={creatingStore}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
            >
              {creatingStore ? "Criando..." : "Criar Loja"}
            </button>
          </div>
        )}

        {/* Stores list */}
        <div className="space-y-2">
          {stores.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3">
              <div className="flex items-center gap-3">
                {s.logo_url ? (
                  <img src={s.logo_url} alt={s.name} className="h-10 w-10 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Building2 size={18} className="text-primary" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold text-foreground">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.slug}.seudominio.com</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.active ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {s.active ? "Ativa" : "Inativa"}
                </span>
                <button
                  onClick={() => toggleStoreActive(s)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  {s.active ? "Desativar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
          {stores.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhuma loja criada ainda.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">💡 Dicas</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>O <strong>nome da loja</strong> aparecerá no cabeçalho do site e nas comandas.</li>
          <li>O <strong>logotipo</strong> será exibido no topo do cardápio.</li>
          <li>O <strong>link do WhatsApp</strong> será disponibilizado para os clientes no checkout e na tela de pedidos.</li>
          <li>Insira o número com DDD sem o +55 (ex: 62999999999).</li>
          <li>Cada <strong>loja criada</strong> terá produtos, categorias, pedidos e configurações independentes.</li>
          <li>O <strong>slug</strong> define o subdomínio de acesso da loja.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminStoreSettings;
