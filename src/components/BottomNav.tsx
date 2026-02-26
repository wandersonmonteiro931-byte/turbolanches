import { Home, Search, FileText, User } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCart } from "@/contexts/CartContext";

const tabs = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/busca", icon: Search, label: "Busca" },
  { path: "/pedidos", icon: FileText, label: "Pedidos" },
  { path: "/perfil", icon: User, label: "Perfil" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.05)] safe-bottom">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <motion.button
              key={tab.path}
              whileTap={{ scale: 0.85 }}
              onClick={() => navigate(tab.path)}
              className={`relative flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <tab.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="font-medium">{tab.label}</span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-[1px] left-2 right-2 h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              {tab.label === "Pedidos" && totalItems > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                >
                  {totalItems}
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
