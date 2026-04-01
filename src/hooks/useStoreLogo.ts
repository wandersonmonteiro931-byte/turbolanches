import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current store_logo_url from store_settings.
 * Subscribes to realtime changes so the logo updates everywhere instantly.
 */
export function useStoreLogo(fallback?: string) {
  const [logoUrl, setLogoUrl] = useState<string>(fallback ?? "");

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("store_logo_url")
        .limit(1)
        .single();
      if (data?.store_logo_url) {
        setLogoUrl(data.store_logo_url);
      }
    };
    fetch();

    // Listen for realtime changes to store_settings
    const channel = supabase
      .channel("store-logo-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_settings" },
        (payload) => {
          const newUrl = (payload.new as any)?.store_logo_url;
          if (typeof newUrl === "string") {
            setLogoUrl(newUrl);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return logoUrl;
}
