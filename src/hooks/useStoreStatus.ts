import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

export const useStoreStatus = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  const checkStatus = async () => {
    // Fetch store_settings and schedule in parallel
    const [settingsRes, scheduleRes] = await Promise.all([
      supabase
        .from("store_settings")
        .select("is_open, use_schedule, scheduled_open, scheduled_close")
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

    // Manual override always takes priority:
    // If admin manually closed (is_open=false), store is closed regardless of schedule
    // If admin manually opened (is_open=true), check schedule to see if we're in hours
    // Force Brasília timezone (America/Sao_Paulo)
    const now = new Date();
    const brFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = brFormatter.formatToParts(now);
    const brHour = parts.find((p) => p.type === "hour")!.value;
    const brMinute = parts.find((p) => p.type === "minute")!.value;
    const hhmm = `${brHour}:${brMinute}`;

    // Get Brasília day of week
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const dayOfWeek = brDate.getDay(); // 0=Sunday

    const todaySchedule = schedule.find((s) => s.day_of_week === dayOfWeek);

    if (todaySchedule) {
      // If today is marked as closed day
      if (todaySchedule.is_closed) {
        // Admin can still override to open
        setIsOpen(settings.is_open === true);
        setLoading(false);
        return;
      }

      // Check time window
      const inTimeWindow =
        todaySchedule.open_time &&
        todaySchedule.close_time &&
        hhmm >= todaySchedule.open_time.slice(0, 5) &&
        hhmm <= todaySchedule.close_time.slice(0, 5);

      if (inTimeWindow) {
        // Within schedule hours: admin can close early (is_open=false overrides)
        setIsOpen(settings.is_open !== false);
      } else {
        // Outside schedule hours: admin can open early (is_open=true overrides)
        setIsOpen(settings.is_open === true);
      }
    } else {
      // No schedule found, use manual toggle
      setIsOpen(settings.is_open);
    }

    setLoading(false);
  };

  useEffect(() => {
    checkStatus();

    // Re-check every minute for time-based changes
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
