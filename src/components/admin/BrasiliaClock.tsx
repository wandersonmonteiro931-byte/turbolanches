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
        "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium",
        className,
      )}
      title={synced ? "Horário oficial de Brasília (sincronizado)" : "Sincronizando horário oficial..."}
    >
      <Clock size={16} className={cn("text-primary", !synced && "animate-pulse")} />
      <div className="flex flex-col leading-tight">
        <span className="font-mono font-bold tabular-nums">{formatClockBR(now)}</span>
        <span className="text-[10px] text-muted-foreground">
          {formatFullDateBR(now)} · Brasília
        </span>
      </div>
    </div>
  );
}
