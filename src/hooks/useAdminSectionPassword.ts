import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export interface AdminPasswordConfig {
  password: string;
  lockedSections: string[];
}

const CONFIG_KEY = "admin_section_password";

export const useAdminSectionPassword = () => {
  const { storeId } = useStore();
  const [config, setConfig] = useState<AdminPasswordConfig>({ password: "", lockedSections: [] });
  const [loading, setLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    let query = supabase
      .from("site_content")
      .select("value")
      .eq("key", CONFIG_KEY)
      .limit(1);
    if (storeId) query = query.eq("store_id", storeId);

    const { data } = await query.maybeSingle();
    if (data?.value) {
      try {
        setConfig(JSON.parse(data.value));
      } catch {
        setConfig({ password: "", lockedSections: [] });
      }
    }
    setLoading(false);
  }, [storeId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveConfig = async (newConfig: AdminPasswordConfig) => {
    const value = JSON.stringify(newConfig);
    let query = supabase
      .from("site_content")
      .select("id")
      .eq("key", CONFIG_KEY)
      .limit(1);
    if (storeId) query = query.eq("store_id", storeId);

    const { data: existing } = await query.maybeSingle();

    if (existing) {
      await supabase
        .from("site_content")
        .update({ value } as any)
        .eq("id", existing.id);
    } else {
      await supabase
        .from("site_content")
        .insert({
          key: CONFIG_KEY,
          value,
          content_type: "json",
          store_id: storeId || null,
        } as any);
    }
    setConfig(newConfig);
  };

  const isSectionLocked = (sectionPath: string): boolean => {
    if (!config.password) return false;
    return config.lockedSections.includes(sectionPath);
  };

  return { config, loading, saveConfig, isSectionLocked };
};
