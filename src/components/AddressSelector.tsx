import { useState, useEffect } from "react";
import { MapPin, Plus, Check, Trash2, X, Edit2 } from "lucide-react";
import TurboLoader from "@/components/TurboLoader";
import { useAddresses, CustomerAddress } from "@/hooks/useAddresses";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";

const DEFAULT_CITY = "Anápolis";
const DEFAULT_STATE = "Goiás";

interface Props {
  open: boolean;
  onClose: () => void;
  initialMode?: "list" | "add";
  editAddress?: CustomerAddress | null;
}

const emptyForm = {
  label: "Casa",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  quadra: "",
  lote: "",
  city: DEFAULT_CITY,
  state: DEFAULT_STATE,
  zip_code: "",
};

const AddressSelector = ({ open, onClose, initialMode = "list", editAddress = null }: Props) => {
  const { user } = useAuth();
  const { addresses, defaultAddress, setDefault, addAddress, updateAddress, deleteAddress } = useAddresses();
  const { toast } = useToast();
  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    if (open) {
      if (editAddress) {
        setForm({
          label: editAddress.label,
          street: editAddress.street,
          number: editAddress.number,
          complement: editAddress.complement || "",
          neighborhood: editAddress.neighborhood,
          quadra: editAddress.quadra,
          lote: editAddress.lote,
          city: editAddress.city,
          state: editAddress.state,
          zip_code: editAddress.zip_code,
        });
        setEditingId(editAddress.id);
        setMode("edit");
      } else {
        setMode(initialMode);
        setEditingId(null);
        if (initialMode === "add") setForm(emptyForm);
      }
    }
  }, [open, initialMode, editAddress]);

  if (!open) return null;

  const handleCepLookup = async (cep: string) => {
    const clean = cep.replace(/\D/g, "");
    setForm((f) => ({ ...f, zip_code: clean }));
    if (clean.length === 8) {
      setLoadingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setForm((f) => ({
            ...f,
            street: data.logradouro || f.street,
            neighborhood: data.bairro || f.neighborhood,
            city: DEFAULT_CITY,
            state: DEFAULT_STATE,
          }));
        }
      } catch {
        // ignore
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSave = async () => {
    if (!form.street || !form.number || !form.neighborhood || !form.quadra || !form.lote) {
      toast({ title: "Preencha rua/av, número, quadra, lote e bairro", variant: "destructive" });
      return;
    }
    setSaving(true);

    if (mode === "edit" && editingId) {
      await updateAddress(editingId, {
        label: form.label,
        street: form.street,
        number: form.number,
        complement: form.complement,
        neighborhood: form.neighborhood,
        quadra: form.quadra,
        lote: form.lote,
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        zip_code: form.zip_code,
      });
      toast({ title: "✅ Endereço atualizado!" });
    } else {
      await addAddress({ ...form, city: DEFAULT_CITY, state: DEFAULT_STATE });
      toast({ title: "✅ Endereço adicionado!" });
    }

    setForm(emptyForm);
    setMode("list");
    setEditingId(null);
    setSaving(false);
  };

  const startEdit = (addr: CustomerAddress) => {
    setForm({
      label: addr.label,
      street: addr.street,
      number: addr.number,
      complement: addr.complement || "",
      neighborhood: addr.neighborhood,
      quadra: addr.quadra,
      lote: addr.lote,
      city: addr.city,
      state: addr.state,
      zip_code: addr.zip_code,
    });
    setEditingId(addr.id);
    setMode("edit");
  };

  const handleSelect = async (id: string) => {
    await setDefault(id);
    toast({ title: "📍 Endereço selecionado!" });
    onClose();
  };

  const handleDelete = async (id: string) => {
    await deleteAddress(id);
    toast({ title: "Endereço removido" });
  };

  const formatAddr = (a: CustomerAddress) => {
    const parts = [a.street];
    if (a.number) parts.push(a.number);
    if (a.quadra) parts.push(`Qd. ${a.quadra}`);
    if (a.lote) parts.push(`Lt. ${a.lote}`);
    return parts.join(", ");
  };

  const renderForm = () => (
    <div className="space-y-3">
      {/* Label */}
      <div className="flex gap-2">
        {["Casa", "Trabalho", "Outro"].map((label) => (
          <button
            key={label}
            onClick={() => setForm((f) => ({ ...f, label }))}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
              form.label === label
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CEP */}
      <div className="relative">
        <input
          placeholder="CEP"
          value={form.zip_code}
          onChange={(e) => handleCepLookup(e.target.value)}
          maxLength={8}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        {loadingCep && (
          <div className="absolute right-2 top-1.5"><TurboLoader size={22} /></div>
        )}
      </div>

        <input
          placeholder="Rua/Av *"
        value={form.street}
        onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
      />
      <div className="grid grid-cols-3 gap-2">
        <input
          placeholder="Número *"
          value={form.number}
          onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <input
          placeholder="Quadra *"
          value={form.quadra}
          onChange={(e) => setForm((f) => ({ ...f, quadra: e.target.value }))}
          required
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <input
          placeholder="Lote *"
          value={form.lote}
          onChange={(e) => setForm((f) => ({ ...f, lote: e.target.value }))}
          required
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => setForm((f) => ({ ...f, number: "S/N" }))} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary">Nº S/N</button>
          <button type="button" onClick={() => setForm((f) => ({ ...f, quadra: "Não tem" }))} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary">Quadra não tem</button>
          <button type="button" onClick={() => setForm((f) => ({ ...f, lote: "Não tem" }))} className="rounded-lg border border-border px-3 py-2 text-xs font-bold text-primary">Lote não tem</button>
        </div>
        <input
          placeholder="Complemento"
          value={form.complement}
          onChange={(e) => setForm((f) => ({ ...f, complement: e.target.value }))}
          className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      <NeighborhoodAutocomplete
        value={form.neighborhood}
        onChange={(val) => setForm((f) => ({ ...f, neighborhood: val }))}
        placeholder="Bairro *"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          placeholder="Cidade"
          value={DEFAULT_CITY}
          disabled
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        <input
          placeholder="Estado"
          value={DEFAULT_STATE}
          disabled
          className="rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setMode("list"); setEditingId(null); setForm(emptyForm); }}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "Salvando..." : mode === "edit" ? "Atualizar" : "Salvar"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl bg-card p-5 space-y-4 animate-in fade-in-0 zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <MapPin size={18} className="text-primary" />
            {mode === "edit" ? "Editar Endereço" : mode === "add" ? "Novo Endereço" : "Meus Endereços"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X size={18} className="text-muted-foreground" />
          </button>
        </div>

        {mode === "list" ? (
          <>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum endereço cadastrado
              </p>
            ) : (
              <div className="space-y-2">
                {addresses.map((addr) => (
                  <div
                    key={addr.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                      addr.is_default
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    }`}
                    onClick={() => handleSelect(addr.id)}
                  >
                    <MapPin size={16} className={addr.is_default ? "text-primary" : "text-muted-foreground"} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground">{addr.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {formatAddr(addr)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {addr.neighborhood} - {addr.city}
                      </p>
                    </div>
                    {addr.is_default && <Check size={16} className="text-primary shrink-0" />}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(addr);
                      }}
                      className="p-1.5 rounded hover:bg-muted shrink-0"
                      title="Editar"
                    >
                      <Edit2 size={14} className="text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(addr.id);
                      }}
                      className="p-1.5 rounded hover:bg-destructive/10 shrink-0"
                      title="Excluir"
                    >
                      <Trash2 size={14} className="text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => { setForm(emptyForm); setMode("add"); }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors"
            >
              <Plus size={16} />
              Adicionar endereço
            </button>
          </>
        ) : (
          renderForm()
        )}
      </div>
    </div>
  );
};

export default AddressSelector;
