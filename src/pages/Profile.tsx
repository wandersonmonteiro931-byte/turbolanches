import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, MapPin, Phone, ChevronRight, LogOut, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import BottomNav from "@/components/BottomNav";

const Profile = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<any>(null);

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
          <button onClick={() => navigate("/completar-perfil")} className="flex w-full items-center gap-3 p-4 text-left">
            <MapPin size={18} className="text-primary" />
            <span className="flex-1 text-sm text-foreground">Meu endereço</span>
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
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
