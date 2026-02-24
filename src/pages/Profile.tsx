import { User, MapPin, Phone, ChevronRight, LogOut } from "lucide-react";
import BottomNav from "@/components/BottomNav";

const Profile = () => {
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
            <p className="font-bold text-foreground">Faça login ou cadastre-se</p>
            <p className="text-xs text-muted-foreground">Para acompanhar seus pedidos</p>
          </div>
          <ChevronRight size={18} className="ml-auto text-muted-foreground" />
        </div>

        <div className="rounded-xl bg-card divide-y divide-border">
          {[
            { icon: MapPin, label: "Meus endereços" },
            { icon: Phone, label: "Meus dados" },
            { icon: LogOut, label: "Sair" },
          ].map((item) => (
            <button key={item.label} className="flex w-full items-center gap-3 p-4 text-left">
              <item.icon size={18} className="text-primary" />
              <span className="flex-1 text-sm text-foreground">{item.label}</span>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
