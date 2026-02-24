import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useStoreStatus = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("is_open, use_schedule, scheduled_open, scheduled_close")
        .limit(1)
        .single();
      if (data) {
        if (data.use_schedule && data.scheduled_open && data.scheduled_close) {
          const now = new Date();
          const hhmm = now.toTimeString().slice(0, 5);
          setIsOpen(hhmm >= data.scheduled_open && hhmm <= data.scheduled_close);
        } else {
          setIsOpen(data.is_open);
        }
      }
      setLoading(false);
    };

    fetch();

    const channel = supabase
      .channel("store-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => fetch())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { isOpen, loading };
};
