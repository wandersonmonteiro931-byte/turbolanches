import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Global admin alarm that works across all admin pages.
 * Polls for pending orders and plays alarm sound continuously.
 * Uses a single persistent AudioContext with user-interaction resume.
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
  const resumedRef = useRef(false);

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

  // Ensure AudioContext is created and resumed on any user interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }, []);

  // Resume AudioContext on first user interaction (click/touch/keydown)
  useEffect(() => {
    if (resumedRef.current) return;
    const handler = () => {
      ensureAudioContext();
      resumedRef.current = true;
      window.removeEventListener("click", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
    window.addEventListener("click", handler, true);
    window.addEventListener("touchstart", handler, true);
    window.addEventListener("keydown", handler, true);
    return () => {
      window.removeEventListener("click", handler, true);
      window.removeEventListener("touchstart", handler, true);
      window.removeEventListener("keydown", handler, true);
    };
  }, [ensureAudioContext]);

  // Poll for pending orders + realtime
  useEffect(() => {
    if (!isAdmin || !user) return;

    const checkPending = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, status, payment_method, payment_confirmed", { count: "exact", head: false })
        .in("status", ["pending", "paid"]);

      const filtered = (data || []).filter(o => {
        // PIX orders only count as pending after payment is confirmed
        if (o.payment_method === "pix" && !o.payment_confirmed && o.status !== "paid") return false;
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
    const shouldPlay = pendingCount > 0 && isAdmin && isOnAdminRoute;

    if (shouldPlay) {
      const playAlarm = async () => {
        const ctx = ensureAudioContext();
        if (!ctx || ctx.state === "closed") return;
        // Try to resume every tick
        if (ctx.state === "suspended") {
          try { await ctx.resume(); } catch { /* needs user interaction */ }
          if (ctx.state !== "running") return;
        }

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

      void playAlarm();
      alarmIntervalRef.current = setInterval(() => { void playAlarm(); }, 2000);

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
  }, [pendingCount, isAdmin, isOnAdminRoute, ensureAudioContext]);

  return { pendingCount };
}
