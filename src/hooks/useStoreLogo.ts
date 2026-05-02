import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the current store_logo_url from store_settings.
 * Subscribes to realtime changes so the logo updates everywhere instantly.
 *
 * IMPORTANT: After any realtime UPDATE we re-fetch from the database instead
 * of trusting the payload, because Supabase realtime may deliver a payload
 * where unrelated columns (or the logo itself) appear stale/null depending
 * on RLS and replica identity. This prevents the logo from "downgrading" by
 * itself when other columns are edited.
 */
export function useStoreLogo(fallback?: string) {
  const [logoUrl, setLogoUrl] = useState<string>(fallback ?? "");

  useEffect(() => {
    let cancelled = false;

    const fetchLogo = async () => {
      const { data } = await supabase
        .from("store_settings")
        .select("store_logo_url")
        .limit(1)
        .single();
      if (cancelled) return;
      const url = data?.store_logo_url;
      if (typeof url === "string" && url.length > 0) {
        setLogoUrl(url);
      }
    };

    fetchLogo();

    const channel = supabase
      .channel("store-logo-changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "store_settings" },
        () => {
          // Always re-fetch fresh from DB instead of trusting payload
          fetchLogo();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return logoUrl;
}
