import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, ShieldAlert, ShoppingBag, WalletCards, Shield, X, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminAccountMode, MODE_LABELS, ROLE_LABELS, StaffRole, setStoredAccountMode } from "@/lib/adminAccess";
import { resolveLoginEmail } from "@/lib/staffLogin";
import { cn } from "@/lib/utils";

interface StaffAccountOption {
  id: string;
  role: StaffRole;
  display_name: string;
  employee_code: string | null;
  username: string | null;
  email: string | null;
}

interface AccountSwitchDialogProps {
  targetMode: Exclude<AdminAccountMode, "client">;
  onClose: () => void;
  onSwitched: (mode: AdminAccountMode) => void;
}

const MODE_TO_ROLE: Record<Exclude<AdminAccountMode, "client">, StaffRole> = {
  administration: "admin",
  seller: "seller",
  cashier: "cashier",
};

const MODE_ICONS: Record<Exclude<AdminAccountMode, "client">, typeof Shield> = {
  administration: Shield,
  seller: ShoppingBag,
  cashier: WalletCards,
};

const AccountSwitchDialog = ({ targetMode, onClose, onSwitched }: AccountSwitchDialogProps) => {
  const [accounts, setAccounts] = useState<StaffAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const role = MODE_TO_ROLE[targetMode];
  const ModeIcon = MODE_ICONS[targetMode];

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setSelectedId(null);
    setPassword("");

    void (async () => {
      const { data, error: rpcError } = await (supabase as any).rpc("list_switchable_staff_accounts");
      if (!active) return;
      if (rpcError) {
        setAccounts([]);
        setError("Não foi possível carregar as contas cadastradas.");
      } else {
        const list = ((data || []) as StaffAccountOption[]).filter((item) => item.role === role);
        setAccounts(list);
        if (list.length === 1) setSelectedId(list[0].id);
      }
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [role]);

  const selected = useMemo(() => accounts.find((item) => item.id === selectedId) || null, [accounts, selectedId]);

  const handleConfirm = async () => {
    if (!selected) {
      setError("Escolha um funcionário para continuar.");
      return;
    }
    if (!password.trim()) {
      setError("Digite a senha da conta.");
      return;
    }

    const candidates = Array.from(
      new Set(
        [
          selected.email ? selected.email.trim().toLowerCase() : "",
          selected.username ? resolveLoginEmail(selected.username) : "",
        ].filter(Boolean),
      ),
    );

    if (!candidates.length) {
      setError("Esta conta não tem usuário ou e-mail de acesso cadastrado.");
      return;
    }

    setSubmitting(true);
    setError("");

    let signedIn = false;
    for (const candidate of candidates) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: candidate,
        password,
      });
      if (!signInError) {
        signedIn = true;
        break;
      }
    }
    setSubmitting(false);

    if (!signedIn) {
      setPassword("");
      setError("Senha incorreta. Tente novamente.");
      return;
    }


    setStoredAccountMode(targetMode);
    onSwitched(targetMode);
    // Recarrega para o painel assumir a nova sessão/permissões imediatamente.
    window.location.replace("/admin");
  };


  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-[440px] rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#fff4df] text-[#d97706]">
            <ModeIcon size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-extrabold text-[#252834]">Entrar como {MODE_LABELS[targetMode]}</p>
            <p className="mt-0.5 text-[12px] leading-4 text-[#747b87]">
              Escolha o funcionário e digite a senha para trocar de conta.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#8a909b] transition hover:bg-[#f4f2ee]"
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] font-medium text-[#747b87]">
              <Loader2 size={16} className="animate-spin" /> Carregando contas...
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-2xl border border-[#f4d4a1] bg-[#fffaf0] p-4">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[#b45309]">
                <ShieldAlert size={16} />
                Nenhuma conta de {ROLE_LABELS[role]} cadastrada
              </div>
              <p className="mt-1 text-[12px] leading-4 text-[#8a6b3a]">
                Cadastre uma conta em <span className="font-semibold">Equipe e acessos</span> para poder entrar como {MODE_LABELS[targetMode]}.
              </p>
            </div>
          ) : (
            <>
              <p className="px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a909b]">Funcionários cadastrados</p>
              <div className="mt-2 max-h-[240px] space-y-1.5 overflow-auto pr-0.5">
                {accounts.map((account) => {
                  const isSelected = account.id === selectedId;
                  return (
                    <button
                      key={account.id}
                      type="button"
                      onClick={() => {
                        setSelectedId(account.id);
                        setError("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                        isSelected
                          ? "border-[#f39a00] bg-[#fff8ec]"
                          : "border-[#ece9e2] bg-white hover:bg-[#faf8f4]",
                      )}
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f1efe9] text-[12px] font-extrabold text-[#5a616d]">
                        {account.display_name?.[0]?.toUpperCase() || <UserRound size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-[#252834]">{account.display_name}</p>
                        <p className="truncate text-[11px] text-[#747b87]">
                          {account.employee_code ? `Matrícula ${account.employee_code}` : "Sem matrícula"}
                          {account.username ? ` • ${account.username}` : ""}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <label className="mt-4 block px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#8a909b]">
                Senha
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-[#ece9e2] bg-white px-3">
                <Lock size={15} className="text-[#8a909b]" />
                <input
                  type="password"
                  value={password}
                  autoComplete="off"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void handleConfirm();
                  }}
                  placeholder="Senha da conta"
                  className="h-12 flex-1 bg-transparent text-[16px] text-[#252834] outline-none placeholder:text-[#a8adb6]"
                />
              </div>
            </>
          )}

          {error && <p className="mt-3 text-[12px] font-semibold text-[#d44545]">{error}</p>}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-2xl border border-[#ece9e2] text-[13px] font-bold text-[#5a616d] transition hover:bg-[#f7f5f1]"
            >
              Cancelar
            </button>
            {accounts.length > 0 && (
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirm()}
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#f39a00] text-[13px] font-bold text-white transition hover:bg-[#dd8a00] disabled:opacity-60"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />}
                Autenticar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountSwitchDialog;
