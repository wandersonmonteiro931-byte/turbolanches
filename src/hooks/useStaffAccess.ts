import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/hooks/useAdmin";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCOUNT_MODE_EVENT,
  ADMIN_SECTIONS,
  AdminAccountMode,
  
  getStoredAccountMode,
  MODE_LABELS,
  normalizeAdminPath,
  ROLE_LABELS,
  setStoredAccountMode,
  StaffRole,
} from "@/lib/adminAccess";

export interface StaffContext {
  id: string;
  store_id: string | null;
  user_id: string;
  role: StaffRole;
  display_name: string;
  email: string | null;
  is_active: boolean;
}

export const useStaffAccess = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const [staff, setStaff] = useState<StaffContext | null>(null);
  const [permissionPaths, setPermissionPaths] = useState<string[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [mode, setModeState] = useState<AdminAccountMode>(() => getStoredAccountMode());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (authLoading || adminLoading) return;
    if (!user || !isAdmin) {
      setStaff(null);
      setPermissionPaths([]);
      setLoadError(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = supabase as any;
      const { data: rows, error } = await client
        .from("staff_members")
        .select("id, store_id, user_id, role, display_name, email, is_active")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1);

      if (error) {
        // Falha ao ler as permissões: por segurança, nada é liberado.
        setStaff(null);
        setPermissionPaths([]);
        setLoadError(true);
        setLoading(false);
        return;
      }

      const member = (rows || [])[0];

      if (!member) {
        setStaff(null);
        setPermissionPaths([]);
        setLoadError(false);
        setLoading(false);
        return;
      }

      const { data: permissions, error: permissionError } = await client
        .from("staff_section_permissions")
        .select("section_path, can_access")
        .eq("staff_member_id", member.id)
        .eq("can_access", true);

      setStaff(member as StaffContext);
      setLoadError(Boolean(permissionError));
      setPermissionPaths(
        permissionError ? [] : (permissions || []).map((item: any) => item.section_path),
      );
    } finally {
      setLoading(false);
    }
  }, [adminLoading, authLoading, isAdmin, user]);


  useEffect(() => {
    void refresh();
    const handleFocus = () => void refresh();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refresh]);

  useEffect(() => {
    const handleMode = (event: Event) => {
      const custom = event as CustomEvent<AdminAccountMode>;
      setModeState(custom.detail || getStoredAccountMode());
    };
    const handleStorage = () => setModeState(getStoredAccountMode());
    window.addEventListener(ACCOUNT_MODE_EVENT, handleMode as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(ACCOUNT_MODE_EVENT, handleMode as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const isOwnerAdmin = Boolean(isAdmin && !staff && !loadError);

  const availableModes = useMemo<AdminAccountMode[]>(() => {
    if (!isAdmin) return ["client"];
    // Administrador nunca opera como Vendedor ou Caixa: apenas "Administração".
    if (isOwnerAdmin) return ["administration", "client"];
    if (staff?.role === "admin") return ["administration", "client"];
    if (staff?.role === "seller") return ["seller", "client"];
    if (staff?.role === "cashier") return ["cashier", "client"];
    return ["client"];
  }, [isAdmin, isOwnerAdmin, staff?.role]);

  useEffect(() => {
    if (loading || availableModes.includes(mode)) return;
    const fallback: AdminAccountMode = staff?.role === "seller" ? "seller" : staff?.role === "cashier" ? "cashier" : "administration";
    setStoredAccountMode(fallback);
    setModeState(fallback);
  }, [availableModes, loading, mode, staff?.role]);

  const effectivePermissions = useMemo(() => {
    if (!isAdmin || mode === "client") return new Set<string>();
    if (isOwnerAdmin) {
      // Administrador principal (sem conta de equipe) mantém acesso total.
      return new Set(ADMIN_SECTIONS.map((section) => section.path));
    }
    if (!staff || !staff.is_active || loadError) return new Set<string>();
    // Contas de administrador têm acesso total.
    if (staff.role === "admin") return new Set(ADMIN_SECTIONS.map((section) => section.path));
    // Vendedor/Caixa: SOMENTE as seções marcadas no cadastro.
    return new Set(permissionPaths.map((path) => normalizeAdminPath(path)));
  }, [isAdmin, isOwnerAdmin, loadError, mode, permissionPaths, staff]);


  const canAccess = useCallback(
    (path: string) => {
      const normalized = normalizeAdminPath(path);
      return effectivePermissions.has(normalized);
    },
    [effectivePermissions],
  );

  const switchMode = useCallback((nextMode: AdminAccountMode) => {
    if (!availableModes.includes(nextMode)) return false;
    setStoredAccountMode(nextMode);
    setModeState(nextMode);
    return true;
  }, [availableModes]);

  const roleLabel = staff ? ROLE_LABELS[staff.role] : "Administrador principal";
  const accountLabel = MODE_LABELS[mode];

  return {
    user,
    isAdmin,
    isOwnerAdmin,
    staff,
    mode,
    roleLabel,
    accountLabel,
    availableModes,
    permissionPaths,
    effectivePermissions,
    canAccess,
    switchMode,
    refresh,
    loading: authLoading || adminLoading || loading,
  };
};
