import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, Plus, X, UserCheck, UserX, Trash2 } from "lucide-react";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

interface AdminUser {
  user_id: string;
  role: string;
  profile?: {
    full_name: string;
    phone: string;
    email?: string;
  };
}

const AdminManageAdmins = () => {
  const { toast } = useToast();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, phone")
      .in("user_id", userIds);

    const profileMap = new Map(
      (profiles || []).map((p) => [p.user_id, p])
    );

    setAdmins(
      roles.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        profile: profileMap.get(r.user_id)
          ? {
              full_name: profileMap.get(r.user_id)!.full_name,
              phone: profileMap.get(r.user_id)!.phone,
            }
          : undefined,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  const createAdmin = async () => {
    if (!newEmail || !newPassword) {
      toast({ title: "Email e senha são obrigatórios", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      // Create user via edge function
      const { data, error } = await supabase.functions.invoke("admin-create-customer", {
        body: { email: newEmail, password: newPassword, full_name: newName, phone: "" },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const userId = data?.user?.id;
      if (!userId) throw new Error("Usuário não foi criado");

      // Assign admin role
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" } as any);

      if (roleError) throw roleError;

      toast({ title: "✅ Administrador criado com sucesso!" });
      setShowCreate(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      fetchAdmins();
    } catch (err: any) {
      toast({ title: err.message || "Erro ao criar administrador", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const removeAdmin = async (userId: string) => {
    if (!confirm("Tem certeza que deseja remover este administrador?")) return;

    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");

    if (error) {
      toast({ title: "Erro ao remover admin", variant: "destructive" });
      return;
    }

    toast({ title: "✅ Administrador removido" });
    fetchAdmins();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Shield size={20} className="text-primary" />
            Gerenciar Administradores
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Crie, ative ou desative contas de administrador do sistema.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> Novo Admin
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-foreground">Criar Administrador</h3>
            <button onClick={() => setShowCreate(false)}>
              <X size={16} className="text-muted-foreground" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              placeholder="Email *"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <input
              placeholder="Senha *"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <input
              placeholder="Nome"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={createAdmin}
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {creating ? "Criando..." : "Criar Administrador"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {admins.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhum administrador encontrado.
          </p>
        ) : (
          admins.map((admin) => (
            <div
              key={admin.user_id}
              className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Shield size={18} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {admin.profile?.full_name || "Sem nome"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {admin.profile?.phone || "Sem telefone"} · ID: {admin.user_id.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <button
                onClick={() => removeAdmin(admin.user_id)}
                className="inline-flex items-center gap-1 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
              >
                <Trash2 size={12} /> Remover
              </button>
            </div>
          ))
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">💡 Dicas</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>Ao criar um administrador, ele terá acesso total ao painel admin.</li>
          <li>Remover um admin não exclui a conta do usuário, apenas remove o acesso ao painel.</li>
          <li>Tenha cuidado ao remover seu próprio acesso de admin.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminManageAdmins;
