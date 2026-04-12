import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface Store {
  id: string;
  name: string;
  slug: string;
  logo_url: string;
  whatsapp_number: string;
  whatsapp_name: string;
  active: boolean;
}

interface StoreContextType {
  store: Store | null;
  storeId: string | null;
  loading: boolean;
  /** For admin: their assigned store */
  adminStoreId: string | null;
}

const StoreContext = createContext<StoreContextType>({
  store: null,
  storeId: null,
  loading: true,
  adminStoreId: null,
});

/**
 * Detect store from subdomain.
 * Pattern: {slug}.turbolanches.lovable.app or {slug}.yourdomain.com
 * Fallback: main domain = default store (first active store).
 */
function detectSlugFromHostname(): string | null {
  const hostname = window.location.hostname;

  // localhost or IP — no subdomain detection
  if (hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    return null;
  }

  // Split hostname parts
  const parts = hostname.split(".");

  // For lovable preview URLs like xxx-preview--xxx.lovable.app, skip
  if (hostname.includes("preview--")) return null;

  // For patterns like slug.turbolanches.lovable.app (4+ parts)
  // or slug.customdomain.com (3+ parts where first is not www)
  if (parts.length >= 3) {
    const sub = parts[0];
    if (sub !== "www" && sub !== "turbolanches") {
      return sub;
    }
  }

  return null;
}

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [adminStoreId, setAdminStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const slug = detectSlugFromHostname();

      if (slug) {
        // Subdomain detected — load that store
        const { data } = await supabase
          .from("stores")
          .select("*")
          .eq("slug", slug)
          .eq("active", true)
          .single();
        if (data) {
          setStore(data as Store);
        }
      } else {
        // Default: load first active store (main domain)
        const { data } = await supabase
          .from("stores")
          .select("*")
          .eq("active", true)
          .order("created_at")
          .limit(1)
          .single();
        if (data) {
          setStore(data as Store);
        }
      }

      setLoading(false);
    };

    init();
  }, []);

  // For admin users, fetch their assigned store_id
  useEffect(() => {
    let isMounted = true;

    const resolveAdminStore = async () => {
      if (!user) {
        if (!isMounted) return;
        setAdminStoreId(null);
        return;
      }

      const { data } = await supabase.rpc("get_admin_store_id", {
        _user_id: user.id,
      });

      if (!isMounted) return;

      if (data) {
        setAdminStoreId(data);
        return;
      }

      setAdminStoreId(store?.id ?? null);
    };

    void resolveAdminStore();

    return () => {
      isMounted = false;
    };
  }, [user, store]);

  const storeId = adminStoreId || store?.id || null;

  return (
    <StoreContext.Provider value={{ store, storeId, loading, adminStoreId }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => useContext(StoreContext);
