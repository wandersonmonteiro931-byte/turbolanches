import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

export interface Banner {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  link: string;
  sort_order: number;
  active: boolean;
}

export function useBanners() {
  const { storeId } = useStore();
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      let query = supabase
        .from("banners")
        .select("*")
        .eq("active", true)
        .order("sort_order");

      if (storeId) query = query.eq("store_id", storeId);

      const { data } = await query;
      if (data) setBanners(data);
      setLoading(false);
    };
    fetch();
  }, [storeId]);

  return { banners, loading };
}
