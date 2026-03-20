import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, User, Hash, Building, Map, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import NeighborhoodAutocomplete from "@/components/NeighborhoodAutocomplete";

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(true);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    quadra: "",
    lote: "",
    city: "",
    state: "",
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
        phone: data?.phone || "",
        street: data?.street || "",
        number: data?.number || "",
        complement: data?.complement || "",
        neighborhood: data?.neighborhood || "",
        quadra: data?.quadra || "",
        lote: data?.lote || "",
        city: data?.city || "",
        state: data?.state || "",
        zip_code: data?.zip_code || "",
      });

      setProfileLoading(false);
    };

    loadProfile();

    return () => {
      active = false;
    };
  }, [user]);

  const [cepLoading, setCepLoading] = useState(false);

  const update = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const fetchCep = async (cep: string) => {
    const cleaned = cep.replace(/\D/g, "");
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cleaned}/json/`);
      const data = await res.json();
      if (data.erro) {
        toast.error("CEP não encontrado");
        setCepLoading(false);
        return;
      }
      setForm((prev) => ({
        ...prev,
        zip_code: cep,
        street: data.logradouro || prev.street,
        neighborhood: data.bairro || prev.neighborhood,
        city: data.localidade || prev.city,
        state: data.uf || prev.state,
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
    setLoading(true);

    try {
      const payload = {
        user_id: user.id,
        ...form,
      };

      const { data: existingProfile, error: profileLookupError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profileLookupError && profileLookupError.code !== "PGRST116") {
        throw profileLookupError;
      }

      const { error } = existingProfile
        ? await supabase
            .from("profiles")
            .update(form)
            .eq("id", existingProfile.id)
        : await supabase
            .from("profiles")
            .insert(payload);

      if (error) throw error;

      const { error: userUpdateError } = await supabase.auth.updateUser({
        data: { full_name: form.full_name },
      });

      if (userUpdateError) throw userUpdateError;

      const { error: sessionRefreshError } = await supabase.auth.refreshSession();

      if (sessionRefreshError) throw sessionRefreshError;

      const { error } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      toast.success("Perfil completo! 🔥");
      navigate("/perfil");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar perfil");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "full_name", label: "Nome completo", icon: User, required: true },
    { key: "phone", label: "WhatsApp (com DDD)", icon: Phone, required: true },
    { key: "zip_code", label: "CEP", icon: Hash, required: true },
    { key: "street", label: "Rua", icon: MapPin, required: true },
    { key: "number", label: "Número", icon: Hash, required: true },
    { key: "complement", label: "Complemento", icon: Building, required: true },
    { key: "quadra", label: "Quadra", icon: Hash, required: true },
    { key: "lote", label: "Lote", icon: Hash, required: true },
    { key: "neighborhood", label: "Bairro", icon: Map, required: true },
    { key: "city", label: "Cidade", icon: Building, required: true },
    { key: "state", label: "Estado (sigla)", icon: Map, required: true },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md">
        <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-foreground">
          <ArrowLeft size={18} />
          Voltar
        </button>

        <h1 className="text-3xl text-fire-gradient">COMPLETE SEU PERFIL</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seus dados já preenchidos aparecem abaixo. Complete apenas o que estiver faltando.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {fields.map((f) => {
            // Neighborhood uses autocomplete
            if (f.key === "neighborhood") {
              return (
                <div key={f.key}>
                  <NeighborhoodAutocomplete
                    value={form.neighborhood}
                    onChange={(val) => update("neighborhood", val)}
                    placeholder="Bairro"
                  />
                </div>
              );
            }
            return (
              <div key={f.key} className="flex items-center gap-3 rounded-xl bg-card px-4 py-3">
                <f.icon size={18} className="flex-shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={(form as any)[f.key]}
                  onChange={(e) => {
                    const val = e.target.value;
                    update(f.key, val);
                    if (f.key === "zip_code" && val.replace(/\D/g, "").length === 8) {
                      fetchCep(val);
                    }
                  }}
                  onBlur={() => {
                    if (f.key === "zip_code") fetchCep((form as any)[f.key]);
                  }}
                  placeholder={f.label + (f.key === "zip_code" && cepLoading ? " (buscando...)" : "")}
                  required={f.required}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            );
          })}

          <button
            type="submit"
            disabled={loading || profileLoading}
            className="mt-4 w-full rounded-xl bg-fire-gradient py-3.5 font-bold text-primary-foreground shadow-fire transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {profileLoading ? "Carregando dados..." : loading ? "Salvando..." : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
