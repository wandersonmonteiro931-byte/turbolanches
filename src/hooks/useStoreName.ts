import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: string | null = null;
const listeners = new Set<(name: string) => void>();
let channelStarted = false;

const fetchName = async () => {
  const { data } = await supabase
    .from("store_settings")
    .select("store_display_name")
    .limit(1)
    .single();
  const name = data?.store_display_name?.trim();
  if (!name) return cached ?? "Turbo Lanches";
  cached = name;
  listeners.forEach((l) => l(name));
  if (typeof document !== "undefined") document.title = name;
  return name;
};

const ensureRealtime = () => {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel("store_name_sync")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "store_settings" },
      () => {
        // Re-fetch from DB instead of trusting payload (avoids stale/null fields)
        fetchName();
      },
    )
    .subscribe();
};

/**
 * Returns the configured store display name.
 * Updates reactively when store_settings changes.
 */
export const useStoreName = (): string => {
  const [name, setName] = useState<string>(cached ?? "Turbo Lanches");

  useEffect(() => {
    listeners.add(setName);
    ensureRealtime();
    if (cached === null) {
      fetchName();
    } else {
      setName(cached);
    }
    return () => {
      listeners.delete(setName);
    };
  }, []);

  return name;
};
