import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export interface SecurityQuestion {
  question: string;
  answer: string;
}

export interface AdminPasswordConfig {
  password: string;
  lockedSections: string[];
  securityQuestions?: SecurityQuestion[];
  requireOnEntry?: boolean;
}

const CONFIG_KEY = "admin_section_password";

export const useAdminSectionPassword = () => {
  const { storeId } = useStore();
  const [config, setConfig] = useState<AdminPasswordConfig>({ password: "", lockedSections: [], securityQuestions: [], requireOnEntry: false });
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
        const parsed = JSON.parse(data.value);
        setConfig({
          password: parsed.password || "",
          lockedSections: parsed.lockedSections || [],
          securityQuestions: parsed.securityQuestions || [],
          requireOnEntry: parsed.requireOnEntry ?? false,
        });
      } catch {
        setConfig({ password: "", lockedSections: [], securityQuestions: [], requireOnEntry: false });
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
    window.dispatchEvent(new CustomEvent("admin-pw-config-updated", { detail: newConfig }));
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as AdminPasswordConfig;
      if (detail) setConfig(detail);
    };
    window.addEventListener("admin-pw-config-updated", handler);
    return () => window.removeEventListener("admin-pw-config-updated", handler);
  }, []);

  const isSectionLocked = (sectionPath: string): boolean => {
    if (!config.password) return false;
    return config.lockedSections.includes(sectionPath);
  };

  return { config, loading, saveConfig, isSectionLocked };
};
