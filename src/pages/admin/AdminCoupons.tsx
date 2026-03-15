import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Ticket } from "lucide-react";
import { nowBrasilia, formatDateBR } from "@/lib/brasiliaTime";
import { useStore } from "@/contexts/StoreContext";

interface Coupon {
  id: string;
  code: string;
  type: string;
  value: number;
  active: boolean;
  used_count: number;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  min_order: number | null;
  expires_at: string | null;
  starts_at: string | null;
  first_purchase_only: boolean;
  created_at: string;
}

const empty: Omit<Coupon, "id" | "created_at" | "used_count"> = {
  code: "",
  type: "percentage",
  value: 0,
  active: true,
  max_uses: null,
  max_uses_per_customer: null,
  min_order: null,
  expires_at: null,
  starts_at: null,
  first_purchase_only: false,
};

/** Convert an ISO timestamp to a datetime-local input value in Brasília timezone */
function toLocalDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Convert a datetime-local input value to an ISO string assuming Brasília timezone (UTC-3) */
function fromLocalDate(val: string): string | null {
  if (!val) return null;
  // datetime-local gives "YYYY-MM-DDTHH:mm" — treat as Brasília time (UTC-3)
  return new Date(val + ":00-03:00").toISOString();
}

function couponStatus(c: Coupon): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
  if (!c.active) return { label: "Inativo", variant: "secondary" };
  const now = nowBrasilia();
  if (c.expires_at && new Date(c.expires_at) < now) return { label: "Expirado", variant: "destructive" };
  if (c.starts_at && new Date(c.starts_at) > now) return { label: "Agendado", variant: "outline" };
  return { label: "Ativo", variant: "default" };
}

