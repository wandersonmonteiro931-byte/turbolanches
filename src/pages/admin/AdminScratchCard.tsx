import { useEffect, useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Pencil, Trash2, Plus, Gift, Trophy, Settings, Info } from "lucide-react";
import { formatTimeBR } from "@/lib/brasiliaTime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ScratchSettings {
  id?: string;
  store_id: string | null;
  is_enabled: boolean;
  min_order_value: number;
  fallback_message: string;
}

interface ScratchPrize {
  id: string;
  name: string;
  discount_type: string;
  discount_value: number;
  total_quantity: number;
  remaining_quantity: number;
  validity_days: number;
  is_active: boolean;
  store_id: string | null;
  tier: string;
}

interface ScratchWin {
  id: string;
  user_id: string;
  prize_id: string | null;
  order_id: string | null;
  coupon_code: string;
  discount_type: string;
  discount_value: number;
  found_at: string;
  expires_at: string;
  redeemed_at: string | null;
  no_prize: boolean;
  created_at: string;
}

const AdminScratchCard = () => {
  const { storeId } = useStore();
  const [rulesText, setRulesText] = useState("");
  const [rulesLoaded, setRulesLoaded] = useState(false);
  const [settings, setSettings] = useState<ScratchSettings>({
    store_id: null,
    is_enabled: false,
    min_order_value: 30,
    fallback_message: "Infelizmente os prêmios acabaram! Tente na próxima promoção.",
  });
  const [prizes, setPrizes] = useState<ScratchPrize[]>([]);
  const [wins, setWins] = useState<ScratchWin[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [orderValues, setOrderValues] = useState<Record<string, number>>({});
  const [editPrize, setEditPrize] = useState<Partial<ScratchPrize> | null>(null);
  const [prizeDialogOpen, setPrizeDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    let settingsQ = supabase.from("scratch_settings").select("*").limit(1);
    if (storeId) settingsQ = settingsQ.eq("store_id", storeId);
    const { data: sData } = await settingsQ.maybeSingle();
    if (sData) setSettings(sData as any);

    let prizesQ = supabase.from("scratch_prizes").select("*").order("created_at", { ascending: false });
    if (storeId) prizesQ = prizesQ.eq("store_id", storeId);
    const { data: pData } = await prizesQ;
    if (pData) setPrizes(pData as any[]);

    let winsQ = supabase.from("scratch_wins").select("*").order("found_at", { ascending: false });
    if (storeId) winsQ = winsQ.eq("store_id", storeId);
    const { data: wData } = await winsQ;
    if (wData) {
      setWins(wData as any[]);
      const userIds = [...new Set((wData as any[]).map((w: any) => w.user_id))];
      const orderIds = [...new Set((wData as any[]).filter((w: any) => w.order_id).map((w: any) => w.order_id))];

      if (userIds.length) {
        const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", userIds);
        if (profs) {
          const map: Record<string, string> = {};
          profs.forEach((p: any) => { map[p.user_id] = p.full_name; });
          setProfiles(map);
        }
      }
      if (orderIds.length) {
        const { data: orders } = await supabase.from("orders").select("id, subtotal").in("id", orderIds);
        if (orders) {
          const map: Record<string, number> = {};
          orders.forEach((o: any) => { map[o.id] = o.subtotal; });
          setOrderValues(map);
        }
      }
    }
  }, [storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const saveSettings = async () => {
    setSaving(true);
    if (settings.id) {
      await supabase.from("scratch_settings").update({
        is_enabled: settings.is_enabled,
        min_order_value: settings.min_order_value,
        fallback_message: settings.fallback_message,
      }).eq("id", settings.id);
    } else {
      const { data } = await supabase.from("scratch_settings").insert({
        store_id: storeId,
        is_enabled: settings.is_enabled,
        min_order_value: settings.min_order_value,
        fallback_message: settings.fallback_message,
      }).select().single();
      if (data) setSettings(data as any);
    }
    toast.success("Configurações salvas!");
    setSaving(false);
  };

  const savePrize = async () => {
    if (!editPrize?.name || !editPrize?.discount_value) {
      toast.error("Preencha todos os campos");
      return;
    }
    setSaving(true);
    if (editPrize.id) {
      await supabase.from("scratch_prizes").update({
        name: editPrize.name,
        discount_type: editPrize.discount_type,
        discount_value: editPrize.discount_value,
        total_quantity: editPrize.total_quantity,
        remaining_quantity: editPrize.remaining_quantity,
        validity_days: editPrize.validity_days,
        is_active: editPrize.is_active,
        tier: editPrize.tier || "regular",
      }).eq("id", editPrize.id);
    } else {
      await supabase.from("scratch_prizes").insert({
        store_id: storeId,
        name: editPrize.name,
        discount_type: editPrize.discount_type || "percentage",
        discount_value: editPrize.discount_value,
        total_quantity: editPrize.total_quantity || 0,
        remaining_quantity: editPrize.remaining_quantity ?? editPrize.total_quantity ?? 0,
        validity_days: editPrize.validity_days || 7,
        is_active: editPrize.is_active ?? true,
        tier: editPrize.tier || "regular",
      });
    }
    toast.success("Prêmio salvo!");
    setPrizeDialogOpen(false);
    setEditPrize(null);
    setSaving(false);
    fetchData();
  };

  const deletePrize = async (id: string) => {
    if (!confirm("Excluir este prêmio?")) return;
    await supabase.from("scratch_prizes").delete().eq("id", id);
    toast.success("Prêmio excluído");
    fetchData();
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  const tierLabel = (tier: string) => tier === "premium" ? "Premium" : "Regular";

  return (
    <div className="space-y-6">
      <Tabs defaultValue="settings" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings size={14} /> Config
          </TabsTrigger>
          <TabsTrigger value="prizes" className="gap-1.5">
            <Gift size={14} /> Prêmios
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5">
            <Trophy size={14} /> Histórico
          </TabsTrigger>
        </TabsList>

        {/* SETTINGS TAB */}
        <TabsContent value="settings">
          <div className="space-y-4">
            {(() => {
              const totalPrizes = prizes.reduce((s, p) => s + p.total_quantity, 0);
              const totalRemaining = prizes.reduce((s, p) => s + p.remaining_quantity, 0);
              const totalAwarded = totalPrizes - totalRemaining;
              const totalRedeemed = wins.filter((w) => w.redeemed_at && !w.no_prize).length;
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-primary">{totalAwarded}</p><p className="text-xs text-muted-foreground">Distribuídos</p></CardContent></Card>
                  <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-foreground">{totalPrizes}</p><p className="text-xs text-muted-foreground">Limite Total</p></CardContent></Card>
                  <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-green-600">{totalRedeemed}</p><p className="text-xs text-muted-foreground">Resgatados</p></CardContent></Card>
                  <Card><CardContent className="pt-4 pb-3 text-center"><p className="text-2xl font-bold text-scratch-amber">{totalRemaining}</p><p className="text-xs text-muted-foreground">Restantes</p></CardContent></Card>
                </div>
              );
            })()}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configurações da Raspadinha</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>Funcionalidade ativa</Label>
                  <Switch checked={settings.is_enabled} onCheckedChange={(v) => setSettings({ ...settings, is_enabled: v })} />
                </div>
                <div className="space-y-1">
                  <Label>Valor mínimo da compra (sem frete)</Label>
                  <Input type="number" value={settings.min_order_value} onChange={(e) => setSettings({ ...settings, min_order_value: Number(e.target.value) })} />
                </div>
                <div className="space-y-1">
                  <Label>Mensagem quando acabar os prêmios</Label>
                  <Input value={settings.fallback_message} onChange={(e) => setSettings({ ...settings, fallback_message: e.target.value })} />
                </div>

                {/* Rules info box */}
                <div className="rounded-lg border border-border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-foreground mb-1">
                    <Info size={14} /> Regras automáticas
                  </div>
                  <p>• Toda raspadinha <span className="font-semibold text-foreground">sempre</span> terá um prêmio.</p>
                  <p>• As <span className="font-semibold text-foreground">2 primeiras vezes</span> que um cliente ganha, recebe prêmios <Badge variant="default" className="text-[10px] px-1.5 py-0">Premium</Badge>.</p>
                  <p>• A partir da 3ª vez, recebe prêmios <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Regular</Badge>.</p>
                  <p>• Se o estoque de uma categoria acabar, o sistema busca o próximo disponível.</p>
                </div>

                <Button onClick={saveSettings} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : "Salvar Configurações"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* PRIZES TAB */}
        <TabsContent value="prizes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Prêmios Cadastrados</CardTitle>
              <Dialog open={prizeDialogOpen} onOpenChange={setPrizeDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    onClick={() =>
                      setEditPrize({
                        name: "",
                        discount_type: "percentage",
                        discount_value: 0,
                        total_quantity: 50,
                        remaining_quantity: 50,
                        validity_days: 7,
                        is_active: true,
                        tier: "regular",
                      })
                    }
                  >
                    <Plus size={14} className="mr-1" /> Novo Prêmio
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editPrize?.id ? "Editar" : "Novo"} Prêmio</DialogTitle>
                  </DialogHeader>
                  {editPrize && (
                    <div className="space-y-3">
                      <div>
                        <Label>Nome do cupom</Label>
                        <Input value={editPrize.name || ""} onChange={(e) => setEditPrize({ ...editPrize, name: e.target.value })} placeholder="DESCONTO10" />
                      </div>
                      <div>
                        <Label>Categoria do prêmio</Label>
                        <Select value={editPrize.tier || "regular"} onValueChange={(v) => setEditPrize({ ...editPrize, tier: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="premium">⭐ Premium (1ª e 2ª vez)</SelectItem>
                            <SelectItem value="regular">🎯 Regular (3ª vez em diante)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Premium = prêmios melhores para as 2 primeiras raspadinhas do cliente
                        </p>
                      </div>
                      <div>
                        <Label>Tipo de desconto</Label>
                        <Select value={editPrize.discount_type || "percentage"} onValueChange={(v) => setEditPrize({ ...editPrize, discount_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percentage">Percentual (%)</SelectItem>
                            <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Valor do desconto</Label>
                        <Input type="number" value={editPrize.discount_value || 0} onChange={(e) => setEditPrize({ ...editPrize, discount_value: Number(e.target.value) })} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Quantidade total</Label>
                          <Input
                            type="number"
                            value={editPrize.total_quantity || 0}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setEditPrize({
                                ...editPrize,
                                total_quantity: v,
                                remaining_quantity: editPrize.id ? editPrize.remaining_quantity : v,
                              });
                            }}
                          />
                        </div>
                        <div>
                          <Label>Restantes</Label>
                          <Input type="number" value={editPrize.remaining_quantity ?? 0} onChange={(e) => setEditPrize({ ...editPrize, remaining_quantity: Number(e.target.value) })} />
                        </div>
                      </div>
                      <div>
                        <Label>Validade após encontrar (dias)</Label>
                        <Input type="number" value={editPrize.validity_days || 7} onChange={(e) => setEditPrize({ ...editPrize, validity_days: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={editPrize.is_active ?? true} onCheckedChange={(v) => setEditPrize({ ...editPrize, is_active: v })} />
                        <Label>Ativo</Label>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <DialogClose asChild>
                          <Button variant="outline" className="flex-1">Cancelar</Button>
                        </DialogClose>
                        <Button onClick={savePrize} disabled={saving} className="flex-1">
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {prizes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum prêmio cadastrado</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Categoria</TableHead>
                        <TableHead>Desconto</TableHead>
                        <TableHead>Estoque</TableHead>
                        <TableHead>Validade</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-20">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prizes.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <Badge variant={p.tier === "premium" ? "default" : "secondary"} className="text-[10px]">
                              {p.tier === "premium" ? "⭐ Premium" : "🎯 Regular"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {p.discount_type === "percentage" ? `${p.discount_value}%` : formatCurrency(p.discount_value)}
                          </TableCell>
                          <TableCell>{p.remaining_quantity}/{p.total_quantity}</TableCell>
                          <TableCell>{p.validity_days} dias</TableCell>
                          <TableCell>
                            <Badge variant={p.is_active ? "default" : "secondary"}>
                              {p.is_active ? "Ativo" : "Inativo"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" onClick={() => { setEditPrize(p); setPrizeDialogOpen(true); }}>
                                <Pencil size={14} />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => deletePrize(p.id)}>
                                <Trash2 size={14} className="text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Histórico de Raspadinhas</CardTitle>
            </CardHeader>
            <CardContent>
              {wins.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhuma raspadinha encontrada ainda</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Cupom</TableHead>
                        <TableHead>Desconto</TableHead>
                        <TableHead>Encontrado em</TableHead>
                        <TableHead>Valor Compra</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Resgate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wins.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>{profiles[w.user_id] || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{w.coupon_code}</TableCell>
                          <TableCell>
                            {w.discount_type === "percentage" ? `${w.discount_value}%` : formatCurrency(w.discount_value)}
                          </TableCell>
                          <TableCell className="text-xs">
                            {new Date(w.found_at).toLocaleDateString("pt-BR")} {formatTimeBR(w.found_at)}
                          </TableCell>
                          <TableCell>
                            {w.order_id && orderValues[w.order_id] ? formatCurrency(orderValues[w.order_id]) : "—"}
                          </TableCell>
                          <TableCell>
                            {w.redeemed_at ? (
                              <Badge className="bg-green-600">Resgatado</Badge>
                            ) : new Date(w.expires_at) < new Date() ? (
                              <Badge variant="destructive">Expirado</Badge>
                            ) : (
                              <Badge variant="outline">Não resgatado</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {w.redeemed_at ? `${new Date(w.redeemed_at).toLocaleDateString("pt-BR")} ${formatTimeBR(w.redeemed_at)}` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminScratchCard;
