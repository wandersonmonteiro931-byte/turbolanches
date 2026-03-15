import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";
import { formatTimeBR, nowBrasilia } from "@/lib/brasiliaTime";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAY_LABELS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const getBrasiliaTime = () => {
  const now = nowBrasilia();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return { hhmm: `${hh}:${mm}`, dayOfWeek: now.getDay() };
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
        setNextOpeningText(null);
        setLoading(false);
        return;
      }

      const { hhmm, dayOfWeek } = getBrasiliaTime();
      const todaySchedule = schedule.find((s) => s.day_of_week === dayOfWeek);
      const nextText = buildNextOpeningText(schedule, dayOfWeek, hhmm);

      const setStatus = (open: boolean) => {
        setIsOpen(open);
        setNextOpeningText(open ? null : nextText);
      };

      const isRecent = (ts: string | null): boolean => {
        if (!ts) return false;
        return Date.now() - new Date(ts).getTime() < 12 * 60 * 60 * 1000;
      };

      if (todaySchedule) {
        if (todaySchedule.is_closed) {
          const manuallyOpened = settings.is_open === true && isRecent(settings.opened_at);
          setStatus(manuallyOpened);
          setLoading(false);
          return;
        }

        const openT = todaySchedule.open_time?.slice(0, 5);
        const closeT = todaySchedule.close_time?.slice(0, 5);

        let inTimeWindow = false;
        if (openT && closeT) {
          if (closeT <= openT) {
            inTimeWindow = hhmm >= openT || hhmm <= closeT;
          } else {
            inTimeWindow = hhmm >= openT && hhmm <= closeT;
          }
        }

        if (inTimeWindow) {
          if (settings.is_open === false && isRecent(settings.closed_at)) {
            const closedHHMM = formatTimeBR(settings.closed_at);
            setStatus(!(closedHHMM && openT ? closedHHMM >= openT : false));
          } else {
            setStatus(true);
          }
        } else if (settings.is_open === true && isRecent(settings.opened_at)) {
          const openedHHMM = formatTimeBR(settings.opened_at);
          if (closeT && openT && hhmm >= closeT && closeT > openT) {
            setStatus(Boolean(openedHHMM && openedHHMM >= closeT));
          } else {
            setStatus(true);
          }
        } else {
          setStatus(false);
        }
      } else {
        setStatus(settings.is_open);
      }

      setLoading(false);
    } catch {
      setNextOpeningText(null);
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const interval = setInterval(checkStatus, 60_000);

    const channel1 = supabase
      .channel("store-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_settings" }, () => checkStatus())
      .subscribe();

    const channel2 = supabase
      .channel("store-schedule-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "store_schedule" }, () => checkStatus())
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [storeId]);

  return { isOpen, loading, nextOpeningText };
};
