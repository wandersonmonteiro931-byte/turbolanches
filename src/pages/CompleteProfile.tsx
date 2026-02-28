import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Phone, MapPin, User, Hash, Building, Map } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const CompleteProfile = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
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
    if (user) {
      setForm((f) => ({ ...f, full_name: user.user_metadata?.full_name || "" }));
    }
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
      const { error } = await supabase
        .from("profiles")
        .update(form)
        .eq("user_id", user.id);
      if (error) throw error;
      toast.success("Perfil completo! 🔥");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar perfil");
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: "full_name", label: "Nome completo", icon: User, required: true },
    { key: "phone", label: "Telefone (com DDD)", icon: Phone, required: true },
    { key: "zip_code", label: "CEP", icon: Hash, required: true },
    { key: "street", label: "Rua", icon: MapPin, required: true },
    { key: "number", label: "Número", icon: Hash, required: true },
    { key: "complement", label: "Complemento", icon: Building, required: false },
    { key: "quadra", label: "Quadra", icon: Hash, required: false },
    { key: "lote", label: "Lote", icon: Hash, required: false },
    { key: "neighborhood", label: "Bairro", icon: Map, required: true },
    { key: "city", label: "Cidade", icon: Building, required: true },
    { key: "state", label: "Estado (sigla)", icon: Map, required: true },
  ];

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-3xl text-fire-gradient">COMPLETE SEU PERFIL</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Precisamos dessas informações para entregar seus pedidos
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {fields.map((f) => (
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
          ))}

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-fire-gradient py-3.5 font-bold text-primary-foreground shadow-fire transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Salvando..." : "Salvar e Continuar"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CompleteProfile;
