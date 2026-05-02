import TurboLoader from "@/components/TurboLoader";
import { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { LayoutDashboard, ShoppingBag, UtensilsCrossed, Tag, LogOut, Menu, MapPin, Clock, Users, Bell, Image, FileText, ListPlus, Printer, Ticket, Shield, Settings, Sparkles, Bot, Star, DollarSign, Package, FolderPlus, Lock, Eye, EyeOff, HelpCircle, UserCog, WalletCards, Tv, AlertCircle } from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/pedidos", icon: ShoppingBag, label: "Pedidos" },
  { path: "/cozinha", icon: UtensilsCrossed, label: "Cozinha" },
  { path: "/admin/fiados", icon: WalletCards, label: "Fiados" },
  { path: "/admin/nao-pagos", icon: AlertCircle, label: "Não Pagos" },
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
  { path: "/admin/etiquetas-preco", icon: DollarSign, label: "Etiq. Preço" },
  { path: "/admin/administradores", icon: Shield, label: "Admins" },
  { path: "/admin/raspadinha", icon: Sparkles, label: "Raspadinha" },
  { path: "/admin/avaliacoes", icon: Star, label: "Avaliações" },
  { path: "/admin/precificacao", icon: DollarSign, label: "Precificação" },
  { path: "/admin/reposicao", icon: Package, label: "Reposição" },
  { path: "/admin/funcionarios", icon: UserCog, label: "Funcionários" },
  { path: "/admin/ia", icon: Bot, label: "IA do Sistema" },
  { path: "/admin/tv-publicidade", icon: Tv, label: "TV / Publicidade" },
  { path: "/admin/configuracoes", icon: Settings, label: "Configurações" },
];

const AdminLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin, loading } = useAdmin();
  const { user, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { config, isSectionLocked, loading: pwLoading } = useAdminSectionPassword();
  const [unlockedSections, setUnlockedSections] = useState<Set<string>>(new Set());
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  // Entry gate
  const [entryUnlocked, setEntryUnlocked] = useState(false);
  const [entryPasswordInput, setEntryPasswordInput] = useState("");
  const [entryPasswordError, setEntryPasswordError] = useState(false);
  // Forgot password
  const [showForgotPw, setShowForgotPw] = useState(false);
  const [forgotAnswers, setForgotAnswers] = useState<string[]>([]);
  const [forgotAttempts, setForgotAttempts] = useState(0);
  const [forgotError, setForgotError] = useState("");
  const [forgotContext, setForgotContext] = useState<"entry" | "section">("entry");
  const redirectTarget = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate(`/auth?redirect=${encodeURIComponent(redirectTarget)}`, { replace: true });
      return;
    }

    if (!isAdmin) {
      // Sign out the non-admin session so the kiosk can log in with an admin account
      void supabase.auth.signOut().finally(() => {
        navigate(`/auth?redirect=${encodeURIComponent(redirectTarget)}`, { replace: true });
      });
    }
  }, [isAdmin, loading, navigate, redirectTarget, user]);

  // Reset unlocked sections when config changes
  useEffect(() => {
    setUnlockedSections(new Set());
    setEntryUnlocked(false);
  }, [config.password, config.lockedSections.length]);

  // Check if current route needs password
  useEffect(() => {
    if (pwLoading) return;
    const currentPath = location.pathname;
    if (isSectionLocked(currentPath) && !unlockedSections.has(currentPath)) {
      setPendingPath(currentPath);
      setShowPasswordInput(false); // Show inline gate instead
      setPasswordInput("");
      setPasswordError(false);
    }
  }, [location.pathname, config, pwLoading]);

  // Auto-collapse sidebar whenever the route changes — only re-opens via the
  // hamburger menu, on every screen size.
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const requiresEntryGate = config.password && config.requireOnEntry && !entryUnlocked;

  const handleNavClick = (path: string) => {
    if (path === "/cozinha") {
      window.open(`/cozinha?kiosk=${Date.now()}`, "kitchen_screen", "popup");
      setSidebarOpen(false);
      return;
    }

    // Always navigate so sidebar highlights
    navigate(path);
    setSidebarOpen(false);
    // If locked, password will be required inline
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === config.password) {
      const currentPath = pendingPath || location.pathname;
      setUnlockedSections(prev => new Set(prev).add(currentPath));
      setShowPasswordInput(false);
      setPendingPath(null);
      setPasswordInput("");
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleEntryPasswordSubmit = () => {
    if (entryPasswordInput === config.password) {
      setEntryUnlocked(true);
      setEntryPasswordInput("");
      setEntryPasswordError(false);
    } else {
      setEntryPasswordError(true);
    }
  };

  const openForgotPw = (context: "entry" | "section") => {
    if (!config.securityQuestions?.length || config.securityQuestions.length < 5) return;
    setForgotContext(context);
    setForgotAnswers(new Array(5).fill(""));
    setForgotAttempts(0);
    setForgotError("");
    setShowForgotPw(true);
  };

  const handleForgotSubmit = () => {
    const questions = config.securityQuestions || [];
    const allCorrect = questions.every((q, i) => q.answer.trim().toLowerCase() === (forgotAnswers[i] || "").trim().toLowerCase());
    if (allCorrect) {
      if (forgotContext === "entry") {
        setEntryUnlocked(true);
      } else {
        // Unlock all sections
        const allPaths = navItems.map(n => n.path);
        setUnlockedSections(new Set(allPaths));
      }
      setShowForgotPw(false);
      setForgotError("");
    } else {
      const newAttempts = forgotAttempts + 1;
      setForgotAttempts(newAttempts);
      if (newAttempts >= 3) {
        setForgotError("Limite de tentativas atingido. Tente novamente mais tarde.");
      } else {
        setForgotError(`Respostas incorretas. ${3 - newAttempts} tentativa(s) restante(s).`);
      }
    }
  };

  const hasForgotOption = (config.securityQuestions?.length || 0) >= 5;

  if (loading || pwLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <TurboLoader size={120} />
      </div>
    );
  }

  if (!isAdmin) return null;

  // Entry gate - require password on system entry
  if (requiresEntryGate) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-xs space-y-4 text-center mx-4">
          <Lock size={48} className="mx-auto text-muted-foreground" />
          <h2 className="text-lg font-bold text-foreground">Painel Administrativo</h2>
          <p className="text-sm text-muted-foreground">Digite a senha do administrador para acessar o sistema.</p>
          <input
            type="password"
            value={entryPasswordInput}
            onChange={e => { setEntryPasswordInput(e.target.value); setEntryPasswordError(false); }}
            onKeyDown={e => e.key === "Enter" && handleEntryPasswordSubmit()}
            placeholder=""
            className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          {entryPasswordError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
          <button
            onClick={handleEntryPasswordSubmit}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Entrar
          </button>
          {hasForgotOption && (
            <button
              onClick={() => openForgotPw("entry")}
              className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
            >
              <HelpCircle size={12} /> Esqueci a senha
            </button>
          )}
        </div>

        {/* Forgot password modal */}
        {showForgotPw && (
          <ForgotPasswordModal
            questions={config.securityQuestions || []}
            answers={forgotAnswers}
            setAnswers={setForgotAnswers}
            error={forgotError}
            attempts={forgotAttempts}
            onSubmit={handleForgotSubmit}
            onClose={() => setShowForgotPw(false)}
          />
        )}
      </div>
    );
  }

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
      {/* Sidebar overlay — collapses by default, opens via hamburger.
          Auto-collapses on route change so it never stays expanded. */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 print:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-card shadow-lg">
            <NavContent />
          </aside>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden print:block">
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 print:hidden">
          <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu">
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
                  placeholder=""
                  className="w-full rounded-lg border border-border bg-card px-4 py-3 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
                {passwordError && <p className="text-xs text-destructive font-medium">Senha incorreta</p>}
                <button
                  onClick={handlePasswordSubmit}
                  className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                >
                  Desbloquear
                </button>
                {hasForgotOption && location.pathname === "/admin/configuracoes" && (
                  <button
                    onClick={() => openForgotPw("section")}
                    className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                  >
                    <HelpCircle size={12} /> Esqueci a senha
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>

      {/* Forgot password modal */}
      {showForgotPw && (
        <ForgotPasswordModal
          questions={config.securityQuestions || []}
          answers={forgotAnswers}
          setAnswers={setForgotAnswers}
          error={forgotError}
          attempts={forgotAttempts}
          onSubmit={handleForgotSubmit}
          onClose={() => setShowForgotPw(false)}
        />
      )}
    </div>
  );
};

// Forgot Password Modal component
interface ForgotPasswordModalProps {
  questions: { question: string; answer: string }[];
  answers: string[];
  setAnswers: (a: string[]) => void;
  error: string;
  attempts: number;
  onSubmit: () => void;
  onClose: () => void;
}

const ForgotPasswordModal = ({ questions, answers, setAnswers, error, attempts, onSubmit, onClose }: ForgotPasswordModalProps) => (
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
    <div className="w-full max-w-md rounded-2xl bg-card p-6 space-y-4 mx-4 max-h-[90vh] overflow-y-auto">
      <div className="flex items-center gap-3">
        <HelpCircle size={24} className="text-primary" />
        <h3 className="text-lg font-bold text-foreground">Recuperar Acesso</h3>
      </div>
      <p className="text-sm text-muted-foreground">Responda as 5 perguntas de segurança corretamente.</p>
      
      <div className="space-y-3">
        {questions.slice(0, 5).map((q, i) => (
          <div key={i}>
            <label className="text-xs font-medium text-foreground">{q.question}</label>
            <input
              type="text"
              value={answers[i] || ""}
              onChange={e => {
                const newAnswers = [...answers];
                newAnswers[i] = e.target.value;
                setAnswers(newAnswers);
              }}
              placeholder=""
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={attempts >= 3}
            />
          </div>
        ))}
      </div>

      {error && <p className="text-xs text-destructive font-medium">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-foreground"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={attempts >= 3}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          Verificar
        </button>
      </div>
    </div>
  </div>
);

export default AdminLayout;
