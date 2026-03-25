import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FolderPlus, Plus, Pencil, Trash2, X, Search, Tag, Thermometer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { supabase } from "@/integrations/supabase/client";
import AdminProducts from "./AdminProducts";
import IngredientsTab from "@/components/admin/pricing/IngredientsTab";

interface StorageConfig {
  id: string;
  name: string;
  emoji: string;
  default_temp: string;
  default_phrase: string;
  sort_order: number;
  active: boolean;
}

const StorageConfigsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<StorageConfig[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("");
  const [newTemp, setNewTemp] = useState("");
  const [newPhrase, setNewPhrase] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmoji, setEditEmoji] = useState("");
  const [editTemp, setEditTemp] = useState("");
  const [editPhrase, setEditPhrase] = useState("");

  const fetchItems = async () => {
    const db = supabase as any;
    let query = db.from("storage_configs").select("*").order("sort_order").order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Erro ao carregar", description: error.message, variant: "destructive" });
      return;
    }
    setItems((data ?? []) as StorageConfig[]);
  };

  useEffect(() => { void fetchItems(); }, [storeId]);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const db = supabase as any;
    const { error } = await db.from("storage_configs").insert({
      name: newName.trim(),
      emoji: newEmoji.trim(),
      default_temp: newTemp.trim(),
      default_phrase: newPhrase.trim(),
      store_id: storeId ?? null,
      sort_order: items.length,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setNewName(""); setNewEmoji(""); setNewTemp(""); setNewPhrase("");
    toast({ title: "Tipo de armazenamento adicionado" });
    void fetchItems();
  };

  const handleUpdate = async () => {
    if (!editingId || !editName.trim()) return;
    const db = supabase as any;
    const { error } = await db.from("storage_configs").update({
      name: editName.trim(),
      emoji: editEmoji.trim(),
      default_temp: editTemp.trim(),
      default_phrase: editPhrase.trim(),
    }).eq("id", editingId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    toast({ title: "Atualizado" });
    void fetchItems();
  };

  const handleDelete = async (id: string) => {
    const db = supabase as any;
    const { error } = await db.from("storage_configs").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removido" });
    void fetchItems();
  };

  const startEdit = (item: StorageConfig) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditEmoji(item.emoji);
    setEditTemp(item.default_temp);
    setEditPhrase(item.default_phrase);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[60px_1fr_1fr_1fr] items-end">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Emoji <span className="text-muted-foreground/60 font-normal">(opcional)</span></label>
          <Input value={newEmoji} onChange={(e) => setNewEmoji(e.target.value)} placeholder="Ex: ❄️" maxLength={4} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Nome</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Resfriado" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Temp. padrão</label>
          <Input value={newTemp} onChange={(e) => setNewTemp(e.target.value)} placeholder="Ex: -18" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-muted-foreground">Frase padrão</label>
          <Input value={newPhrase} onChange={(e) => setNewPhrase(e.target.value)} placeholder="Ex: Manter resfriado entre 0°C e 5°C" onKeyDown={(e) => e.key === "Enter" && handleAdd()} />
        </div>
      </div>
      <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
        <Plus className="h-4 w-4" /> Adicionar
      </Button>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum tipo cadastrado. Adicione acima.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background px-3 py-2">
              {editingId === item.id ? (
                <div className="flex flex-wrap items-center gap-2 w-full">
                  <Input className="w-14" value={editEmoji} onChange={(e) => setEditEmoji(e.target.value)} maxLength={4} />
                  <Input className="flex-1 min-w-[100px]" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <Input className="w-20" value={editTemp} onChange={(e) => setEditTemp(e.target.value)} placeholder="Temp" />
                  <Input className="flex-1 min-w-[140px]" value={editPhrase} onChange={(e) => setEditPhrase(e.target.value)} placeholder="Frase" />
                  <Button size="sm" onClick={handleUpdate}><Tag className="h-3.5 w-3.5" />Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5" /></Button>
                </div>
              ) : (
                <>
                  {item.emoji && <span className="text-lg">{item.emoji}</span>}
                  <span className="font-bold text-sm">{item.name}</span>
                  {item.default_temp && <Badge variant="outline">{item.default_temp}°C</Badge>}
                  <span className="flex-1 text-xs text-muted-foreground truncate">{item.default_phrase}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface Brand {
  id: string;
  name: string;
}

const BrandsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [search, setSearch] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const fetchBrands = async () => {
    const db = supabase as any;
    let query = db.from("brands").select("id, name").order("name");
    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query;
    if (error) {
      toast({ title: "Erro ao carregar marcas", description: error.message, variant: "destructive" });
      return;
    }
    setBrands((data ?? []) as Brand[]);
  };

  useEffect(() => {
    void fetchBrands();
  }, [storeId]);

  const handleAdd = async () => {
    if (!newBrandName.trim()) return;
    const db = supabase as any;
    const { error } = await db.from("brands").insert({ name: newBrandName.trim(), store_id: storeId ?? null });
    if (error) {
      toast({ title: "Erro ao adicionar marca", description: error.message, variant: "destructive" });
      return;
    }
    setNewBrandName("");
    toast({ title: "Marca cadastrada!" });
    await fetchBrands();
  };

  const handleUpdate = async (id: string) => {
    if (!editingName.trim()) return;
    const db = supabase as any;
    const { error } = await db.from("brands").update({ name: editingName.trim() }).eq("id", id);
    if (error) {
      toast({ title: "Erro ao atualizar", description: error.message, variant: "destructive" });
      return;
    }
    setEditingId(null);
    toast({ title: "Marca atualizada!" });
    await fetchBrands();
  };

  const handleDelete = async (id: string) => {
    const db = supabase as any;
    const { error } = await db.from("brands").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marca removida!" });
    await fetchBrands();
  };

  const filtered = brands.filter((b) => !search.trim() || b.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{filtered.length} marca(s) cadastrada(s)</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pesquisar marca" className="pl-10" />
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          placeholder="Nome da nova marca"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd} disabled={!newBrandName.trim()}>
          <Plus className="h-4 w-4" /> Adicionar
        </Button>
      </div>

      <div className="overflow-auto rounded-xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma marca cadastrada.</div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((brand) => (
              <div key={brand.id} className="flex items-center gap-3 px-4 py-3">
                {editingId === brand.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleUpdate(brand.id)}
                    />
                    <Button size="sm" onClick={() => handleUpdate(brand.id)}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Tag size={14} className="text-primary shrink-0" />
                    <span className="flex-1 text-sm font-medium text-foreground">{brand.name}</span>
                    <button onClick={() => { setEditingId(brand.id); setEditingName(brand.name); }} className="p-1.5 text-muted-foreground hover:text-foreground">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(brand.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                      <Trash2 size={16} />
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

const AdminCatalogRegistrations = () => {
  const [tab, setTab] = useState("items");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              <CardTitle>Cadastros</CardTitle>
            </div>
            <CardDescription>
              Cadastre manualmente os itens, ingredientes e marcas usados no painel. Esses dados alimentam precificação, etiquetas e outras áreas administrativas.
            </CardDescription>
          </div>

          <Button asChild variant="outline">
            <Link to="/admin/precificacao">Ir para precificação</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto w-full flex-wrap gap-2">
              <TabsTrigger value="items">Itens</TabsTrigger>
              <TabsTrigger value="ingredients">Ingredientes</TabsTrigger>
              <TabsTrigger value="brands">Marcas</TabsTrigger>
              <TabsTrigger value="storage" className="gap-1"><Thermometer className="h-3.5 w-3.5" />Armazenamento</TabsTrigger>
            </TabsList>
            <TabsContent value="items" className="mt-4">
              <AdminProducts />
            </TabsContent>
            <TabsContent value="ingredients" className="mt-4">
              <IngredientsTab />
            </TabsContent>
            <TabsContent value="brands" className="mt-4">
              <BrandsTab />
            </TabsContent>
            <TabsContent value="storage" className="mt-4">
              <StorageConfigsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCatalogRegistrations;
