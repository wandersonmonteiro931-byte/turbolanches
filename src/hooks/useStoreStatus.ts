import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useStore } from "@/contexts/StoreContext";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const getBrasiliaTime = () => {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const h = parts.find((p) => p.type === "hour")!.value;
  const m = parts.find((p) => p.type === "minute")!.value;
  const hhmm = `${h}:${m}`;

  const brDate = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
  );
  return { hhmm, dayOfWeek: brDate.getDay() };
};

const toBrasiliaHHMM = (date: Date): string => {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  return `${parts.find((p) => p.type === "hour")!.value}:${parts.find((p) => p.type === "minute")!.value}`;
};

export const useStoreStatus = () => {
  const { storeId } = useStore();
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
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

    const [settingsRes, scheduleRes] = await Promise.all([
      settingsQuery.single(),
      scheduleQuery,
    ]);

    const settings = settingsRes.data;
    const schedule = (scheduleRes.data || []) as ScheduleDay[];

    if (!settings) {
      setLoading(false);
      return;
    }

    const { hhmm, dayOfWeek } = getBrasiliaTime();
    const todaySchedule = schedule.find((s) => s.day_of_week === dayOfWeek);

    const isRecent = (ts: string | null): boolean => {
      if (!ts) return false;
      return Date.now() - new Date(ts as string).getTime() < 12 * 60 * 60 * 1000;
    };

    if (todaySchedule) {
      if (todaySchedule.is_closed) {
        const manuallyOpened = settings.is_open === true && isRecent(settings.opened_at);
        setIsOpen(manuallyOpened);
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
          const closedHHMM = toBrasiliaHHMM(new Date(settings.closed_at as string));
          setIsOpen(!(closedHHMM >= openT!));
        } else {
          setIsOpen(true);
        }
      } else {
        if (settings.is_open === true && isRecent(settings.opened_at)) {
          const openedHHMM = toBrasiliaHHMM(new Date(settings.opened_at as string));
          if (closeT && hhmm >= closeT && !(closeT <= openT!)) {
            setIsOpen(openedHHMM >= closeT);
          } else {
            setIsOpen(true);
          }
        } else {
          setIsOpen(false);
        }
      }
    } else {
      setIsOpen(settings.is_open);
    }

    setLoading(false);
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

  return { isOpen, loading };
};
