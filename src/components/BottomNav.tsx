import { useEffect, useState, useCallback } from "react";
import { Home, Search, FileText, User, Gift } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const tabs = [
  { path: "/", icon: Home, label: "Início" },
  { path: "/busca", icon: Search, label: "Busca" },
  { path: "/presentes", icon: Gift, label: "Presentes" },
  { path: "/pedidos", icon: FileText, label: "Pedidos" },
  { path: "/perfil", icon: User, label: "Perfil" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hasNewGifts, setHasNewGifts] = useState(false);

  const checkNewGifts = useCallback(async () => {
    if (!user) return;

    // Get the last time user visited presentes
    const lastSeen = localStorage.getItem(`presentes_seen_${user.id}`);
    const lastSeenDate = lastSeen ? new Date(lastSeen) : new Date(0);

    // Check for scratch wins newer than last seen
    const { data: newWins } = await supabase
      .from("scratch_wins")
      .select("id, found_at")
      .eq("user_id", user.id)
      .gt("found_at", lastSeenDate.toISOString())
      .limit(1);

    if (newWins && newWins.length > 0) {
      setHasNewGifts(true);
      return;
    }

    // Check for delivered orders eligible for scratch that haven't been scratched
    const { data: settings } = await supabase
      .from("scratch_settings")
      .select("is_enabled, min_order_value")
      .limit(1)
      .maybeSingle();

    if (settings && (settings as any).is_enabled) {
      const { data: wins } = await supabase
        .from("scratch_wins")
        .select("order_id")
        .eq("user_id", user.id);

      const winOrderIds = (wins || []).map((w: any) => w.order_id).filter(Boolean);

      const { data: eligibleOrders } = await supabase
        .from("orders")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "delivered")
        .gte("subtotal", (settings as any).min_order_value)
        .limit(1);

      if (eligibleOrders) {
        const unscratched = eligibleOrders.filter((o) => !winOrderIds.includes(o.id));
        if (unscratched.length > 0) {
          setHasNewGifts(true);
          return;
        }
      }
    }

    setHasNewGifts(false);
  }, [user]);

  useEffect(() => {
    checkNewGifts();

    // Re-check when orders change (realtime)
    if (!user) return;
    const channel = supabase
      .channel("bottomnav-gifts")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "orders",
        filter: `user_id=eq.${user.id}`,
      }, () => checkNewGifts())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "scratch_wins",
        filter: `user_id=eq.${user.id}`,
      }, () => checkNewGifts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, checkNewGifts]);

  // Mark as seen when user navigates to presentes
  useEffect(() => {
    if (location.pathname === "/presentes" && user && hasNewGifts) {
      localStorage.setItem(`presentes_seen_${user.id}`, new Date().toISOString());
      setHasNewGifts(false);
    }
  }, [location.pathname, user, hasNewGifts]);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-[0_-2px_10px_rgba(0,0,0,0.05)] safe-bottom">
      <div className="mx-auto flex max-w-md items-center justify-around py-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const isGiftTab = tab.path === "/presentes";
          return (
            <motion.button
              key={tab.path}
              whileTap={{ scale: 0.85 }}
              onClick={() => navigate(tab.path)}
              className={`relative flex flex-col items-center gap-0.5 px-4 py-1 text-xs transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <div className="relative">
                {isGiftTab && hasNewGifts ? (
                  <motion.div
                    animate={{ scale: [1, 1.25, 1], opacity: [1, 0.7, 1] }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <tab.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} className="text-primary" />
                  </motion.div>
                ) : (
                  <tab.icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                )}
                {isGiftTab && hasNewGifts && (
                  <motion.div
                    className="absolute -right-1.5 -top-1 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  />
                )}
              </div>
              <span className={`font-medium ${isGiftTab && hasNewGifts ? "text-primary font-bold" : ""}`}>
                {tab.label}
              </span>
              {isActive && (
                <motion.div
                  layoutId="bottomNavIndicator"
                  className="absolute -top-[1px] left-2 right-2 h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