const AdminCoupons = () => {
  const { storeId } = useStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchCoupons = async () => {
    if (!storeId) return;
    const { data } = await supabase.from("coupons").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchCoupons(); }, [storeId]);

  const openCreate = () => {
    setEditingId(null);
    setForm(empty);
    setModalOpen(true);
  };

  const openEdit = (c: Coupon) => {
    setEditingId(c.id);
    setForm({
      code: c.code,
      type: c.type,
      value: c.value,
      active: c.active,
      max_uses: c.max_uses,
      max_uses_per_customer: c.max_uses_per_customer,
      min_order: c.min_order,
      expires_at: c.expires_at,
      starts_at: c.starts_at,
      first_purchase_only: c.first_purchase_only,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error("Nome do cupom é obrigatório"); return; }
    if (form.value <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    if (form.type === "percentage" && form.value > 100) { toast.error("Percentual máximo é 100%"); return; }
    if (form.starts_at && form.expires_at && new Date(form.starts_at) > new Date(form.expires_at)) {
      toast.error("Data de início não pode ser posterior à data de fim");
      return;
    }
    if (!form.starts_at || !form.expires_at) { toast.error("Datas de início e fim são obrigatórias"); return; }

    setSaving(true);
    const payload = {
      code: form.code.toUpperCase().trim(),
      type: form.type,
      value: form.value,
      active: form.active,
      max_uses: form.max_uses || null,
      max_uses_per_customer: form.max_uses_per_customer || null,
      min_order: form.min_order || null,
      expires_at: form.expires_at,
      starts_at: form.starts_at,
      first_purchase_only: form.first_purchase_only,
      store_id: storeId,
    };

    if (editingId) {
      const { error } = await supabase.from("coupons").update(payload).eq("id", editingId);
      if (error) toast.error(error.message); else toast.success("Cupom atualizado!");
    } else {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) {
        if (error.message.includes("duplicate") || error.message.includes("unique")) toast.error("Já existe um cupom com esse código");
        else toast.error(error.message);
      } else toast.success("Cupom criado!");
    }
    setSaving(false);
    setModalOpen(false);
    fetchCoupons();
  };

  const toggleActive = async (c: Coupon) => {
    await supabase.from("coupons").update({ active: !c.active }).eq("id", c.id);
    fetchCoupons();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("coupons").delete().eq("id", deleteId);
    if (error) toast.error(error.message); else toast.success("Cupom excluído!");
    setDeleteId(null);
    fetchCoupons();
  };

  const filtered = coupons.filter((c) => {
    if (search && !c.code.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && c.type !== typeFilter) return false;
    if (statusFilter === "active" && !c.active) return false;
    if (statusFilter === "inactive" && c.active) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold text-foreground">Cupons de Desconto</h2>
        <Button onClick={openCreate} size="sm">
          <Plus size={16} /> Novo Cupom
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por código..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="percentage">Percentual</SelectItem>
            <SelectItem value="fixed">Valor fixo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <Ticket size={40} />
          <p>Nenhum cupom encontrado</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead className="hidden md:table-cell">Validade</TableHead>
                <TableHead className="hidden md:table-cell">Usos</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => {
                const st = couponStatus(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>{c.type === "percentage" ? "Percentual" : "Valor fixo"}</TableCell>
                    <TableCell>{c.type === "percentage" ? `${c.value}%` : `R$ ${Number(c.value).toFixed(2)}`}</TableCell>
                    <TableCell className="hidden text-xs md:table-cell">
                      {c.starts_at ? formatDateBR(c.starts_at) : "—"}{" "}
                      até{" "}
                      {c.expires_at ? formatDateBR(c.expires_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {c.used_count}{c.max_uses ? `/${c.max_uses}` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Switch checked={c.active} onCheckedChange={() => toggleActive(c)} />
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                          <Pencil size={16} />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(c.id)}>
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Cupom" : "Novo Cupom"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Atualize as informações do cupom." : "Preencha os dados para criar um novo cupom."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Código do cupom *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex: PROMO10" className="uppercase" />
            </div>

            <div>
              <Label>Tipo de desconto *</Label>
              <RadioGroup value={form.type} onValueChange={(v) => setForm({ ...form, type: v })} className="mt-1 flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="percentage" id="rp" />
                  <Label htmlFor="rp" className="cursor-pointer">Percentual (%)</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="fixed" id="rf" />
                  <Label htmlFor="rf" className="cursor-pointer">Valor fixo (R$)</Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label>Valor do desconto *</Label>
              <Input type="number" min={0} max={form.type === "percentage" ? 100 : undefined} value={form.value || ""} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Início *</Label>
                <Input type="datetime-local" value={toLocalDate(form.starts_at)} onChange={(e) => setForm({ ...form, starts_at: fromLocalDate(e.target.value) })} />
              </div>
              <div>
                <Label>Fim *</Label>
                <Input type="datetime-local" value={toLocalDate(form.expires_at)} onChange={(e) => setForm({ ...form, expires_at: fromLocalDate(e.target.value) })} />
              </div>
            </div>

            <div>
              <Label>Limite total de usos (opcional)</Label>
              <Input type="number" min={0} value={form.max_uses ?? ""} onChange={(e) => setForm({ ...form, max_uses: e.target.value ? Number(e.target.value) : null })} placeholder="Sem limite" />
            </div>

            <div>
              <Label>Limite de usos por cliente (opcional)</Label>
              <Input type="number" min={0} value={form.max_uses_per_customer ?? ""} onChange={(e) => setForm({ ...form, max_uses_per_customer: e.target.value ? Number(e.target.value) : null })} placeholder="Sem limite — cada cliente usa quantas vezes quiser" />
              <p className="text-[11px] text-muted-foreground mt-1">Independente de outros requisitos (valor mínimo, primeira compra, etc.)</p>
            </div>

            <div>
              <Label>Valor mínimo do pedido (opcional)</Label>
              <Input type="number" min={0} step={0.01} value={form.min_order ?? ""} onChange={(e) => setForm({ ...form, min_order: e.target.value ? Number(e.target.value) : null })} placeholder="Sem mínimo" />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="fpo" checked={form.first_purchase_only} onCheckedChange={(v) => setForm({ ...form, first_purchase_only: !!v })} />
              <Label htmlFor="fpo" className="cursor-pointer">Apenas primeira compra</Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="act" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: !!v })} />
              <Label htmlFor="act" className="cursor-pointer">Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita. O cupom será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminCoupons;
