import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

export const useAdmin = () => {
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const checkAdminRole = async () => {
      if (authLoading) return;

      if (!user) {
        if (!isMounted) return;
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error } = await supabase.rpc("has_role", {
        _user_id: user.id,
        _role: "admin",
      });

      if (!isMounted) return;

      setIsAdmin(!error && Boolean(data));
      setLoading(false);
    };

    void checkAdminRole();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  return { isAdmin, loading };
};
