import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ScheduleDay {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const formatTime = (time: string | null) => {
  if (!time) return "--:--";
  return time.slice(0, 5);
};

const StoreHours = () => {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    supabase
      .from("store_schedule")
      .select("day_of_week, open_time, close_time, is_closed")
      .order("day_of_week")
      .then(({ data }) => {
        if (data) setSchedule(data as ScheduleDay[]);
      });
  }, []);

  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })).getDay();

  if (schedule.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
      >
        <Clock size={12} />
        Horários
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-card p-5 space-y-3 animate-in slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <Clock size={18} className="text-primary" />
                Horários de Atendimento
              </h3>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-muted">
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>

            <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
              {schedule.map((day) => {
                const isToday = day.day_of_week === today;
                return (
                  <div
                    key={day.day_of_week}
                    className={`flex items-center justify-between px-4 py-2.5 ${
                      isToday ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className={`text-sm font-medium ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                      {DAY_SHORT[day.day_of_week]}
                      {isToday && <span className="ml-1 text-[10px] text-primary">(hoje)</span>}
                    </span>
                    {day.is_closed ? (
                      <span className="text-xs font-semibold text-destructive">Fechado</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        {formatTime(day.open_time)} - {formatTime(day.close_time)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Horários sujeitos a alteração. A loja pode fechar mais cedo.
            </p>
          </div>
        </div>
      )}
    </>
  );
};

export default StoreHours;
