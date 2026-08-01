import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  Banknote,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Landmark,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  WalletCards,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const db = supabase as any;

interface FinancialAccount {
  store_id: string;
  status: "pending_setup" | "active" | "suspended";
  payout_pix_key_type: "cpf" | "cnpj" | "email" | "phone" | "random" | null;
  payout_pix_key: string | null;
  payout_holder_name: string | null;
  payout_holder_document: string | null;
  auto_payout_enabled: boolean;
  auto_payout_frequency: "manual" | "daily" | "weekly";
  auto_payout_minimum: number;
  terms_accepted_at: string | null;
}

interface WalletSummary {
  gross_received: number;
  platform_fees: number;
  pending_balance: number;
  available_balance: number;
  total_balance: number;
  paid_out_total: number;
  reserved_for_withdrawal: number;
  account_status: string;
}

interface Withdrawal {
  id: string;
  store_id: string;
  amount: number;
  net_amount: number;
  status: string;
  payout_pix_key: string;
  payout_holder_name: string;
  requested_at: string;
  paid_at: string | null;
  efi_status: string | null;
  error_message: string | null;
  stores?: { name?: string } | null;
}

interface WalletTransaction {
  id: string;
  entry_type: string;
  amount: number;
  gross_amount: number | null;
  fee_amount: number;
  description: string;
  available_at: string;
  created_at: string;
}

interface PlatformSettings {
  id: number;
  platform_fee_percent: number;
  settlement_delay_hours: number;
  minimum_withdrawal: number;
  automatic_payout_enabled: boolean;
  automatic_payout_frequency: "daily" | "weekly";
  payout_description: string;
}

const emptyAccount = (storeId: string): FinancialAccount => ({
  store_id: storeId,
  status: "pending_setup",
  payout_pix_key_type: "cpf",
  payout_pix_key: "",
  payout_holder_name: "",
  payout_holder_document: "",
  auto_payout_enabled: false,
  auto_payout_frequency: "manual",
  auto_payout_minimum: 20,
  terms_accepted_at: null,
});

const money = (value: number | string | null | undefined) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("pt-BR") : "—";

const statusLabel: Record<string, string> = {
  requested: "Solicitado",
  processing: "Em processamento",
  paid: "Pago",
  failed: "Falhou",
  cancelled: "Cancelado",
};

