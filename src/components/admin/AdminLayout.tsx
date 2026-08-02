import TurboLoader from "@/components/TurboLoader";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingBag,
  UtensilsCrossed,
  Tag,
  LogOut,
  Menu,
  MapPin,
  Clock,
  Users,
  Bell,
  Image,
  FileText,
  ListPlus,
  Printer,
  Ticket,
  Shield,
  Settings,
  Sparkles,
  Bot,
  Star,
  DollarSign,
  Package,
  FolderPlus,
  Lock,
  HelpCircle,
  UserCog,
  WalletCards,
  Tv,
  AlertCircle,
  Wifi,
  ChevronRight,
  LifeBuoy,
  PanelLeft,
  CircleHelp,
  ChevronDown,
  Flame,
} from "lucide-react";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useAdminSectionPassword } from "@/hooks/useAdminSectionPassword";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
  { path: "/admin/pedidos", icon: ShoppingBag, label: "Pedidos" },
  { path: "/cozinha", icon: UtensilsCrossed, label: "Cozinha" },
  { path: "/admin/fiados", icon: WalletCards, label: "Fiados" },
  { path: "/admin/financeiro", icon: DollarSign, label: "Financeiro" },
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
  { path: "/admin/funcionarios", icon: UserCog, label: "Ponto / Funcionários" },
  { path: "/admin/ia", icon: Bot, label: "IA do Sistema" },
  { path: "/admin/tv-publicidade", icon: Tv, label: "TV / Publicidade" },
  { path: "/admin/impressora-wifi", icon: Wifi, label: "Impressora Wi‑Fi" },
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
  const [, setShowPasswordInput] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [entryUnlocked, setEntryUnlocked] = useState(false);
  const [entryPasswordInput, setEntryPasswordInput] = useState("");
  const [entryPasswordError, setEntryPasswordError] = useState(false);
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
      void supabase.auth.signOut().finally(() => {
        navigate(`/auth?redirect=${encodeURIComponent(redirectTarget)}`, { replace: true });
      });
    }
  }, [isAdmin, loading, navigate, redirectTarget, user]);

  useEffect(() => {
    setUnlockedSections(new Set());
    setEntryUnlocked(false);
  }, [config.password, config.lockedSections.length]);

  useEffect(() => {
    if (pwLoading) return;
    const currentPath = location.pathname;
    if (isSectionLocked(currentPath) && !unlockedSections.has(currentPath)) {
      setPendingPath(currentPath);
      setShowPasswordInput(false);
      setPasswordInput("");
      setPasswordError(false);
    }
  }, [location.pathname, isSectionLocked, unlockedSections, pwLoading]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const requiresEntryGate = config.password && config.requireOnEntry && !entryUnlocked;

  const handleNavClick = (path: string) => {
    if (path === "/admin/funcionarios") {
      window.open("https://turboponto.lovable.app/", "_blank", "noopener,noreferrer");
      setSidebarOpen(false);
      return;
    }

    if (path === "/cozinha") {
      window.open(`/cozinha?kiosk=${Date.now()}`, "kitchen_screen", "popup");
      setSidebarOpen(false);
      return;
    }

    navigate(path);
    setSidebarOpen(false);
  };

  const handlePasswordSubmit = () => {
    if (passwordInput === config.password) {
      const currentPath = pendingPath || location.pathname;
      setUnlockedSections((prev) => new Set(prev).add(currentPath));
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
    const allCorrect = questions.every(
      (q, i) => q.answer.trim().toLowerCase() === (forgotAnswers[i] || "").trim().toLowerCase(),
    );
    if (allCorrect) {
      if (forgotContext === "entry") {
        setEntryUnlocked(true);
      } else {
        const allPaths = navItems.map((n) => n.path);
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

  const currentNav = useMemo(() => {
    return [...navItems]
      .sort((a, b) => b.path.length - a.path.length)
      .find((n) => location.pathname === n.path || location.pathname.startsWith(`${n.path}/`));
  }, [location.pathname]);

  const pageSubtitle = useMemo(() => {
    const label = currentNav?.label || "Painel";
    if (label === "Dashboard") return "Visão geral dos pedidos e operações";
    return `Gerencie a seção de ${label.toLowerCase()}.`;
  }, [currentNav]);

  if (loading || pwLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <TurboLoader size={120} />
      </div>
    );
  }

  if (!isAdmin) return null;

  if (requiresEntryGate) {
    return (
      <div className="admin-theme flex h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm rounded-[28px] border border-border bg-card p-6 shadow-sm mx-4 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Painel Administrativo</h2>
          <p className="mt-2 text-sm text-muted-foreground">Digite a senha do administrador para acessar o sistema.</p>
          <input
            type="password"
            value={entryPasswordInput}
            onChange={(e) => {
              setEntryPasswordInput(e.target.value);
              setEntryPasswordError(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleEntryPasswordSubmit()}
            className="mt-5 w-full rounded-2xl border border-border bg-background px-4 py-3 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            autoFocus
          />
          {entryPasswordError && <p className="mt-3 text-xs font-medium text-destructive">Senha incorreta</p>}
          <button
            onClick={handleEntryPasswordSubmit}
            className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
          >
            Entrar
          </button>
          {hasForgotOption && (
            <button
              onClick={() => openForgotPw("entry")}
              className="mx-auto mt-4 flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <HelpCircle size={12} /> Esqueci a senha
            </button>
          )}
        </div>

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
    <div className="flex h-full flex-col admin-sidebar">
      <div className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <UtensilsCrossed size={22} />
          </div>
          <div>
            <p className="text-lg font-extrabold leading-none text-foreground">TURBO LANCHES</p>
            <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">Admin</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="grid gap-1.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const isLocked = isSectionLocked(item.path) && !unlockedSections.has(item.path);
            return (
              <button
                key={item.path}
                onClick={() => handleNavClick(item.path)}
                className={cn(
                  "admin-nav-item flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left text-sm font-medium transition-all",
                  isActive ? "active bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon size={18} />
                <span className="truncate">{item.label}</span>
                {isLocked ? <Lock size={14} className="ml-auto opacity-60" /> : <ChevronRight size={14} className="ml-auto opacity-40" />}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-3 pb-3">
        <div className="admin-support-card rounded-3xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <LifeBuoy size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-foreground">Precisa de ajuda?</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Fale com o suporte para resolver dúvidas do painel.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border p-3">
        <div className="rounded-3xl border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-foreground font-bold">
              {user?.email?.[0]?.toUpperCase() || "A"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">Admin</p>
              <p className="truncate text-xs text-muted-foreground">Administrador</p>
            </div>
            <button
              onClick={handleSignOut}
              className="rounded-2xl border border-border p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              title="Sair"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const currentLocked = isSectionLocked(location.pathname) && !unlockedSections.has(location.pathname);

  return (
    <div className="admin-theme admin-shell flex min-h-screen bg-background print:block print:h-auto print:bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[1px] print:hidden">
          <div className="absolute inset-0" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[320px] max-w-[88vw] border-r border-border bg-card shadow-2xl">
            <NavContent />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col overflow-hidden print:block">
        <header className="border-b border-[#ece9e2] bg-white px-5 print:hidden sm:px-7 lg:px-9">
          <div className="mx-auto flex h-[94px] w-full max-w-[1680px] items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-5">
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#182033] transition hover:bg-[#f7f5f1]"
              >
                <Menu size={28} strokeWidth={2.1} />
              </button>

              <div className="flex shrink-0 items-center gap-2 border-r border-[#ece9e2] pr-7">
                <div className="leading-[0.86]">
                  <div className="flex items-end gap-0.5 text-[26px] font-black italic tracking-[-0.06em] text-[#171d2c]">
                    <span>Turbo</span><Flame size={23} className="mb-0.5 fill-[#ff6a00] text-[#ff6a00]" />
                  </div>
                  <div className="pl-[42px] text-[15px] font-extrabold italic tracking-[-0.03em] text-[#f48b00]">Lanches</div>
                </div>
              </div>

              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff9800] text-white shadow-[0_8px_20px_rgba(255,152,0,.18)] sm:flex">
                <PanelLeft size={22} strokeWidth={2.1} />
              </div>

              <div className="min-w-0">
                <h1 className="truncate text-[29px] font-extrabold tracking-[-0.035em] text-[#252834]">{currentNav?.label || "Dashboard"}</h1>
                <p className="mt-1 truncate text-[15px] text-[#737985]">{pageSubtitle}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              <button className="relative flex h-11 w-11 items-center justify-center rounded-full text-[#20304a] transition hover:bg-[#f7f5f1]">
                <Bell size={24} strokeWidth={1.8} />
                <span className="absolute -right-0.5 -top-0.5 flex h-6 min-w-[24px] items-center justify-center rounded-full border-2 border-white bg-[#ef2b2d] px-1 text-[12px] font-extrabold text-white">3</span>
              </button>
              <button className="flex h-11 w-11 items-center justify-center rounded-full text-[#20304a] transition hover:bg-[#f7f5f1]">
                <CircleHelp size={24} strokeWidth={1.8} />
              </button>
              <div className="ml-4 flex items-center gap-3 border-l border-[#ece9e2] pl-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ffe0a8] text-[18px] font-extrabold text-[#f39a00]">
                  {user?.email?.[0]?.toUpperCase() || "A"}
                </div>
                <div className="hidden min-w-[108px] sm:block">
                  <p className="text-[15px] font-bold leading-tight text-[#252834]">Administrador</p>
                  <p className="mt-1 text-[13px] text-[#747b87]">Admin</p>
                </div>
                <ChevronDown size={17} className="hidden text-[#20304a] sm:block" />
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto bg-[#fafafa] px-5 py-5 print:overflow-visible print:p-0 sm:px-6 lg:px-7 min-h-0">
          <div className="mx-auto w-full max-w-[1680px]">
            {currentLocked ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-full max-w-sm rounded-[28px] border border-border bg-card p-6 shadow-sm text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Lock size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">Seção Protegida</h2>
                  <p className="mt-2 text-sm text-muted-foreground">Digite a senha para acessar esta seção.</p>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordError(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                    className="mt-5 w-full rounded-2xl border border-border bg-background px-4 py-3 text-center text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus
                  />
                  {passwordError && <p className="mt-3 text-xs font-medium text-destructive">Senha incorreta</p>}
                  <button
                    onClick={handlePasswordSubmit}
                    className="mt-5 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:bg-primary/90"
                  >
                    Desbloquear
                  </button>
                  {hasForgotOption && location.pathname === "/admin/configuracoes" && (
                    <button
                      onClick={() => openForgotPw("section")}
                      className="mx-auto mt-4 flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <HelpCircle size={12} /> Esqueci a senha
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="admin-page">
                <Outlet />
              </div>
            )}
          </div>
        </main>
      </div>
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
  <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]">
    <div className="w-full max-w-xl rounded-[28px] border border-border bg-card p-6 shadow-xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <HelpCircle size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">Recuperar Acesso</h3>
          <p className="text-sm text-muted-foreground">Responda as 5 perguntas de segurança corretamente.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4">
        {questions.slice(0, 5).map((q, i) => (
          <div key={i} className="rounded-2xl border border-border bg-background p-4">
            <label className="text-sm font-semibold text-foreground">{q.question}</label>
            <input
              type="text"
              value={answers[i] || ""}
              onChange={(e) => {
                const newAnswers = [...answers];
                newAnswers[i] = e.target.value;
                setAnswers(newAnswers);
              }}
              className="mt-3 w-full rounded-2xl border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              disabled={attempts >= 3}
            />
          </div>
        ))}
      </div>

      {error && <p className="mt-4 text-sm font-medium text-destructive">{error}</p>}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onClose}
          className="flex-1 rounded-2xl border border-border bg-background py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          onClick={onSubmit}
          disabled={attempts >= 3}
          className="flex-1 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          Verificar
        </button>
      </div>
    </div>
  </div>
);

export default AdminLayout;
