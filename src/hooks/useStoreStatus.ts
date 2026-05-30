import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { nowBrasilia } from "@/lib/brasiliaTime";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAY_LABELS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const getBrasiliaTime = () => {
  const now = nowBrasilia();

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  }).formatToParts(now);

  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const wk = parts.find((p) => p.type === "weekday")?.value ?? "Sun";

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    hhmm: `${hh === "24" ? "00" : hh}:${mm}`,
    dayOfWeek: map[wk] ?? 0,
  };
};

const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const buildNextOpeningText = (
  schedule: ScheduleDay[],
  currentDayOfWeek: number,
  currentHHMM: string,
): string | null => {
  const currentMinutes = hhmmToMinutes(currentHHMM);

  for (let offset = 0; offset < 7; offset += 1) {
    const dayIndex = (currentDayOfWeek + offset) % 7;
    const daySchedule = schedule.find((item) => item.day_of_week === dayIndex);

    if (!daySchedule || daySchedule.is_closed || !daySchedule.open_time) continue;

    const openHHMM = daySchedule.open_time.slice(0, 5);
    const openMinutes = hhmmToMinutes(openHHMM);

    if (offset === 0 && openMinutes <= currentMinutes) continue;

    if (offset === 0) return `Abre hoje às ${openHHMM} h`;
    if (offset === 1) return `Abre amanhã às ${openHHMM} h`;

    return `Abre ${DAY_LABELS[dayIndex]} às ${openHHMM} h`;
  }

  return null;
};

export const useStoreStatus = () => {
  const { storeId } = useStore();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [nextOpeningText, setNextOpeningText] = useState<string | null>(null);

  const checkStatus = async () => {
    try {
      let settingsQuery = supabase
        .from("store_settings")
        .select("is_open, use_schedule, closed_at, opened_at")
        .limit(1);

      let scheduleQuery = supabase
        .from("store_schedule")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week");

      if (storeId) {
        settingsQuery = settingsQuery.eq("store_id", storeId);
        scheduleQuery = scheduleQuery.eq("store_id", storeId);
      }

      const [settingsRes, scheduleRes] = await Promise.all([settingsQuery.single(), scheduleQuery]);

      const settings = settingsRes.data;
      const schedule = (scheduleRes.data || []) as ScheduleDay[];

      if (!settings) {
        setIsOpen(false);
        setNextOpeningText(null);
        setLoading(false);
        return;
      }

      const { hhmm, dayOfWeek } = getBrasiliaTime();
      const nextText = buildNextOpeningText(schedule, dayOfWeek, hhmm);

      /*
        CORREÇÃO PRINCIPAL

        Antes:
        - Se o horário cadastrado dizia que a loja deveria estar aberta,
          o hook reabria a loja mesmo depois do admin fechar manualmente.

        Agora:
        - store_settings.is_open é a fonte principal.
        - Se o admin fechou manualmente, is_open = false e a loja fica fechada.
        - O horário cadastrado só serve para mostrar a próxima abertura.
      */
      if (settings.is_open === false) {
        setIsOpen(false);
        setNextOpeningText(nextText);
        setLoading(false);
        return;
      }

      if (settings.is_open === true) {
        setIsOpen(true);
        setNextOpeningText(null);
        setLoading(false);
        return;
      }

      setIsOpen(false);
      setNextOpeningText(nextText);
      setLoading(false);
    } catch (error) {
      console.error("[useStoreStatus] erro ao verificar status da loja", error);
      setIsOpen(false);
      setNextOpeningText(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const interval = setInterval(checkStatus, 15_000);

    const onFocus = () => checkStatus();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);

    const channel1 = supabase
      .channel(`store-status-${storeId ?? "default"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => checkStatus())
      .subscribe();

    const channel2 = supabase
      .channel(`store-schedule-status-${storeId ?? "default"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "store_schedule" }, () => checkStatus())
      .subscribe();

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [storeId]);

  return { isOpen, loading, nextOpeningText };
};
