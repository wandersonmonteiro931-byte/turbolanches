import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, User, ArrowLeft, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";

const DEFAULT_CITY = "Anápolis";
const DEFAULT_STATE = "Goiás";

const requiredFields = ["full_name", "phone", "street", "number", "neighborhood", "quadra", "lote"] as const;

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

const maskCep = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [cepLoading, setCepLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    quadra: "",
    lote: "",
    city: DEFAULT_CITY,
    state: DEFAULT_STATE,
    zip_code: "",
  });

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      return;
    }

    let active = true;

    const loadProfile = async () => {
      setProfileLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, street, number, complement, neighborhood, quadra, lote, city, state, zip_code")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;

      if (error && error.code !== "PGRST116") {
        toast.error("Erro ao carregar seus dados");
      }

      setForm({
        full_name: data?.full_name || user.user_metadata?.full_name || "",
        phone: maskPhone(data?.phone || ""),
        street: data?.street || "",
        number: data?.number || "",
        complement: data?.complement || "",
        neighborhood: data?.neighborhood || "",
        quadra: data?.quadra || "",
        lote: data?.lote || "",
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
        zip_code: maskCep(data?.zip_code || ""),
      });

      setProfileLoading(false);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [user]);

  const update = (key: string, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: false } : e));
  };

  const fetchCep = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((prev) => ({
        ...prev,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
      }));
    } catch {
      toast.error("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const nextErrors: Record<string, boolean> = {};
    requiredFields.forEach((key) => {
      if (!form[key]?.trim()) nextErrors[key] = true;
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Preencha os campos obrigatórios destacados");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        user_id: user.id,
        full_name: form.full_name.trim(),
        phone: form.phone.replace(/\D/g, ""),
        street: form.street.trim(),
        number: form.number.trim(),
        complement: form.complement.trim(),
        neighborhood: form.neighborhood.trim(),
        quadra: form.quadra.trim(),
        lote: form.lote.trim(),
        zip_code: form.zip_code.replace(/\D/g, ""),
        city: DEFAULT_CITY,
        state: DEFAULT_STATE,
      };

      const { error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" });

      if (error) throw error;

      await supabase.auth.updateUser({ data: { full_name: payload.full_name } });
      await supabase.auth.refreshSession();

      toast.success("Perfil salvo!");
      navigate("/perfil");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar perfil");
    } finally {
      setLoading(false);
    }
  };

  const inputClass = (key: string) =>
    `w-full rounded-xl border bg-card px-3 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 ${
      errors[key] ? "border-destructive" : "border-border"
    }`;

  const Field = ({
    label,
    keyName,
    placeholder,
    inputMode,
    quickValue,
    optional,
  }: {
    label: string;
    keyName: keyof typeof form;
    placeholder?: string;
    inputMode?: "text" | "tel" | "numeric";
    quickValue?: string;
    optional?: boolean;
  }) => (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label} {optional && <span className="normal-case font-normal">(opcional)</span>}
        </label>
        {quickValue && (
          <button
            type="button"
            onClick={() => update(keyName, quickValue)}
            className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-primary"
          >
            {quickValue}
          </button>
        )}
      </div>
      <input
        type="text"
        inputMode={inputMode}
        value={form[keyName]}
        onChange={(e) => {
          const raw = e.target.value;
          if (keyName === "phone") return update("phone", maskPhone(raw));
          if (keyName === "zip_code") {
            const masked = maskCep(raw);
            update("zip_code", masked);
            if (masked.replace(/\D/g, "").length === 8) fetchCep(masked);
            return;
          }
          update(keyName, raw);
        }}
        onBlur={() => {
          if (keyName === "zip_code") fetchCep(form.zip_code);
        }}
        placeholder={placeholder}
        className={inputClass(keyName)}
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md pb-24">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowLeft size={18} />
          Voltar
        </button>

        <h1 className="text-3xl text-fire-gradient">MEUS DADOS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preencha uma vez e seus pedidos ficam bem mais rápidos.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="rounded-2xl bg-card/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <User size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-foreground">Dados pessoais</h2>
            </div>
            <div className="space-y-4">
              <Field label="Nome completo" keyName="full_name" placeholder="Ex: Yasmin Barbosa" />
              <Field label="WhatsApp" keyName="phone" placeholder="(62) 99999-9999" inputMode="tel" />
            </div>
          </section>

          <section className="rounded-2xl bg-card/60 p-4">
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              <h2 className="text-sm font-bold text-foreground">Endereço de entrega</h2>
            </div>
            <div className="space-y-4">
              <Field
                label={cepLoading ? "CEP (buscando...)" : "CEP"}
                keyName="zip_code"
                placeholder="75000-000"
                inputMode="numeric"
                optional
              />
              <Field label="Rua / Avenida" keyName="street" placeholder="Ex: Rua Ra 4" />

              <div className="grid grid-cols-2 gap-3">
                <Field label="Número" keyName="number" placeholder="123" quickValue="S/N" />
                <Field label="Complemento" keyName="complement" placeholder="Casa, apto..." optional />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Quadra" keyName="quadra" placeholder="Qd" quickValue="Não tem" />
                <Field label="Lote" keyName="lote" placeholder="Lt" quickValue="Não tem" />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bairro
                </label>
                <NeighborhoodAutocomplete
                  value={form.neighborhood}
                  onChange={(val) => update("neighborhood", val)}
                  placeholder="Comece a digitar o bairro"
                />
                {errors.neighborhood && (
                  <p className="mt-1 text-xs font-medium text-destructive">Selecione seu bairro</p>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
                <Check size={15} className="shrink-0 text-primary" />
                Entregamos em {DEFAULT_CITY} - {DEFAULT_STATE}
              </div>
            </div>
          </section>

          <div className="fixed inset-x-0 bottom-0 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
            <div className="mx-auto max-w-md">
              <button
                type="submit"
                disabled={loading || profileLoading}
                className="w-full rounded-xl bg-fire-gradient py-3.5 font-bold text-primary-foreground shadow-fire transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {profileLoading ? "Carregando dados..." : loading ? "Salvando..." : "Salvar dados"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
