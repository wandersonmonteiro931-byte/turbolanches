import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Global admin alarm that works across all admin pages.
 * Polls for pending orders and plays alarm sound continuously.
 * Uses Notification API for background/closed tab alerts.
 */
export function useAdminAlarm() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();
  const isOnAdminRoute = location.pathname.startsWith("/admin") || location.pathname.startsWith("/cozinha");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasPlayingRef = useRef(false);

  // Check admin role
  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
  }, [user]);

  // Poll for pending orders + realtime
  useEffect(() => {
    if (!isAdmin || !user) return;

    const checkPending = async () => {
      const { data, count } = await supabase
        .from("orders")
        .select("id, status, payment_method", { count: "exact", head: false })
        .in("status", ["pending", "paid"]);

      const filtered = (data || []).filter(o => {
        // Exclude unpaid PIX
        if (o.payment_method === "pix" && o.status === "pending") return false;
        return true;
      });
      setPendingCount(filtered.length);
    };

    checkPending();
    intervalRef.current = setInterval(checkPending, 10_000);

    const channel = supabase
      .channel("admin-alarm-global")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        checkPending();
      })
      .subscribe();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAdmin, user]);

  // Play alarm sound
  useEffect(() => {
    const shouldPlay = pendingCount > 0 && isAdmin;

    if (shouldPlay) {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const playAlarm = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();

        const t = ctx.currentTime;
        const notes = [
          { freq: 1200, start: 0, dur: 0.12 },
          { freq: 900, start: 0.15, dur: 0.12 },
          { freq: 1200, start: 0.30, dur: 0.12 },
          { freq: 900, start: 0.45, dur: 0.12 },
          { freq: 1200, start: 0.60, dur: 0.12 },
          { freq: 900, start: 0.75, dur: 0.12 },
        ];

        notes.forEach(({ freq, start, dur }) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = "square";
          osc.frequency.setValueAtTime(freq, t + start);
          gain.gain.setValueAtTime(0.45, t + start);
          gain.gain.exponentialRampToValueAtTime(0.01, t + start + dur);
          osc.start(t + start);
          osc.stop(t + start + dur);
        });
      };

      playAlarm();
      alarmIntervalRef.current = setInterval(playAlarm, 2500);

      // Send browser notification for background tabs
      if (!wasPlayingRef.current && "Notification" in window && Notification.permission === "granted") {
        new Notification("🔔 Novo pedido!", {
          body: `${pendingCount} pedido(s) aguardando aceitação`,
          icon: "/favicon.ico",
          tag: "admin-alarm",
          requireInteraction: true,
        } as NotificationOptions);
      }
      wasPlayingRef.current = true;
    } else {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
      wasPlayingRef.current = false;
    }

    return () => {
      if (alarmIntervalRef.current) {
        clearInterval(alarmIntervalRef.current);
        alarmIntervalRef.current = null;
      }
    };
  }, [pendingCount, isAdmin]);

  return { pendingCount };
}
