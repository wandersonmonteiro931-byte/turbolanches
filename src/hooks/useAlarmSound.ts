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

      const playIfoodAlarm = () => {
        const ctx = audioCtxRef.current;
        if (!ctx) return;
        if (ctx.state === "suspended") ctx.resume();

        const t = ctx.currentTime;

        // iFood-style: two-tone rapid beeps (high-low-high-low)
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

      // Play immediately, then every 2.5s
      playIfoodAlarm();
      intervalRef.current = setInterval(playIfoodAlarm, 2500);
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
