import { useEffect, useState } from "react";
import { Clock, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ScheduleDay {
  id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const AdminSchedule = () => {
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchSchedule = async () => {
    const { data } = await supabase
      .from("store_schedule")
      .select("*")
      .order("day_of_week");
    if (data) setSchedule(data as ScheduleDay[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchSchedule();
  }, []);

  const updateDay = (dayOfWeek: number, field: keyof ScheduleDay, value: any) => {
    setSchedule((prev) =>
      prev.map((d) => (d.day_of_week === dayOfWeek ? { ...d, [field]: value } : d))
    );
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const day of schedule) {
        await supabase
          .from("store_schedule")
          .update({
            open_time: day.is_closed ? null : day.open_time,
            close_time: day.is_closed ? null : day.close_time,
            is_closed: day.is_closed,
          } as any)
          .eq("id", day.id);
      }
      toast({ title: "✅ Horários salvos com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar horários", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Clock size={20} className="text-primary" />
            Horários de Funcionamento
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Configure os horários de abertura e fechamento para cada dia da semana.
            O cliente só consegue fazer pedidos dentro do horário configurado.
          </p>
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Save size={16} />
          {saving ? "Salvando..." : "Salvar Horários"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="divide-y divide-border">
          {schedule.map((day) => (
            <div
              key={day.day_of_week}
              className={`flex items-center gap-4 px-4 py-4 transition-colors ${
                day.is_closed ? "bg-muted/50" : ""
              }`}
            >
              {/* Day name */}
              <div className="w-24 shrink-0">
                <span className="text-sm font-bold text-foreground">
                  {DAY_NAMES[day.day_of_week]}
                </span>
                <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                  {DAY_SHORT[day.day_of_week]}
                </span>
              </div>

              {/* Closed toggle */}
              <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={day.is_closed}
                  onChange={(e) => updateDay(day.day_of_week, "is_closed", e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary accent-primary"
                />
                <span className={`text-xs font-medium ${day.is_closed ? "text-destructive" : "text-muted-foreground"}`}>
                  Fechado
                </span>
              </label>

              {/* Time inputs */}
              {!day.is_closed ? (
                <div className="flex items-center gap-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Abre:</span>
                    <input
                      type="time"
                      value={day.open_time || ""}
                      onChange={(e) => updateDay(day.day_of_week, "open_time", e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Fecha:</span>
                    <input
                      type="time"
                      value={day.close_time || ""}
                      onChange={(e) => updateDay(day.day_of_week, "close_time", e.target.value)}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                    />
                  </div>
                </div>
              ) : (
                <div className="flex-1">
                  <span className="rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                    <X size={12} className="inline mr-1" />
                    Não atende neste dia
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">💡 Como funciona</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>O cliente só pode fazer pedidos quando a loja está dentro do horário programado.</li>
          <li>Você pode <strong>fechar mais cedo</strong> ou <strong>abrir antes</strong> usando o botão "LOJA ABERTA/FECHADA" no Dashboard.</li>
          <li>O controle manual (abrir/fechar no Dashboard) tem prioridade sobre o horário programado.</li>
          <li>Marque "Fechado" nos dias em que não houver atendimento.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminSchedule;
