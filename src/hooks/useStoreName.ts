import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
const listeners = new Set<(name: string) => void>();

const fetchName = async () => {
  const { data } = await supabase
    .from("store_settings")
    .select("store_display_name")
    .limit(1)
    .single();
  const name = data?.store_display_name?.trim() || "Turbo Lanches";
  cached = name;
  listeners.forEach((l) => l(name));
  // Update document title automatically
  if (typeof document !== "undefined") document.title = name;
  return name;
};

/**
 * Returns the configured store display name.
 * Updates reactively when store_settings changes.
 */
export const useStoreName = (): string => {
  const [name, setName] = useState<string>(cached ?? "Turbo Lanches");

  useEffect(() => {
    listeners.add(setName);
    if (cached === null) {
      fetchName();
    } else {
      setName(cached);
    }

    const channel = supabase
      .channel("store_name_sync")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_settings" },
        (payload) => {
          const next = (payload.new as any)?.store_display_name?.trim();
          if (next && next !== cached) {
            cached = next;
            if (typeof document !== "undefined") document.title = next;
            listeners.forEach((l) => l(next));
          }
        },
      )
      .subscribe();

    return () => {
      listeners.delete(setName);
      supabase.removeChannel(channel);
    };
  }, []);

  return name;
};
