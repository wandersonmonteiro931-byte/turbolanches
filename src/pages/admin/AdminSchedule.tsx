import TurboLoader from "@/components/TurboLoader";
import { useEffect, useState } from "react";
import { Clock, Save, X, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useStore } from "@/contexts/StoreContext";

interface ScheduleDay {
  id: string;
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}

interface TimeSettings {
  prep_time_minutes: number;
  delivery_time_minutes: number;
  pickup_time_minutes: number;
  store_address_full: string;
}

const DAY_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

const AdminSchedule = () => {
  const { storeId } = useStore();
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [timeSettings, setTimeSettings] = useState<TimeSettings>({
    prep_time_minutes: 25,
    delivery_time_minutes: 30,
    pickup_time_minutes: 20,
    store_address_full: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingTimes, setSavingTimes] = useState(false);
  const { toast } = useToast();

  const fetchData = async () => {
    let scheduleQuery = supabase.from("store_schedule").select("*").order("day_of_week");
    let settingsQuery = supabase.from("store_settings").select("prep_time_minutes, delivery_time_minutes, pickup_time_minutes, store_address_full").limit(1);
    if (storeId) {
      scheduleQuery = scheduleQuery.eq("store_id", storeId);
      settingsQuery = settingsQuery.eq("store_id", storeId);
    }
    const [scheduleRes, settingsRes] = await Promise.all([
      scheduleQuery,
      settingsQuery.single(),
    ]);
    if (scheduleRes.data) setSchedule(scheduleRes.data as ScheduleDay[]);
    if (settingsRes.data) {
      const d = settingsRes.data as any;
      setTimeSettings({
        prep_time_minutes: d.prep_time_minutes || 25,
        delivery_time_minutes: d.delivery_time_minutes || 30,
        pickup_time_minutes: d.pickup_time_minutes || 20,
        store_address_full: d.store_address_full || "",
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [storeId]);

  const updateDay = (dayOfWeek: number, field: keyof ScheduleDay, value: any) => {
    setSchedule((prev) =>
      prev.map((d) => (d.day_of_week === dayOfWeek ? { ...d, [field]: value } : d))
    );
  };

  const saveSchedule = async () => {
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

  const saveTimeSettings = async () => {
    setSavingTimes(true);
    try {
      await supabase
        .from("store_settings")
        .update({
          prep_time_minutes: timeSettings.prep_time_minutes,
          delivery_time_minutes: timeSettings.delivery_time_minutes,
          pickup_time_minutes: timeSettings.pickup_time_minutes,
          store_address_full: timeSettings.store_address_full,
        } as any)
        .eq("id", (await supabase.from("store_settings").select("id").limit(1).single()).data?.id);
      toast({ title: "✅ Tempos e endereço salvos!" });
    } catch {
      toast({ title: "Erro ao salvar tempos", variant: "destructive" });
    } finally {
      setSavingTimes(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <TurboLoader size={120} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Estimates Section */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Timer size={20} className="text-primary" />
              Tempos Estimados & Endereço
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure os tempos que aparecem no checkout e o endereço da loja para retirada.
            </p>
          </div>
          <button
            onClick={saveTimeSettings}
            disabled={savingTimes}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Save size={16} />
            {savingTimes ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tempo de preparo (min)</label>
            <input
              type="number"
              min={1}
              value={timeSettings.prep_time_minutes}
              onChange={(e) => setTimeSettings({ ...timeSettings, prep_time_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tempo de entrega (min)</label>
            <input
              type="number"
              min={1}
              value={timeSettings.delivery_time_minutes}
              onChange={(e) => setTimeSettings({ ...timeSettings, delivery_time_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Tempo retirada (min)</label>
            <input
              type="number"
              min={1}
              value={timeSettings.pickup_time_minutes}
              onChange={(e) => setTimeSettings({ ...timeSettings, pickup_time_minutes: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">Endereço da loja (mostrado na retirada)</label>
          <input
            type="text"
            value={timeSettings.store_address_full}
            onChange={(e) => setTimeSettings({ ...timeSettings, store_address_full: e.target.value })}
            placeholder="Ex: Rua das Flores, 123 - Centro, Cidade - GO"
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Schedule Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Clock size={20} className="text-primary" />
              Horários de Funcionamento
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure os horários de abertura e fechamento para cada dia da semana.
            </p>
          </div>
          <button
            onClick={saveSchedule}
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
                <div className="w-24 shrink-0">
                  <span className="text-sm font-bold text-foreground">
                    {DAY_NAMES[day.day_of_week]}
                  </span>
                  <span className="ml-1 text-[10px] font-semibold text-muted-foreground">
                    {DAY_SHORT[day.day_of_week]}
                  </span>
                </div>

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
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-bold text-foreground mb-2">💡 Como funciona</h3>
        <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
          <li>O cliente só pode fazer pedidos quando a loja está dentro do horário programado.</li>
          <li>Você pode <strong>fechar mais cedo</strong> ou <strong>abrir antes</strong> usando o botão "LOJA ABERTA/FECHADA" no Dashboard.</li>
          <li>O controle manual (abrir/fechar no Dashboard) tem prioridade sobre o horário programado.</li>
          <li>Marque "Fechado" nos dias em que não houver atendimento.</li>
          <li>Os <strong>tempos estimados</strong> são exibidos ao cliente no checkout.</li>
        </ul>
      </div>
    </div>
  );
};

export default AdminSchedule;
