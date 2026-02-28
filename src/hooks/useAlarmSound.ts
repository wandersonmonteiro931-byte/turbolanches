import { useEffect, useRef } from "react";

/**
 * Plays an intermittent alarm beep while `shouldPlay` is true.
 * Stops immediately when `shouldPlay` becomes false.
 */
export function useAlarmSound(shouldPlay: boolean) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (shouldPlay) {
      // Create AudioContext on demand (handles browser autoplay policy)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const playBeep = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        // Resume if suspended (autoplay policy)
        if (ctx.state === "suspended") ctx.resume();

        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        oscillator.connect(gain);
        gain.connect(ctx.destination);

        oscillator.type = "square";
        oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.25);
      };

      // Play immediately, then every 1.5s
      playBeep();
      intervalRef.current = setInterval(playBeep, 1500);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [shouldPlay]);
}
