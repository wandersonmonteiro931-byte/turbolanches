import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import {
  nowBrasilia,
  formatClockBR,
  formatFullDateBR,
  isClockSynced,
  syncBrasiliaClock,
} from "@/lib/brasiliaTime";
import { cn } from "@/lib/utils";

/**
 * Live clock showing the official Brasília time (synced with an
 * authoritative server source on mount, NOT the local PC clock).
 * Updates every second.
 */
export function BrasiliaClock({ className }: { className?: string }) {
  const [now, setNow] = useState<Date>(() => nowBrasilia());
  const [synced, setSynced] = useState<boolean>(isClockSynced());

  useEffect(() => {
    // Force a fresh sync when the component mounts (page reload)
    syncBrasiliaClock().then(() => setSynced(isClockSynced()));

    const id = setInterval(() => {
      setNow(nowBrasilia());
      if (!synced && isClockSynced()) setSynced(true);
    }, 1000);
    return () => clearInterval(id);
  }, [synced]);

  return (
    <div
      className={cn(
        "group inline-flex items-center gap-3 rounded-xl bg-card px-3.5 py-2 shadow-sm transition-colors",
        className,
      )}
      title={synced ? "Horário oficial (sincronizado)" : "Sincronizando horário oficial..."}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Clock size={16} className={cn("text-primary", !synced && "animate-pulse")} />
      </span>
      <div className="flex flex-col leading-none">
        <span className="font-mono text-base font-bold tabular-nums tracking-tight text-foreground">
          {formatClockBR(now)}
        </span>
        <span className="mt-1 text-[10px] font-medium text-muted-foreground tabular-nums">
          {formatFullDateBR(now)}
        </span>
      </div>
    </div>
  );
}

