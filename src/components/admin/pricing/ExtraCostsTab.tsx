import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { formatCurrency, formatMoneyInput, parseLocaleNumber, parseRoundedMoney } from "./pricingMoney";
import {
  computeExtraCostPreview,
  createMissingPresetPayloads,
  EXTRA_COST_PRESETS,
  formatPercent,
  getExtraCostDisplayName,
  getExtraCostPresetHelper,
  getExtraCostValueLabel,
  normalizeExtraCostDivisionMode,
  normalizeExtraCostType,
  type ExtraCostDivisionMode,
  type PricingExtraCost,
} from "./extraCosting";

interface ExtraCost extends PricingExtraCost {
  id: string;
  name: string;
}

interface ExtraCostForm {
  name: string;
  cost_type: "fixed" | "percentage";
  value: string;
  division_mode: ExtraCostDivisionMode;
  days_duration: string;
  items_per_day: string;
  preset_key: string;
  notes: string;
}

const createEmptyForm = (): ExtraCostForm => ({
  name: "",
  cost_type: "fixed",
  value: "",
  division_mode: "none",
  days_duration: "",
  items_per_day: "",
  preset_key: "",
  notes: "",
});

const buildFormFromItem = (item: ExtraCost): ExtraCostForm => ({
  name: item.name,
  cost_type: normalizeExtraCostType(item.cost_type),
  value: normalizeExtraCostType(item.cost_type) === "fixed" ? formatMoneyInput(item.value) : String(item.value ?? ""),
  division_mode: normalizeExtraCostDivisionMode(item.division_mode),
  days_duration: item.days_duration ? String(item.days_duration) : "",
  items_per_day: item.items_per_day ? String(item.items_per_day) : "",
  preset_key: item.preset_key ?? "",
  notes: item.notes ?? "",
});

