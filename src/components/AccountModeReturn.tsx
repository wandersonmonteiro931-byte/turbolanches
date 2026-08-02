import { useNavigate } from "react-router-dom";
import { ShieldCheck, Store, UserRound } from "lucide-react";
import { useStaffAccess } from "@/hooks/useStaffAccess";
import { MODE_LABELS, AdminAccountMode } from "@/lib/adminAccess";

const AccountModeReturn = () => {
  const navigate = useNavigate();
  const { isAdmin, mode, availableModes, switchMode, loading } = useStaffAccess();

  if (loading || !isAdmin || mode !== "client") return null;

  const backMode: AdminAccountMode = availableModes.includes("administration")
    ? "administration"
    : availableModes.includes("seller")
      ? "seller"
      : "cashier";

  const handleBack = () => {
    switchMode(backMode);
    navigate("/admin");
  };

  return (
    <div className="fixed right-3 top-3 z-[80] flex items-center gap-2 rounded-full border border-orange-200 bg-white/95 p-1.5 pl-3 shadow-lg backdrop-blur sm:right-5 sm:top-5">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
        <UserRound size={15} className="text-orange-500" />
        <span>Modo Cliente</span>
      </div>
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-2 text-xs font-bold text-white transition hover:bg-orange-600"
      >
        {backMode === "administration" ? <ShieldCheck size={14} /> : <Store size={14} />}
        Voltar para {MODE_LABELS[backMode]}
      </button>
    </div>
  );
};

export default AccountModeReturn;
