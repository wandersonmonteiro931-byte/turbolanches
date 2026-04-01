import { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Tag, LogOut, Menu, MapPin, Clock, Users, Bell, Image, FileText, ListPlus, Printer, Ticket, Shield, Settings, Sparkles, Bot, Star, DollarSign, Package, FolderPlus, Lock, Eye, EyeOff } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/pedidos", icon: ShoppingBag, label: "Pedidos" },
  { path: "/admin/produtos", icon: UtensilsCrossed, label: "Produtos" },
  { path: "/admin/cadastros", icon: FolderPlus, label: "Cadastros" },
  { path: "/admin/categorias", icon: Tag, label: "Categorias" },
  { path: "/admin/adicionais", icon: ListPlus, label: "Adicionais" },
  { path: "/admin/banners", icon: Image, label: "Banners" },
  { path: "/admin/conteudo", icon: FileText, label: "Conteúdo" },
  { path: "/admin/entregas", icon: MapPin, label: "Entregas" },
  { path: "/admin/horarios", icon: Clock, label: "Horários" },
  { path: "/admin/clientes", icon: Users, label: "Clientes" },
  { path: "/admin/notificacoes", icon: Bell, label: "Notificações" },
  { path: "/admin/cupons", icon: Ticket, label: "Cupons" },
  { path: "/admin/comandas", icon: Printer, label: "Comandas" },
  { path: "/admin/etiquetas", icon: Tag, label: "Etiquetas" },
  { path: "/admin/administradores", icon: Shield, label: "Admins" },
  { path: "/admin/raspadinha", icon: Sparkles, label: "Raspadinha" },
  { path: "/admin/avaliacoes", icon: Star, label: "Avaliações" },
  { path: "/admin/precificacao", icon: DollarSign, label: "Precificação" },
  { path: "/admin/reposicao", icon: Package, label: "Reposição" },
  { path: "/admin/ia", icon: Bot, label: "IA do Sistema" },
  { path: "/admin/configuracoes", icon: Settings, label: "Configurações" },
];

// Sections that can be password-protected (all except Dashboard and Pedidos which are always open)
const LOCKABLE_SECTIONS = navItems
  .filter(n => n.path !== "/admin" && n.path !== "/admin/pedidos")
  .map(n => n.path);

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, loading } = useAdmin();
  const { signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { config, isSectionLocked } = useAdminSectionPassword();
  const [unlockedSections, setUnlockedSections] = useState<Set<string>>(new Set());
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate("/auth");
    }
  }, [isAdmin, loading, navigate]);

  useEffect(() => {
    if (!loading && isAdmin) {
      const alreadyOpened = sessionStorage.getItem("kitchen_opened");
      if (!alreadyOpened) {
        sessionStorage.setItem("kitchen_opened", "true");
        window.open("/cozinha", "kitchen_screen", "popup");
      }
    }
  }, [loading, isAdmin]);

  // Check if current route needs password
  useEffect(() => {
    const currentPath = location.pathname;
    if (isSectionLocked(currentPath) && !unlockedSections.has(currentPath)) {
      setPendingPath(currentPath);
      setShowPasswordInput(true);
      setPasswordInput("");
      setPasswordError(false);
    }
  }, [location.pathname, config]);

  const handleNavClick = (path: string) => {
    if (isSectionLocked(path) && !unlockedSections.has(path)) {
      setPendingPath(path);
      setShowPasswordInput(true);
      setPasswordInput("");
      setPasswordError(false);
      setSidebarOpen(false);
      return;
    }
    navigate(path);
    setSidebarOpen(false);
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === config.password) {
      if (pendingPath) {
        setUnlockedSections(prev => new Set(prev).add(pendingPath));
        navigate(pendingPath);
      }
      setShowPasswordInput(false);
      setPendingPath(null);
      setPasswordInput("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const NavContent = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <UtensilsCrossed size={16} className="text-primary-foreground" />
        </div>
        <span className="text-lg font-bold text-foreground">Turbo Lanches</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const isLocked = isSectionLocked(item.path) && !unlockedSections.has(item.path);
          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <item.icon size={18} />
              {item.label}
              {isLocked && <Lock size={14} className="ml-auto opacity-50" />}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </div>
  );

  // Determine if current section is locked and not yet unlocked
  const currentLocked = isSectionLocked(location.pathname) && !unlockedSections.has(location.pathname);

  return (
    <div className="flex min-h-screen bg-background print:block print:h-auto print:bg-background">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block print:hidden">
        <NavContent />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden print:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card shadow-lg">
            <NavContent />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden print:block">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 print:hidden">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden">
            <Menu size={22} className="text-foreground" />
          </button>
          <h1 className="text-lg font-bold text-foreground">
            {navItems.find((n) => n.path === location.pathname)?.label || "Admin"}
          </h1>
        </header>
        <main className="flex-1 overflow-auto bg-background p-4 print:overflow-visible print:p-0 min-h-0">
          {currentLocked ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-full max-w-xs space-y-4 text-center">
                <Lock size={48} className="mx-auto text-muted-foreground" />
                <h2 className="text-lg font-bold text-foreground">Seção Protegida</h2>
                <p className="text-sm text-muted-foreground">Digite a senha para acessar esta seção.</p>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
                  onKeyDown={e => e.key === "Enter" && handlePasswordSubmit()}
                  placeholder="Senha"
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
                {passwordError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
                <button
                  onClick={handlePasswordSubmit}
                  className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  Desbloquear
                </button>
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* Password modal for nav clicks */}
      {showPasswordInput && !currentLocked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-xs rounded-2xl bg-card p-6 space-y-4 mx-4">
            <div className="flex items-center gap-3">
              <Lock size={24} className="text-primary" />
              <h3 className="text-lg font-bold text-foreground">Seção Protegida</h3>
            </div>
            <p className="text-sm text-muted-foreground">Digite a senha para acessar esta seção.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={e => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Senha"
              className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
            {passwordError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
            <div className="flex gap-3">
              <button
                onClick={() => { setShowPasswordInput(false); setPendingPath(null); }}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
              >
                Cancelar
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground"
              >
                Desbloquear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLayout;
