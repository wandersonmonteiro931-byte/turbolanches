import TurboLoader from "@/components/TurboLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import {
  ADMIN_SECTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  StaffRole,
} from "@/lib/adminAccess";
import {
  BadgeCheck,
  Banknote,
  Check,
  ChevronDown,
  KeyRound,
  Pencil,
  Plus,
  Search,
  Shield,
  ShoppingBag,
  Trash2,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isStaffInternalEmail, normalizeStaffUsername } from "@/lib/staffLogin";

interface StaffMember {
  id: string;
  store_id: string | null;
  user_id: string;
  role: StaffRole;
  display_name: string;
  email: string | null;
  employee_code: string | null;
  username: string | null;
  is_active: boolean;
  created_at: string;
  permissions: string[];
}

const emptyForm = {
  displayName: "",
  employeeCode: "",
  username: "",
  email: "",
  password: "",
  role: "seller" as StaffRole,
  storeId: "",
  permissions: [...DEFAULT_ROLE_PERMISSIONS.seller],
};

const roleIcon = (role: StaffRole) => {
  if (role === "admin") return Shield;
  if (role === "seller") return ShoppingBag;
  return Banknote;
};

const roleDescription: Record<StaffRole, string> = {
  admin: "Administra as seções liberadas pelo administrador principal.",
  seller: "Atende clientes, cria pedidos e acompanha vendas.",
  cashier: "Opera caixa, pagamentos, fiados e pedidos do balcão.",
};

