import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TvAd {
  id: string;
  title: string;
  image_url: string;
  duration_seconds: number;
  sort_order: number;
}

const TvDisplay = () => {
  const [ads, setAds] = useState<TvAd[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAds = useCallback(async () => {
    const { data } = await supabase
      .from("tv_ads")
      .select("id,title,image_url,duration_seconds,sort_order")
      .eq("active", true)
      .order("sort_order");
    setAds((data as TvAd[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAds();
    const channel = supabase
      .channel("tv-ads-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tv_ads" },
        () => fetchAds()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAds]);

  // Advance slide based on current ad's duration
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (ads.length === 0) return;
    const safeIndex = index % ads.length;
    const dur = Math.max(2, ads[safeIndex]?.duration_seconds || 8) * 1000;
    timerRef.current = setTimeout(() => {
      setIndex((i) => (i + 1) % ads.length);
    }, dur);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [index, ads]);

  // Reset index if ads list shrinks
  useEffect(() => {
    if (ads.length > 0 && index >= ads.length) setIndex(0);
  }, [ads, index]);

  return (

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      {loading ? (
        <div className="flex h-full w-full items-center justify-center text-white/60">
          Carregando...
        </div>
      ) : ads.length === 0 ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center text-white/60">
          <p className="text-2xl font-bold">Nenhuma publicidade ativa</p>
          <p className="text-sm">Cadastre imagens em /admin/tv-publicidade</p>
        </div>
      ) : (
        <>
          {ads.map((ad, i) => (
            <img
              key={ad.id}
              src={ad.image_url}
              alt={ad.title}
              className="absolute inset-0 h-full w-full object-fill transition-opacity duration-700"
              style={{ opacity: i === index % ads.length ? 1 : 0 }}
              draggable={false}
            />
          ))}
        </>
      )}
    </div>
  );
};

export default TvDisplay;