const ExtraCostsTab = () => {
  const { storeId } = useStore();
  const { toast } = useToast();
  const [items, setItems] = useState<ExtraCost[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExtraCost | null>(null);
  const [form, setForm] = useState<ExtraCostForm>(createEmptyForm());
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const buildQuery = () => {
    let query = supabase.from("extra_costs").select("*").order("sort_order").order("name");
    if (storeId) query = query.eq("store_id", storeId);
    return query;
  };

  const ensureDefaultCosts = async (existingItems: ExtraCost[]) => {
    const missingPayloads = createMissingPresetPayloads(existingItems, storeId);
    if (missingPayloads.length === 0) return existingItems;

    const { error } = await supabase.from("extra_costs").insert(missingPayloads);
    if (error) {
      toast({ title: "Não foi possível criar os custos padrão", description: error.message });
      return existingItems;
    }

    const { data } = await buildQuery();
    return (data || existingItems) as ExtraCost[];
  };

  const fetchData = async () => {
    const { data, error } = await buildQuery();
    if (error) {
      toast({ title: "Não foi possível carregar os custos", description: error.message });
      return;
    }

    const seededItems = await ensureDefaultCosts((data || []) as ExtraCost[]);
    setItems(seededItems);
  };

  useEffect(() => {
    void fetchData();
  }, [storeId]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        !term ||
        getExtraCostDisplayName(item).toLowerCase().includes(term) ||
        (item.notes || "").toLowerCase().includes(term);
      const matchesType =
        filterType === "all" ||
        item.cost_type === filterType ||
        (filterType === "daily" && normalizeExtraCostDivisionMode(item.division_mode) === "daily");

      return matchesSearch && matchesType;
    });
  }, [filterType, items, search]);

  const preview = useMemo(
    () =>
      computeExtraCostPreview({
        cost_type: form.cost_type,
        value: form.cost_type === "fixed" ? parseRoundedMoney(form.value) ?? 0 : parseLocaleNumber(form.value) ?? 0,
        division_mode: form.division_mode,
        days_duration: parseLocaleNumber(form.days_duration) ?? 0,
        items_per_day: parseLocaleNumber(form.items_per_day) ?? 0,
      }),
    [form],
  );

  const openNew = () => {
    setEditing(null);
    setForm(createEmptyForm());
    setShowForm(true);
  };

  const openEdit = (item: ExtraCost) => {
    setEditing(item);
    setForm(buildFormFromItem(item));
    setShowForm(true);
  };

  const handlePresetSelect = (presetKey: string) => {
    if (!presetKey) {
      setForm((current) => ({ ...current, preset_key: "" }));
      return;
    }

    const preset = EXTRA_COST_PRESETS.find((entry) => entry.key === presetKey);
    if (!preset) return;

    setForm((current) => ({
      ...current,
      preset_key: preset.key,
      name: preset.name,
      cost_type: "fixed",
      division_mode: "daily",
      notes: preset.helper,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;

    const parsedValue = form.cost_type === "fixed" ? parseRoundedMoney(form.value) : parseLocaleNumber(form.value);

    if (parsedValue === null) {
      toast({
        title: "Valor inválido",
        description: form.cost_type === "fixed" ? "Informe um valor no formato R$ 0,00." : "Informe um percentual válido.",
      });
      return;
    }

    const parsedDays = form.division_mode === "daily" ? parseLocaleNumber(form.days_duration) : null;
    const parsedItemsPerDay = form.division_mode === "daily" ? parseLocaleNumber(form.items_per_day) : null;

    if (form.cost_type === "fixed" && form.division_mode === "daily") {
      if (!parsedDays || parsedDays <= 0 || !parsedItemsPerDay || parsedItemsPerDay <= 0) {
        toast({
          title: "Preencha o rateio por lanche",
          description: "Informe quantos dias o custo dura e quantos lanches são feitos por dia.",
        });
        return;
      }
    }

    const payload = {
      name: form.name.trim(),
      cost_type: form.cost_type,
      value: form.cost_type === "fixed" ? parsedValue : Number(parsedValue.toFixed(2)),
      division_mode: form.cost_type === "fixed" ? form.division_mode : "none",
      days_duration: form.cost_type === "fixed" && form.division_mode === "daily" ? parsedDays : null,
      items_per_day: form.cost_type === "fixed" && form.division_mode === "daily" ? parsedItemsPerDay : null,
      preset_key: form.preset_key || null,
      notes: form.notes.trim(),
    } as const;

    if (!editing && storeId) {
      const insertPayload = { ...payload, store_id: storeId };
      const { error } = await supabase.from("extra_costs").insert(insertPayload);
      if (error) {
        toast({ title: "Não foi possível salvar", description: error.message });
        return;
      }
    } else if (editing) {
      const { error } = await supabase.from("extra_costs").update(payload).eq("id", editing.id);
      if (error) {
        toast({ title: "Não foi possível salvar", description: error.message });
        return;
      }
    }

    toast({ title: editing ? "Custo atualizado!" : "Custo criado!" });
    setShowForm(false);
    setForm(createEmptyForm());
    void fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("extra_costs").delete().eq("id", id);
    if (error) {
      toast({ title: "Não foi possível remover", description: error.message });
      return;
    }

    toast({ title: "Custo removido!" });
    void fetchData();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{filteredItems.length} de {items.length} custos extras</p>
          <p className="text-xs text-muted-foreground">Modelo: valor do custo ÷ dias ÷ lanches por dia = custo de cada lanche.</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Plus size={16} /> Novo
        </button>
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        {EXTRA_COST_PRESETS.map((preset) => (
          <div key={preset.key} className="rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-semibold text-foreground">{preset.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{preset.helper}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Pesquisar custo extra"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-3 text-sm"
          />
        </div>
        <select
          value={filterType}
          onChange={(event) => setFilterType(event.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
        >
          <option value="all">Todos os tipos</option>
          <option value="fixed">Fixo (R$)</option>
          <option value="percentage">Percentual (%)</option>
          <option value="daily">Dividido por dias</option>
        </select>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl bg-card p-5 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{editing ? "Editar" : "Novo"} Custo Extra</h3>
              <button onClick={() => setShowForm(false)} className="rounded-lg p-2 hover:bg-accent">
                <X size={24} className="text-muted-foreground" />
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={form.preset_key}
                onChange={(event) => handlePresetSelect(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="">Modelo livre</option>
                {EXTRA_COST_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.key}>{preset.name}</option>
                ))}
              </select>

              <input
                placeholder="Nome (ex: Embalagem)"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={form.cost_type}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    cost_type: normalizeExtraCostType(e.target.value),
                    division_mode: normalizeExtraCostType(e.target.value) === "percentage" ? "none" : current.division_mode,
                  }))
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
              >
                <option value="fixed">Fixo (R$)</option>
                <option value="percentage">Percentual (%)</option>
              </select>

              <select
                value={form.division_mode}
                onChange={(e) => setForm({ ...form, division_mode: normalizeExtraCostDivisionMode(e.target.value) })}
                disabled={form.cost_type === "percentage"}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="none">Aplicar direto por lanche</option>
                <option value="daily">Dividir por dias</option>
              </select>
            </div>

            <input
              placeholder={form.cost_type === "fixed" ? "R$ 0,00" : "Percentual (%)"}
              type="text"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              onBlur={(e) => {
                if (form.cost_type !== "fixed") return;
                setForm((current) => ({ ...current, value: formatMoneyInput(e.target.value) }));
              }}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />

            {form.cost_type === "fixed" && form.division_mode === "daily" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  placeholder={form.preset_key === "gas" ? "Quantos dias dura o botijão" : "Quantos dias dura esse custo"}
                  type="number"
                  step="0.01"
                  value={form.days_duration}
                  onChange={(e) => setForm({ ...form, days_duration: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
                <input
                  placeholder="Quantos lanches faz por dia"
                  type="number"
                  step="0.01"
                  value={form.items_per_day}
                  onChange={(e) => setForm({ ...form, items_per_day: e.target.value })}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                />
              </div>
            )}

            <textarea
              placeholder="Observações ou fórmula do custo"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
            />

            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <p className="font-semibold text-foreground">Modelo por lanche</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {getExtraCostPresetHelper(form.preset_key) || "Exemplo: conta ÷ dias usados ÷ lanches por dia = custo por lanche."}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valor base</p>
                  <p className="text-sm font-semibold text-foreground">
                    {preview.normalizedType === "percentage" ? formatPercent(preview.baseValue) : formatCurrency(preview.baseValue)}
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo por dia</p>
                  <p className="text-sm font-semibold text-foreground">{preview.dailyValue === null ? "—" : formatCurrency(preview.dailyValue)}</p>
                </div>
                <div className="rounded-lg border border-border bg-background p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Custo por lanche</p>
                  <p className="text-sm font-semibold text-foreground">{preview.perItemValue === null ? "—" : formatCurrency(preview.perItemValue)}</p>
                </div>
              </div>
            </div>

            <button onClick={handleSave} className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground">
              Salvar
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-border bg-card">
        {filteredItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum custo extra encontrado.</p>
        ) : (
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-3 pl-4 pr-2 font-medium text-muted-foreground">Nome</th>
                <th className="px-2 py-3 font-medium text-muted-foreground">Tipo</th>
                <th className="px-2 py-3 font-medium text-muted-foreground">Modelo</th>
                <th className="px-2 py-3 text-right font-medium text-muted-foreground">Valor</th>
                <th className="px-2 py-3 text-right font-medium text-muted-foreground">Dias</th>
                <th className="px-2 py-3 text-right font-medium text-muted-foreground">Lanches/dia</th>
                <th className="px-2 py-3 text-right font-medium text-muted-foreground">Por lanche</th>
                <th className="py-3 pl-2 pr-4 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const itemPreview = computeExtraCostPreview(item);

                return (
                  <tr key={item.id} className="border-b border-border/50 last:border-b-0">
                    <td className="py-3 pl-4 pr-2 font-medium text-foreground">
                      <div>
                        <p>{getExtraCostDisplayName(item)}</p>
                        {item.notes && <p className="text-xs font-normal text-muted-foreground">{item.notes}</p>}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">{item.cost_type === "fixed" ? "Fixo (R$)" : "Percentual (%)"}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {itemPreview.normalizedType === "percentage"
                        ? "Percentual sobre venda"
                        : itemPreview.divisionMode === "daily"
                          ? "Valor ÷ dias ÷ lanches/dia"
                          : "Direto por lanche"}
                    </td>
                    <td className="px-2 py-3 text-right text-foreground">{getExtraCostValueLabel(item)}</td>
                    <td className="px-2 py-3 text-right text-muted-foreground">
                      {itemPreview.divisionMode === "daily" && itemPreview.daysDuration > 0 ? itemPreview.daysDuration : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-muted-foreground">
                      {itemPreview.divisionMode === "daily" && itemPreview.itemsPerDay > 0 ? itemPreview.itemsPerDay : "—"}
                    </td>
                    <td className="px-2 py-3 text-right text-foreground">
                      {itemPreview.perItemValue === null ? "—" : formatCurrency(itemPreview.perItemValue)}
                    </td>
                    <td className="py-3 pl-2 pr-4">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil size={16} /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ExtraCostsTab;