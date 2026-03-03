import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

/** Get current Brasília time parts */
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

/** Convert a Date to Brasília HH:MM */
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
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    const [settingsRes, scheduleRes] = await Promise.all([
      supabase
        .from("store_settings")
        .select("is_open, use_schedule, closed_at, opened_at")
        .limit(1)
        .single(),
      supabase
        .from("store_schedule")
        .select("day_of_week, open_time, close_time, is_closed")
        .order("day_of_week"),
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
        // Day marked closed — only open if admin explicitly opened recently
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
        // WITHIN schedule window → default OPEN
        // Unless admin manually closed AFTER this window's open_time (and it's recent)
        if (settings.is_open === false && isRecent(settings.closed_at)) {
          const closedHHMM = toBrasiliaHHMM(new Date(settings.closed_at as string));
          // Only honour manual close if it happened after today's open time
          setIsOpen(!(closedHHMM >= openT!));
        } else {
          setIsOpen(true);
        }
      } else {
        // OUTSIDE schedule window → default CLOSED
        // Unless admin manually opened AND that open happened AFTER the last close boundary
        if (settings.is_open === true && isRecent(settings.opened_at)) {
          const openedHHMM = toBrasiliaHHMM(new Date(settings.opened_at as string));
          if (closeT && hhmm >= closeT && !(closeT <= openT!)) {
            // We're past today's closing time — only honour if opened AFTER close
            setIsOpen(openedHHMM >= closeT);
          } else {
            // Before today's opening time — honour the manual open
            setIsOpen(true);
          }
        } else {
          setIsOpen(false);
        }
      }
    } else {
      // No schedule entry → fall back to manual toggle
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
  }, []);

  return { isOpen, loading };
};
