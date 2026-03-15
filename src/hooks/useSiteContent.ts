import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

interface SiteContent {
  [key: string]: string;
}

export function useSiteContent() {
  const { storeId } = useStore();
  const [content, setContent] = useState<SiteContent>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase.from("site_content").select("key, value");
      if (storeId) {
        query = query.or(`store_id.eq.${storeId},store_id.is.null`);
      }

      const { data } = await query;
      if (data) {
        const map: SiteContent = {};
        for (const item of data) {
          map[item.key] = item.value;
        }
        setContent(map);
      }
      setLoading(false);
    };
    fetch();
  }, [storeId]);

  return { content, loading };
}