const statusClass: Record<string, string> = {
  requested: "bg-amber-500/15 text-amber-600",
  processing: "bg-blue-500/15 text-blue-600",
  paid: "bg-emerald-500/15 text-emerald-600",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const AdminFinance = () => {
  const { storeId } = useStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [account, setAccount] = useState<FinancialAccount | null>(null);
  const [summary, setSummary] = useState<WalletSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings | null>(null);
  const [platformWithdrawals, setPlatformWithdrawals] = useState<Withdrawal[]>([]);
  const [runningAutomatic, setRunningAutomatic] = useState(false);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string>("");

  const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");

  const invokeWallet = useCallback(async (path: string, payload: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão expirada");
    const response = await fetch(`${supabaseUrl}/functions/v1/wallet-efi/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 202) throw new Error(data.error || "Erro no serviço financeiro");
    return { response, data };
  }, [supabaseUrl]);

  const invokePixAdmin = useCallback(async (path: "register-webhook" | "check-webhook") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Sessão expirada");
    const response = await fetch(`${supabaseUrl}/functions/v1/pix-efi/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Erro ao configurar webhook Efí");
    return data;
  }, [supabaseUrl]);

  const configureWebhook = async (checkOnly = false) => {
    setWebhookLoading(true);
    try {
      const data = await invokePixAdmin(checkOnly ? "check-webhook" : "register-webhook");
      setWebhookStatus(typeof data.response === "string" ? data.response : JSON.stringify(data.response || data));
      toast({ title: checkOnly ? "Webhook consultado" : "Webhook Efí registrado" });
    } catch (error: any) {
      toast({ title: "Erro no webhook Efí", description: error.message, variant: "destructive" });
    } finally {
      setWebhookLoading(false);
    }
  };

  const fetchData = useCallback(async () => {
    if (!storeId || !user) return;
    setLoading(true);
    try {
      const [accountRes, summaryRes, withdrawalsRes, transactionsRes, platformRes] = await Promise.all([
        db.from("store_financial_accounts").select("*").eq("store_id", storeId).maybeSingle(),
        db.from("store_wallet_summary").select("*").eq("store_id", storeId).maybeSingle(),
        db.from("wallet_withdrawal_requests").select("*").eq("store_id", storeId).order("requested_at", { ascending: false }).limit(50),
        db.from("store_wallet_transactions").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100),
        db.rpc("is_platform_admin", { _user_id: user.id }),
      ]);

      const currentAccount = (accountRes.data || emptyAccount(storeId)) as FinancialAccount;
      setAccount(currentAccount);
      setAcceptTerms(Boolean(currentAccount.terms_accepted_at));
      setSummary(summaryRes.data as WalletSummary | null);
      setWithdrawals((withdrawalsRes.data || []) as Withdrawal[]);
      setTransactions((transactionsRes.data || []) as WalletTransaction[]);
      setIsPlatformAdmin(Boolean(platformRes.data));

      if (platformRes.data) {
        const [settingsRes, allWithdrawalsRes] = await Promise.all([
          db.from("platform_finance_settings").select("*").eq("id", 1).single(),
          db.from("wallet_withdrawal_requests")
            .select("*, stores(name)")
            .order("requested_at", { ascending: false })
            .limit(100),
        ]);
        setPlatformSettings(settingsRes.data as PlatformSettings);
        setPlatformWithdrawals((allWithdrawalsRes.data || []) as Withdrawal[]);
      }
    } catch (error: any) {
      toast({ title: "Erro ao carregar financeiro", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [storeId, toast, user]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`finance-${storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_wallet_transactions", filter: `store_id=eq.${storeId}` }, () => void fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "wallet_withdrawal_requests", filter: `store_id=eq.${storeId}` }, () => void fetchData())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchData, storeId]);

  const normalizedDocument = useMemo(
    () => String(account?.payout_holder_document || "").replace(/\D/g, ""),
    [account?.payout_holder_document],
  );

  const saveAccount = async () => {
    if (!account || !storeId || !user) return;
    const key = String(account.payout_pix_key || "").trim();
    const holder = String(account.payout_holder_name || "").trim();
    if (!account.payout_pix_key_type || !key || !holder) {
      toast({ title: "Preencha a chave PIX e o titular", variant: "destructive" });
      return;
    }
    if (![11, 14].includes(normalizedDocument.length)) {
      toast({ title: "Informe um CPF ou CNPJ válido do titular", variant: "destructive" });
      return;
    }
    if (!acceptTerms) {
      toast({ title: "Aceite os termos de repasse", variant: "destructive" });
      return;
    }

    setSaving(true);
    const { error } = await db.rpc("update_store_payout_settings", {
      _store_id: storeId,
      _pix_key_type: account.payout_pix_key_type,
      _pix_key: key,
      _holder_name: holder,
      _holder_document: normalizedDocument,
      _auto_payout_enabled: account.auto_payout_enabled,
      _auto_payout_frequency: account.auto_payout_enabled ? account.auto_payout_frequency : "manual",
      _auto_payout_minimum: Math.max(0, Number(account.auto_payout_minimum || 0)),
      _accept_terms: acceptTerms,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar conta financeira", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conta financeira ativada" });
    await fetchData();
  };

  const requestWithdrawal = async () => {
    const amount = Number(withdrawAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Informe um valor de saque válido", variant: "destructive" });
      return;
    }
    setWithdrawing(true);
    try {
      const { data: withdrawalId, error } = await db.rpc("request_store_withdrawal", { _amount: amount });
      if (error) throw error;
      const { response, data } = await invokeWallet("process-withdrawal", { withdrawal_id: withdrawalId });
      setWithdrawAmount("");
      if (response.status === 202) {
        toast({ title: "Saque em verificação", description: data.error || "A Efí ainda está confirmando o envio." });
      } else {
        toast({ title: "Solicitação enviada à Efí", description: "O status será atualizado automaticamente." });
      }
      await fetchData();
    } catch (error: any) {
      toast({ title: "Não foi possível solicitar o saque", description: error.message, variant: "destructive" });
    } finally {
      setWithdrawing(false);
    }
  };

  const processOrCheck = async (withdrawal: Withdrawal, checkOnly = false) => {
    setProcessingId(withdrawal.id);
    try {
      await invokeWallet(checkOnly ? "check-withdrawal" : "process-withdrawal", { withdrawal_id: withdrawal.id });
      toast({ title: checkOnly ? "Status consultado" : "Repasse enviado para processamento" });
      await fetchData();
    } catch (error: any) {
      toast({ title: "Falha no repasse", description: error.message, variant: "destructive" });
    } finally {
      setProcessingId(null);
    }
  };

  const savePlatformSettings = async () => {
    if (!platformSettings || !user) return;
    setSaving(true);
    const { error } = await db.from("platform_finance_settings").update({
      platform_fee_percent: Number(platformSettings.platform_fee_percent || 0),
      settlement_delay_hours: Number(platformSettings.settlement_delay_hours || 0),
      minimum_withdrawal: Number(platformSettings.minimum_withdrawal || 0),
      automatic_payout_enabled: platformSettings.automatic_payout_enabled,
      automatic_payout_frequency: platformSettings.automatic_payout_frequency,
      payout_description: platformSettings.payout_description,
      updated_by: user.id,
    }).eq("id", 1);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar regras", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Regras financeiras salvas" });
    await fetchData();
  };

  const runAutomaticPayouts = async () => {
    setRunningAutomatic(true);
    try {
      const { data } = await invokeWallet("process-auto-payouts");
      toast({ title: "Repasses automáticos processados", description: `${data.processed || 0} solicitação(ões) criada(s).` });
      await fetchData();
    } catch (error: any) {
      toast({ title: "Erro no repasse automático", description: error.message, variant: "destructive" });
    } finally {
      setRunningAutomatic(false);
    }
  };

  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast({ title: "Copiado" });
  };

  if (loading || !account) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><WalletCards className="text-primary" /> Financeiro</h1>
          <p className="text-sm text-muted-foreground">Saldo a receber dos pedidos pagos pelo PIX central da plataforma.</p>
        </div>
        <Button variant="outline" onClick={() => void fetchData()}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div><strong>Conta financeira interna:</strong> este saldo representa valores que a plataforma deve repassar à loja. Não é conta bancária, não recebe depósitos externos e só aumenta após confirmação real da Efí.</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BalanceCard icon={Banknote} title="Disponível para saque" value={money(summary?.available_balance)} highlight />
        <BalanceCard icon={Clock3} title="A liberar" value={money(summary?.pending_balance)} />
        <BalanceCard icon={LockKeyhole} title="Reservado em saques" value={money(summary?.reserved_for_withdrawal)} />
        <BalanceCard icon={ArrowDownToLine} title="Total já repassado" value={money(summary?.paid_out_total)} />
      </div>

      <Tabs defaultValue="account" className="space-y-4">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="account">Conta e recebimento</TabsTrigger>
          <TabsTrigger value="withdraw">Sacar</TabsTrigger>
          <TabsTrigger value="statement">Extrato</TabsTrigger>
          {isPlatformAdmin && <TabsTrigger value="platform">Gestão da plataforma</TabsTrigger>}
        </TabsList>

        <TabsContent value="account" className="space-y-4">
          <section className="rounded-xl border bg-card p-4 md:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className="font-bold">Dados para recebimento</h2><p className="text-sm text-muted-foreground">O saque será enviado pela conta Efí central para esta chave.</p></div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${account.status === "active" ? "bg-emerald-500/15 text-emerald-600" : "bg-amber-500/15 text-amber-600"}`}>{account.status === "active" ? "Ativa" : "Configuração pendente"}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tipo da chave PIX">
                <select className="w-full rounded-md border bg-background px-3 py-2" value={account.payout_pix_key_type || "cpf"} onChange={e => setAccount({ ...account, payout_pix_key_type: e.target.value as any })}>
                  <option value="cpf">CPF</option><option value="cnpj">CNPJ</option><option value="email">E-mail</option><option value="phone">Celular</option><option value="random">Chave aleatória</option>
                </select>
              </Field>
              <Field label="Chave PIX"><Input value={account.payout_pix_key || ""} onChange={e => setAccount({ ...account, payout_pix_key: e.target.value })} placeholder="Chave que receberá os repasses" /></Field>
              <Field label="Nome do titular"><Input value={account.payout_holder_name || ""} onChange={e => setAccount({ ...account, payout_holder_name: e.target.value })} placeholder="Nome igual ao cadastro bancário" /></Field>
              <Field label="CPF ou CNPJ do titular"><Input value={account.payout_holder_document || ""} onChange={e => setAccount({ ...account, payout_holder_document: e.target.value })} placeholder="Somente números" inputMode="numeric" /></Field>
            </div>

            <div className="mt-6 rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3"><div><Label>Repasse automático</Label><p className="text-xs text-muted-foreground">Quando habilitado pela plataforma, envia todo o saldo disponível.</p></div><Switch checked={account.auto_payout_enabled} onCheckedChange={checked => setAccount({ ...account, auto_payout_enabled: checked, auto_payout_frequency: checked && account.auto_payout_frequency === "manual" ? "daily" : account.auto_payout_frequency })} /></div>
              {account.auto_payout_enabled && <div className="grid gap-4 md:grid-cols-2"><Field label="Frequência"><select className="w-full rounded-md border bg-background px-3 py-2" value={account.auto_payout_frequency} onChange={e => setAccount({ ...account, auto_payout_frequency: e.target.value as any })}><option value="daily">Diariamente</option><option value="weekly">Semanalmente</option></select></Field><Field label="Saldo mínimo para repasse"><Input type="number" min="0" step="0.01" value={account.auto_payout_minimum} onChange={e => setAccount({ ...account, auto_payout_minimum: Number(e.target.value) })} /></Field></div>}
            </div>

            <label className="mt-5 flex items-start gap-3 rounded-lg bg-muted/50 p-4 text-sm"><input type="checkbox" className="mt-1" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} /><span>Confirmo que a chave pertence ao titular informado e autorizo a plataforma a realizar repasses referentes às vendas desta loja.</span></label>
            <Button className="mt-5" onClick={saveAccount} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Salvar e ativar</Button>
          </section>
        </TabsContent>

        <TabsContent value="withdraw" className="space-y-4">
          <section className="rounded-xl border bg-card p-4 md:p-6">
            <h2 className="font-bold">Solicitar saque</h2>
            <p className="mt-1 text-sm text-muted-foreground">O valor é reservado imediatamente e enviado para a chave cadastrada.</p>
            <div className="mt-5 max-w-md space-y-3"><Label>Valor do saque</Label><Input value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} placeholder="0,00" inputMode="decimal" /><Button onClick={requestWithdrawal} disabled={withdrawing || account.status !== "active" || Number(summary?.available_balance || 0) <= 0}>{withdrawing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowDownToLine className="mr-2 h-4 w-4" />} Solicitar saque</Button></div>
          </section>
          <WithdrawalList withdrawals={withdrawals} processingId={processingId} onAction={(w) => processOrCheck(w, w.status === "processing")} />
        </TabsContent>

        <TabsContent value="statement">
          <section className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b p-4"><h2 className="font-bold">Extrato da loja</h2></div>
            <div className="divide-y">
              {transactions.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>}
              {transactions.map(item => <div key={item.id} className="flex items-start justify-between gap-4 p-4"><div><p className="font-medium">{item.description}</p><p className="text-xs text-muted-foreground">Criado em {dateTime(item.created_at)}{new Date(item.available_at) > new Date() ? ` • libera em ${dateTime(item.available_at)}` : ""}</p>{item.fee_amount > 0 && <p className="text-xs text-muted-foreground">Valor bruto {money(item.gross_amount)} • taxa {money(item.fee_amount)}</p>}</div><span className={`whitespace-nowrap font-bold ${Number(item.amount) >= 0 ? "text-emerald-600" : "text-destructive"}`}>{Number(item.amount) >= 0 ? "+" : ""}{money(item.amount)}</span></div>)}
            </div>
          </section>
        </TabsContent>

        {isPlatformAdmin && platformSettings && <TabsContent value="platform" className="space-y-4">
          <section className="rounded-xl border bg-card p-4 md:p-6">
            <div className="mb-5 flex items-center gap-2"><Settings2 className="text-primary" /><div><h2 className="font-bold">Regras da plataforma</h2><p className="text-sm text-muted-foreground">Aplicadas a todas as lojas e aos próximos pagamentos.</p></div></div>
            <div className="grid gap-4 md:grid-cols-3"><Field label="Taxa da plataforma (%)"><Input type="number" min="0" max="100" step="0.01" value={platformSettings.platform_fee_percent} onChange={e => setPlatformSettings({ ...platformSettings, platform_fee_percent: Number(e.target.value) })} /></Field><Field label="Prazo para liberar (horas)"><Input type="number" min="0" value={platformSettings.settlement_delay_hours} onChange={e => setPlatformSettings({ ...platformSettings, settlement_delay_hours: Number(e.target.value) })} /></Field><Field label="Saque mínimo"><Input type="number" min="0" step="0.01" value={platformSettings.minimum_withdrawal} onChange={e => setPlatformSettings({ ...platformSettings, minimum_withdrawal: Number(e.target.value) })} /></Field></div>
            <div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Descrição do repasse"><Input maxLength={100} value={platformSettings.payout_description} onChange={e => setPlatformSettings({ ...platformSettings, payout_description: e.target.value })} placeholder="REPASSE TURBO LANCHES" /></Field><Field label="Frequência global"><select className="w-full rounded-md border bg-background px-3 py-2" value={platformSettings.automatic_payout_frequency} onChange={e => setPlatformSettings({ ...platformSettings, automatic_payout_frequency: e.target.value as "daily" | "weekly" })}><option value="daily">Diariamente</option><option value="weekly">Semanalmente</option></select></Field></div>
            <div className="mt-4 flex items-center justify-between rounded-lg border p-4"><div><Label>Permitir repasses automáticos</Label><p className="text-xs text-muted-foreground">O agendamento externo chama a função da plataforma.</p></div><Switch checked={platformSettings.automatic_payout_enabled} onCheckedChange={checked => setPlatformSettings({ ...platformSettings, automatic_payout_enabled: checked })} /></div>
            <div className="mt-4 flex flex-wrap gap-2"><Button onClick={savePlatformSettings} disabled={saving}><Save className="mr-2 h-4 w-4" /> Salvar regras</Button><Button variant="outline" onClick={runAutomaticPayouts} disabled={runningAutomatic}>{runningAutomatic ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />} Executar repasses agora</Button></div>
            <div className="mt-5 rounded-lg border p-4"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 text-primary" /><div className="flex-1"><h3 className="font-semibold">Webhook da Efí</h3><p className="text-xs text-muted-foreground">Registre uma vez após configurar os segredos. Ele confirma pagamentos e repasses automaticamente.</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void configureWebhook(false)} disabled={webhookLoading}>{webhookLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />} Registrar webhook</Button><Button size="sm" variant="ghost" onClick={() => void configureWebhook(true)} disabled={webhookLoading}><RefreshCw className="mr-2 h-4 w-4" /> Consultar</Button></div>{webhookStatus && <pre className="mt-3 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px] whitespace-pre-wrap">{webhookStatus}</pre>}</div></div></div>
          </section>
          <WithdrawalList withdrawals={platformWithdrawals} processingId={processingId} showStore onAction={(w) => processOrCheck(w, w.status === "processing")} />
        </TabsContent>}
      </Tabs>

      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        <div className="flex items-start gap-3"><Landmark className="mt-0.5 h-5 w-5 shrink-0" /><div><strong className="text-foreground">PIX único da plataforma:</strong> o cliente sempre paga a cobrança criada na conta Efí central. O pedido identifica a loja pelo <code>store_id</code>, e o webhook cria o crédito no saldo dessa loja apenas uma vez.</div></div>
      </section>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <div className="space-y-2"><Label>{label}</Label>{children}</div>;

const BalanceCard = ({ icon: Icon, title, value, highlight = false }: { icon: any; title: string; value: string; highlight?: boolean }) => <div className={`rounded-xl border p-4 ${highlight ? "border-primary/40 bg-primary/5" : "bg-card"}`}><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4" />{title}</div><p className="mt-2 text-xl font-bold">{value}</p></div>;

const WithdrawalList = ({ withdrawals, processingId, onAction, showStore = false }: { withdrawals: Withdrawal[]; processingId: string | null; onAction: (w: Withdrawal) => void; showStore?: boolean }) => (
  <section className="rounded-xl border bg-card overflow-hidden">
    <div className="border-b p-4"><h2 className="font-bold">Saques e repasses</h2></div>
    <div className="divide-y">
      {withdrawals.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum saque solicitado.</p>}
      {withdrawals.map(item => <div key={item.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold">{money(item.amount)}</p><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass[item.status] || "bg-muted"}`}>{statusLabel[item.status] || item.status}</span>{showStore && <span className="text-xs text-muted-foreground"><Building2 className="mr-1 inline h-3 w-3" />{item.stores?.name || item.store_id.slice(0, 8)}</span>}</div><p className="mt-1 text-xs text-muted-foreground">{item.payout_holder_name} • solicitado em {dateTime(item.requested_at)}</p>{item.efi_status && <p className="text-xs text-muted-foreground">Efí: {item.efi_status}</p>}{item.error_message && <p className="mt-1 text-xs text-destructive">{item.error_message}</p>}</div><div className="flex gap-2">{["requested", "processing"].includes(item.status) && <Button size="sm" variant="outline" onClick={() => onAction(item)} disabled={processingId === item.id}>{processingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : item.status === "processing" ? <RefreshCw className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}</Button>}{item.status === "paid" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}{item.status === "failed" && <XCircle className="h-5 w-5 text-destructive" />}{item.payout_pix_key && <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(item.payout_pix_key)}><Copy className="h-4 w-4" /></Button>}</div></div>)}
    </div>
  </section>
);

export default AdminFinance;
