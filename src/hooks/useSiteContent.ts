import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface SiteContent {
  [key: string]: string;
}

export function useSiteContent() {
  const [content, setContent] = useState<SiteContent>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from("site_content").select("key, value");
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
  }, []);

  return { content, loading };
}
