import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, MapPin, Phone, ChevronRight, LogOut, FileText, Plus, Check, Edit2, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAddresses, CustomerAddress } from "@/hooks/useAddresses";
import BottomNav from "@/components/BottomNav";
import AddressSelector from "@/components/AddressSelector";
import { toast } from "sonner";

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [addrOpen, setAddrOpen] = useState(false);
  const [addrStartMode, setAddrStartMode] = useState<"list" | "add">("list");
  const { addresses, defaultAddress, setDefault, deleteAddress } = useAddresses();

  useEffect(() => {
    if (user) {
      supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single()
        .then(({ data }) => setProfile(data));
    }
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const formatAddr = (a: CustomerAddress) => {
    const parts = [a.street];
    if (a.number) parts.push(a.number);
    if (a.quadra) parts.push(`Qd. ${a.quadra}`);
    if (a.lote) parts.push(`Lt. ${a.lote}`);
    return parts.join(", ");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="px-4 py-6">
          <div className="mx-auto max-w-md">
            <h1 className="text-3xl text-fire-gradient">PERFIL</h1>
          </div>
        </header>
        <div className="mx-auto max-w-md px-4">
          <button
            onClick={() => navigate("/auth")}
            className="flex w-full items-center gap-4 rounded-xl bg-card p-4"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fire-gradient">
              <User size={28} className="text-primary-foreground" />
            </div>
            <div className="text-left">
              <p className="font-bold text-foreground">Faça login ou cadastre-se</p>
              <p className="text-xs text-muted-foreground">Para acompanhar seus pedidos</p>
            </div>
            <ChevronRight size={18} className="ml-auto text-muted-foreground" />
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="px-4 py-6">
        <div className="mx-auto max-w-md">
          <h1 className="text-3xl text-fire-gradient">PERFIL</h1>
        </div>
      </header>

      <div className="mx-auto max-w-md px-4 space-y-3">
        <div className="flex items-center gap-4 rounded-xl bg-card p-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-fire-gradient">
            <User size={28} className="text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold text-foreground">{profile?.full_name || user.email}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>

        <div className="rounded-xl bg-card divide-y divide-border">
          <button onClick={() => navigate("/completar-perfil")} className="flex w-full items-center gap-3 p-4 text-left">
            <User size={18} className="text-primary" />
            <span className="flex-1 text-sm text-foreground">Meus dados</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button onClick={() => navigate("/pedidos")} className="flex w-full items-center gap-3 p-4 text-left">
            <FileText size={18} className="text-primary" />
            <span className="flex-1 text-sm text-foreground">Meus pedidos</span>
            <ChevronRight size={16} className="text-muted-foreground" />
          </button>
          <button onClick={handleSignOut} className="flex w-full items-center gap-3 p-4 text-left">
            <LogOut size={18} className="text-accent" />
            <span className="flex-1 text-sm text-accent">Sair</span>
          </button>
        </div>

        {/* Endereços salvos - sempre visíveis */}
        <div className="rounded-xl bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              Meus Endereços
            </h3>
            <button
              onClick={() => { setAddrStartMode("add"); setAddrOpen(true); }}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
            >
              <Plus size={14} />
              Adicionar
            </button>
          </div>

          {addresses.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              Nenhum endereço cadastrado
            </p>
          ) : (
            <div className="space-y-2">
              {addresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 ${
                    addr.is_default
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <MapPin size={14} className={`mt-0.5 shrink-0 ${addr.is_default ? "text-primary" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-foreground">{addr.label}</p>
                      {addr.is_default && (
                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">Padrão</span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{formatAddr(addr)}</p>
                    <p className="text-[11px] text-muted-foreground">{addr.neighborhood} - {addr.city}</p>
                    {addr.complement && (
                      <p className="text-[11px] text-muted-foreground">{addr.complement}</p>
                    )}
                  </div>
                  {!addr.is_default && (
                    <button
                      onClick={() => setDefault(addr.id)}
                      className="text-[10px] font-medium text-primary border border-primary/30 rounded px-2 py-1 hover:bg-primary/10 shrink-0"
                    >
                      Usar
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AddressSelector open={addrOpen} onClose={() => setAddrOpen(false)} initialMode={addrStartMode} />
      <BottomNav />
    </div>
  );
};

export default Profile;