const AdminManageAdmins = () => {
  const { toast } = useToast();
  const { storeId } = useStore();
  const { isOwnerAdmin } = useStaffAccess();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [stores, setStores] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm, storeId: storeId || "" });
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Operação", "Financeiro"]));

  const groupedSections = useMemo(() => {
    return ADMIN_SECTIONS.reduce<Record<string, typeof ADMIN_SECTIONS>>((groups, section) => {
      groups[section.group] = [...(groups[section.group] || []), section];
      return groups;
    }, {});
  }, []);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const client = supabase as any;
      let query = client
        .from("staff_members")
        .select("id, store_id, user_id, role, display_name, email, employee_code, username, is_active, created_at")
        .order("created_at", { ascending: false });
      if (storeId) query = query.eq("store_id", storeId);

      const { data, error } = await query;
      if (error) throw error;

      const ids = (data || []).map((item: any) => item.id);
      let permissionRows: any[] = [];
      if (ids.length) {
        const { data: rows, error: permissionError } = await client
          .from("staff_section_permissions")
          .select("staff_member_id, section_path, can_access")
          .in("staff_member_id", ids)
          .eq("can_access", true);
        if (permissionError) throw permissionError;
        permissionRows = rows || [];
      }

      setMembers(
        (data || []).map((member: any) => ({
          ...member,
          permissions: permissionRows
            .filter((row) => row.staff_member_id === member.id)
            .map((row) => row.section_path),
        })),
      );
    } catch (error: any) {
      toast({
        title: "Não foi possível carregar a equipe",
        description: error?.message || "Ative o backend pelo Lovable usando o arquivo 2 - ATIVAR EQUIPE PELO LOVABLE.bat.",
        variant: "destructive",
      });
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [storeId, toast]);

  useEffect(() => {
    void fetchMembers();
    (supabase as any)
      .from("stores")
      .select("id, name")
      .order("name")
      .then(({ data }: any) => setStores(data || []));
  }, [fetchMembers]);

  useEffect(() => {
    if (storeId && !form.storeId) setForm((current) => ({ ...current, storeId }));
  }, [form.storeId, storeId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({ ...emptyForm, storeId: storeId || "" });
    setShowForm(false);
  };

  const applyRoleTemplate = (role: StaffRole) => {
    setForm((current) => ({
      ...current,
      role,
      permissions: [...DEFAULT_ROLE_PERMISSIONS[role]],
    }));
  };

  const togglePermission = (path: string) => {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(path)
        ? current.permissions.filter((permission) => permission !== path)
        : [...current.permissions, path],
    }));
  };

  const toggleGroup = (group: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const toggleWholeGroup = (group: string) => {
    const paths = groupedSections[group].map((section) => section.path);
    const allSelected = paths.every((path) => form.permissions.includes(path));
    setForm((current) => ({
      ...current,
      permissions: allSelected
        ? current.permissions.filter((path) => !paths.includes(path))
        : Array.from(new Set([...current.permissions, ...paths])),
    }));
  };

  const savePermissions = async (memberId: string, permissions: string[]) => {
    const client = supabase as any;
    const { error: deleteError } = await client
      .from("staff_section_permissions")
      .delete()
      .eq("staff_member_id", memberId);
    if (deleteError) throw deleteError;

    if (!permissions.length) return;
    const { error: insertError } = await client.from("staff_section_permissions").insert(
      permissions.map((sectionPath) => ({
        staff_member_id: memberId,
        section_path: sectionPath,
        can_access: true,
      })),
    );
    if (insertError) throw insertError;
  };

  const saveMember = async () => {
    const usernameValue = normalizeStaffUsername(form.username);
    if (!form.displayName.trim() || (!form.email.trim() && !usernameValue) || (!editingId && form.password.length < 6)) {
      toast({
        title: "Preencha os dados obrigatórios",
        description: "Informe nome, e-mail ou usuário de acesso, e uma senha com pelo menos 6 caracteres.",
        variant: "destructive",
      });
      return;
    }
    if (!form.permissions.includes("/admin")) {
      toast({
        title: "Dashboard obrigatório",
        description: "Todo membro da equipe precisa ter acesso ao Dashboard.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const client = supabase as any;
        const { error } = await client
          .from("staff_members")
          .update({
            display_name: form.displayName.trim(),
            role: form.role,
            store_id: form.storeId || null,
            email: form.email.trim().toLowerCase() || null,
            employee_code: form.employeeCode.trim().toUpperCase() || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingId);
        if (error) throw error;
        await savePermissions(editingId, form.permissions);
        toast({ title: "Acesso atualizado com sucesso" });
      } else {
        const { data, error } = await supabase.functions.invoke("admin-manage-staff", {
          body: {
            action: "create",
            display_name: form.displayName.trim(),
            email: form.email.trim().toLowerCase(),
            username: usernameValue,
            employee_code: form.employeeCode.trim().toUpperCase(),
            password: form.password,
            role: form.role,
            store_id: form.storeId || storeId,
            permissions: form.permissions,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        toast({ title: `${ROLE_LABELS[form.role]} cadastrado com sucesso` });
      }
      resetForm();
      await fetchMembers();
    } catch (error: any) {
      toast({
        title: "Não foi possível salvar",
        description: error?.message || "Verifique se a ativação pelo Lovable foi concluída.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (member: StaffMember) => {
    setEditingId(member.id);
    setForm({
      displayName: member.display_name,
      employeeCode: member.employee_code || "",
      username: member.username || "",
      email: isStaffInternalEmail(member.email) ? "" : member.email || "",
      password: "",
      role: member.role,
      storeId: member.store_id || storeId || "",
      permissions: member.permissions.length ? [...member.permissions] : [...DEFAULT_ROLE_PERMISSIONS[member.role]],
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleStatus = async (member: StaffMember) => {
    try {
      const { error } = await (supabase as any)
        .from("staff_members")
        .update({ is_active: !member.is_active, updated_at: new Date().toISOString() })
        .eq("id", member.id);
      if (error) throw error;
      toast({ title: member.is_active ? "Acesso suspenso" : "Acesso reativado" });
      await fetchMembers();
    } catch (error: any) {
      toast({ title: "Erro ao alterar status", description: error?.message, variant: "destructive" });
    }
  };

  const deleteMember = async (member: StaffMember) => {
    if (!confirm(`Excluir definitivamente a conta de ${member.display_name}?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("admin-manage-staff", {
        body: { action: "delete", staff_member_id: member.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Conta excluída" });
      await fetchMembers();
    } catch (error: any) {
      toast({ title: "Não foi possível excluir", description: error?.message, variant: "destructive" });
    }
  };

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return members;
    return members.filter((member) =>
      `${member.display_name} ${member.email || ""} ${member.username || ""} ${member.employee_code || ""} ${ROLE_LABELS[member.role]}`.toLowerCase().includes(term),
    );
  }, [members, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <TurboLoader size={110} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Users size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-foreground">Equipe e acessos</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre administradores, vendedores e caixas e escolha exatamente quais seções cada conta poderá acessar.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            {showForm ? <X size={17} /> : <Plus size={17} />}
            {showForm ? "Cancelar" : "Nova conta"}
          </button>
        </div>

        {isOwnerAdmin && (
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
            <BadgeCheck size={20} className="text-orange-600" />
            <div>
              <p className="text-sm font-bold text-orange-900">Você é o administrador principal</p>
              <p className="text-xs text-orange-800/80">Sua conta sempre mantém acesso total e não aparece na lista de contas delegadas.</p>
            </div>
          </div>
        )}
      </section>

      {showForm && (
        <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-extrabold text-foreground">{editingId ? "Editar conta" : "Cadastrar conta da equipe"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">A senha poderá ser alterada posteriormente por recuperação de acesso.</p>
            </div>
            <KeyRound size={22} className="text-primary" />
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="text-sm font-bold text-foreground">Nome completo *</label>
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Nome do funcionário"
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-foreground">Matrícula</label>
              <input
                value={form.employeeCode}
                onChange={(event) => setForm((current) => ({ ...current, employeeCode: event.target.value.toUpperCase() }))}
                placeholder="Gerada automaticamente"
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-foreground">Usuário de acesso</label>
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="ex.: joao.caixa"
                autoCapitalize="none"
                disabled={Boolean(editingId)}
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm disabled:bg-muted"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Pode entrar com este usuário e a senha, sem precisar de e-mail.</p>
            </div>
            <div>
              <label className="text-sm font-bold text-foreground">E-mail de acesso</label>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="usuario@loja.com"
                disabled={Boolean(editingId)}
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm disabled:bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-foreground">Senha {editingId ? "" : "*"}</label>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={editingId ? "Mantida sem alteração" : "Mínimo 6 caracteres"}
                disabled={Boolean(editingId)}
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm disabled:bg-muted"
              />
            </div>
            <div>
              <label className="text-sm font-bold text-foreground">Loja</label>
              <select
                value={form.storeId}
                onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))}
                className="mt-2 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
              >
                <option value="">Loja atual</option>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-bold text-foreground">Tipo da conta</label>
            <div className="mt-2 grid gap-3 md:grid-cols-3">
              {(["admin", "seller", "cashier"] as StaffRole[]).map((role) => {
                const RoleIcon = roleIcon(role);
                const active = form.role === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => applyRoleTemplate(role)}
                    className={cn(
                      "rounded-2xl border p-4 text-left transition",
                      active ? "border-orange-400 bg-orange-50 shadow-sm" : "border-border bg-white hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("flex h-10 w-10 items-center justify-center rounded-xl", active ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground")}>
                        <RoleIcon size={19} />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-foreground">{ROLE_LABELS[role]}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{roleDescription[role]}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-sm font-extrabold text-foreground">Seções permitidas</h4>
              <p className="mt-1 text-xs text-muted-foreground">{form.permissions.length} de {ADMIN_SECTIONS.length} seções selecionadas.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, permissions: ["/admin"] }))}
                className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setForm((current) => ({ ...current, permissions: ADMIN_SECTIONS.map((section) => section.path) }))}
                className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-foreground hover:bg-muted"
              >
                Selecionar tudo
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {Object.entries(groupedSections).map(([group, sections]) => {
              const open = expandedGroups.has(group);
              const allSelected = sections.every((section) => form.permissions.includes(section.path));
              return (
                <div key={group} className="overflow-hidden rounded-2xl border border-border bg-white">
                  <div className="flex items-center gap-2 bg-[#faf9f6] p-3">
                    <button type="button" onClick={() => toggleGroup(group)} className="flex flex-1 items-center text-left">
                      <ChevronDown size={16} className={cn("mr-2 transition", !open && "-rotate-90")} />
                      <span className="text-sm font-extrabold text-foreground">{group}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleWholeGroup(group)}
                      className={cn(
                        "rounded-lg px-2.5 py-1.5 text-[11px] font-bold",
                        allSelected ? "bg-orange-100 text-orange-700" : "bg-white text-muted-foreground",
                      )}
                    >
                      {allSelected ? "Remover grupo" : "Liberar grupo"}
                    </button>
                  </div>
                  {open && (
                    <div className="grid gap-1 p-2">
                      {sections.map((section) => {
                        const checked = form.permissions.includes(section.path);
                        const dashboard = section.path === "/admin";
                        return (
                          <button
                            key={section.path}
                            type="button"
                            onClick={() => !dashboard && togglePermission(section.path)}
                            className={cn(
                              "flex items-start gap-3 rounded-xl p-3 text-left transition",
                              checked ? "bg-orange-50" : "hover:bg-muted/60",
                              dashboard && "cursor-default",
                            )}
                          >
                            <span className={cn(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                              checked ? "border-orange-500 bg-orange-500 text-white" : "border-border bg-white",
                            )}>
                              {checked && <Check size={13} />}
                            </span>
                            <span>
                              <span className="block text-sm font-bold text-foreground">{section.label}</span>
                              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{section.description}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={resetForm} className="h-11 rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted">
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveMember}
              disabled={saving}
              className="h-11 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : editingId ? "Salvar alterações" : "Cadastrar conta"}
            </button>
          </div>
        </section>
      )}

      <section className="rounded-[24px] border border-border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-foreground">Contas cadastradas</h3>
            <p className="mt-1 text-xs text-muted-foreground">{members.length} conta(s) delegada(s).</p>
          </div>
          <div className="relative w-full sm:w-[300px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar nome, e-mail ou função..."
              className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {filteredMembers.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border py-12 text-center">
              <UserCog size={34} className="mx-auto text-muted-foreground/50" />
              <p className="mt-3 text-sm font-bold text-foreground">Nenhuma conta encontrada</p>
              <p className="mt-1 text-xs text-muted-foreground">Cadastre vendedores, caixas ou administradores.</p>
            </div>
          ) : filteredMembers.map((member) => {
            const RoleIcon = roleIcon(member.role);
            return (
              <article key={member.id} className="rounded-2xl border border-border bg-white p-4 transition hover:shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                    <RoleIcon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-extrabold text-foreground">{member.display_name}</h4>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-[10px] font-bold uppercase",
                        member.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
                      )}>
                        {member.is_active ? "Ativo" : "Suspenso"}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {member.employee_code ? `Matrícula ${member.employee_code}` : "Sem matrícula"}
                      {" · "}
                      {member.username
                        ? `Usuário ${member.username}`
                        : isStaffInternalEmail(member.email)
                          ? "Acesso interno"
                          : member.email}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground">{ROLE_LABELS[member.role]}</span>
                      <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-700">{member.permissions.length} seções</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3">
                  <button type="button" onClick={() => startEdit(member)} className="flex items-center justify-center gap-1.5 rounded-xl bg-muted px-2 py-2 text-xs font-bold text-foreground hover:bg-muted/70">
                    <Pencil size={13} /> Editar
                  </button>
                  <button type="button" onClick={() => toggleStatus(member)} className={cn(
                    "rounded-xl px-2 py-2 text-xs font-bold",
                    member.is_active ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700",
                  )}>
                    {member.is_active ? "Suspender" : "Ativar"}
                  </button>
                  <button type="button" onClick={() => deleteMember(member)} className="flex items-center justify-center gap-1.5 rounded-xl bg-red-50 px-2 py-2 text-xs font-bold text-red-600 hover:bg-red-100">
                    <Trash2 size={13} /> Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default AdminManageAdmins;
