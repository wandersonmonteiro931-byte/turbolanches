import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import {
  Plus,
  Camera,
  Upload,
  MapPin,
  FileText,
  Clock,
  Users,
  Settings as SettingsIcon,
  AlertTriangle,
} from "lucide-react";
import { uploadImage } from "@/lib/uploadImage";
import { loadFaceModels, getFaceDescriptor, descriptorToArray } from "@/lib/faceRecognition";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

type Employee = {
  id: string;
  employee_code: string;
  full_name: string;
  cpf: string;
  phone: string;
  role: string;
  base_salary: number;
  hire_date: string;
  termination_date: string | null;
  photo_url: string;
  face_descriptor: number[] | null;
  active: boolean;
  notes: string;
};

type Schedule = { id?: string; day_of_week: number; start_time: string; end_time: string; active: boolean };
type Punch = {
  id: string;
  employee_id: string;
  punch_type: string;
  punched_at: string;
  business_day: string;
  distance_meters: number | null;
  selfie_url: string;
};
type Settings = {
  id?: string;
  store_lat: number | null;
  store_lng: number | null;
  allowed_radius_meters: number;
  late_tolerance_minutes: number;
  face_match_threshold: number;
  require_face_match: boolean;
  require_geolocation: boolean;
};
type Payslip = {
  id: string;
  employee_id: string;
  reference_month: number;
  reference_year: number;
  gross_amount: number;
  net_amount: number;
  pdf_url: string;
  notes: string;
  created_at: string;
};
type Occurrence = {
  id: string;
  employee_id: string;
  occurrence_type: string;
  occurrence_date: string;
  minutes_delta: number;
  details: string;
  detected_at: string;
};

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const pad2 = (value: number) => String(value).padStart(2, "0");

const toMoney = (value: number) => (Number.isFinite(value) ? value.toFixed(2).replace(".", ",") : "0,00");

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const parseTimeToMinutes = (time: string | null | undefined) => {
  if (!time) return 0;
  const [h, m] = time.slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

const diffScheduleMinutes = (start: string, end: string) => {
  const startMin = parseTimeToMinutes(start);
  let endMin = parseTimeToMinutes(end);
  if (endMin <= startMin) endMin += 24 * 60;
  return Math.max(0, endMin - startMin);
};

const makeBrazilDate = (isoDate: string, hour: number, minute = 0) =>
  new Date(`${isoDate}T${pad2(hour)}:${pad2(minute)}:00-03:00`);

const nextIsoDate = (isoDate: string) => {
  const d = new Date(`${isoDate}T12:00:00-03:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const overlapMinutes = (startA: Date, endA: Date, startB: Date, endB: Date) => {
  const start = Math.max(startA.getTime(), startB.getTime());
  const end = Math.min(endA.getTime(), endB.getTime());
  return Math.max(0, Math.round((end - start) / 60000));
};

export default function AdminEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [settings, setSettings] = useState<Settings>({
    store_lat: null,
    store_lng: null,
    allowed_radius_meters: 100,
    late_tolerance_minutes: 10,
    face_match_threshold: 0.55,
    require_face_match: true,
    require_geolocation: true,
  });
  const [loading, setLoading] = useState(true);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [showEmployeeDialog, setShowEmployeeDialog] = useState(false);
  const [showFaceDialog, setShowFaceDialog] = useState<Employee | null>(null);
  const [showScheduleDialog, setShowScheduleDialog] = useState<Employee | null>(null);
  const [scheduleData, setScheduleData] = useState<Schedule[]>([]);
  const [showPayslipDialog, setShowPayslipDialog] = useState(false);
  const [calculatingPayslip, setCalculatingPayslip] = useState(false);
  const [payslipCalcDetails, setPayslipCalcDetails] = useState("");
  const [payslipForm, setPayslipForm] = useState({
    employee_id: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    gross: 0,
    net: 0,
    notes: "",
    file: null as File | null,
  });

  const loadAll = async () => {
    setLoading(true);
    const [{ data: emps }, { data: pun }, { data: pay }, { data: occ }, { data: set }] = await Promise.all([
      supabase.from("employees").select("*").order("full_name"),
      supabase.from("time_clock_punches").select("*").order("punched_at", { ascending: false }).limit(500),
      supabase.from("payslips").select("*").order("created_at", { ascending: false }),
      supabase.from("time_clock_occurrences").select("*").order("occurrence_date", { ascending: false }).limit(200),
      supabase.from("time_clock_settings").select("*").maybeSingle(),
    ]);
    setEmployees((emps as any) || []);
    setPunches((pun as any) || []);
    setPayslips((pay as any) || []);
    setOccurrences((occ as any) || []);
    if (set) setSettings(set as any);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openNew = () => {
    setEditingEmployee({
      id: "",
      employee_code: "",
      full_name: "",
      cpf: "",
      phone: "",
      role: "",
      base_salary: 0,
      hire_date: new Date().toISOString().slice(0, 10),
      termination_date: null,
      photo_url: "",
      face_descriptor: null,
      active: true,
      notes: "",
    });
    setShowEmployeeDialog(true);
  };

  const saveEmployee = async () => {
    if (!editingEmployee) return;
    if (!editingEmployee.full_name.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    const payload: any = {
      full_name: editingEmployee.full_name,
      cpf: editingEmployee.cpf,
      phone: editingEmployee.phone,
      role: editingEmployee.role,
      base_salary: editingEmployee.base_salary,
      hire_date: editingEmployee.hire_date,
      termination_date: editingEmployee.termination_date,
      photo_url: editingEmployee.photo_url,
      active: editingEmployee.active,
      notes: editingEmployee.notes,
    };
    if (editingEmployee.id) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editingEmployee.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("employees").insert(payload);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Funcionário salvo");
    setShowEmployeeDialog(false);
    setEditingEmployee(null);
    loadAll();
  };

  const handlePhotoUpload = async (file: File) => {
    if (!editingEmployee) return;
    const url = await uploadImage(file, "employees");
    if (url) setEditingEmployee({ ...editingEmployee, photo_url: url });
  };

  const openSchedule = async (emp: Employee) => {
    setShowScheduleDialog(emp);
    const { data } = await supabase.from("employee_schedules").select("*").eq("employee_id", emp.id);
    const existing = (data as any) || [];
    const all: Schedule[] = DAYS.map((_, i) => {
      const s = existing.find((x: any) => x.day_of_week === i);
      return s
        ? {
            id: s.id,
            day_of_week: i,
            start_time: s.start_time?.slice(0, 5),
            end_time: s.end_time?.slice(0, 5),
            active: s.active,
          }
        : { day_of_week: i, start_time: "08:00", end_time: "17:00", active: false };
    });
    setScheduleData(all);
  };

  const saveSchedule = async () => {
    if (!showScheduleDialog) return;
    const emp = showScheduleDialog;
    for (const s of scheduleData) {
      if (s.active) {
        if (s.id) {
          await supabase
            .from("employee_schedules")
            .update({ start_time: s.start_time, end_time: s.end_time, active: true })
            .eq("id", s.id);
        } else {
          await supabase
            .from("employee_schedules")
            .insert({
              employee_id: emp.id,
              day_of_week: s.day_of_week,
              start_time: s.start_time,
              end_time: s.end_time,
              active: true,
            });
        }
      } else if (s.id) {
        await supabase.from("employee_schedules").update({ active: false }).eq("id", s.id);
      }
    }
    toast.success("Escala salva");
    setShowScheduleDialog(null);
  };

  const saveSettings = async () => {
    const payload: any = { ...settings };
    delete payload.id;
    if (settings.id) {
      const { error } = await supabase.from("time_clock_settings").update(payload).eq("id", settings.id);
      if (error) {
        toast.error(error.message);
        return;
      }
    } else {
      const { data, error } = await supabase.from("time_clock_settings").insert(payload).select().single();
      if (error) {
        toast.error(error.message);
        return;
      }
      setSettings(data as any);
    }
    toast.success("Configurações salvas");
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização indisponível");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setSettings((s) => ({ ...s, store_lat: pos.coords.latitude, store_lng: pos.coords.longitude }));
        toast.success("Localização capturada");
      },
      () => toast.error("Não foi possível obter localização"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const calculatePayslipAutomatic = async () => {
    if (!payslipForm.employee_id) {
      toast.error("Selecione o funcionário para recalcular.");
      return;
    }

    const employee = employees.find((item) => item.id === payslipForm.employee_id);
    if (!employee) {
      toast.error("Funcionário não encontrado.");
      return;
    }

    if (!employee.base_salary || employee.base_salary <= 0) {
      toast.error("Cadastre o salário base do funcionário antes de recalcular.");
      return;
    }

    setCalculatingPayslip(true);

    try {
      const year = Number(payslipForm.year);
      const month = Number(payslipForm.month);
      const firstDay = `${year}-${pad2(month)}-01`;
      const lastDayNumber = new Date(year, month, 0).getDate();
      const lastDay = `${year}-${pad2(month)}-${pad2(lastDayNumber)}`;

      const [{ data: punchRows, error: punchError }, { data: scheduleRows, error: scheduleError }] = await Promise.all([
        (supabase as any)
          .from("time_clock_punches")
          .select("id, employee_id, punch_type, punched_at, business_day")
          .eq("employee_id", employee.id)
          .gte("business_day", firstDay)
          .lte("business_day", lastDay)
          .order("punched_at", { ascending: true }),
        (supabase as any)
          .from("employee_schedules")
          .select("day_of_week, start_time, end_time, active")
          .eq("employee_id", employee.id)
          .eq("active", true),
      ]);

      if (punchError) throw punchError;
      if (scheduleError) throw scheduleError;

      const punchesByDay = new Map<string, any[]>();
      (punchRows || []).forEach((punch: any) => {
        const day = String(punch.business_day);
        if (!punchesByDay.has(day)) punchesByDay.set(day, []);
        punchesByDay.get(day)!.push(punch);
      });

      const scheduleByWeekday = new Map<number, any>();
      (scheduleRows || []).forEach((schedule: any) => {
        scheduleByWeekday.set(Number(schedule.day_of_week), schedule);
      });

      let workedMinutes = 0;
      let nightMinutes = 0;
      let overtimeMinutes = 0;
      let workedScheduleDays = 0;
      let restDays = 0;
      let daysWithNight = 0;

      for (let dayNumber = 1; dayNumber <= lastDayNumber; dayNumber++) {
        const isoDay = `${year}-${pad2(month)}-${pad2(dayNumber)}`;
        const jsDay = new Date(`${isoDay}T12:00:00-03:00`).getDay();
        const schedule = scheduleByWeekday.get(jsDay);

        if (schedule) workedScheduleDays += 1;
        else restDays += 1;

        const dayPunches = (punchesByDay.get(isoDay) || []).sort(
          (a, b) => new Date(a.punched_at).getTime() - new Date(b.punched_at).getTime(),
        );

        let dayWorked = 0;
        let dayNight = 0;
        let openIn: any | null = null;

        for (const punch of dayPunches) {
          if (punch.punch_type === "in") {
            openIn = punch;
            continue;
          }

          if (punch.punch_type === "out" && openIn) {
            const start = new Date(openIn.punched_at);
            const end = new Date(punch.punched_at);

            if (end.getTime() > start.getTime()) {
              const intervalMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
              dayWorked += intervalMinutes;

              const nightStart = makeBrazilDate(isoDay, 22, 0);
              const nightEnd = makeBrazilDate(nextIsoDate(isoDay), 5, 0);
              dayNight += overlapMinutes(start, end, nightStart, nightEnd);
            }

            openIn = null;
          }
        }

        if (dayNight > 0) daysWithNight += 1;
        workedMinutes += dayWorked;
        nightMinutes += dayNight;

        if (schedule && dayWorked > 0) {
          const scheduledMinutes = diffScheduleMinutes(String(schedule.start_time), String(schedule.end_time));
          overtimeMinutes += Math.max(0, dayWorked - scheduledMinutes);
        }
      }

      const hourlyRate = employee.base_salary / 220;
      const overtimeValue = roundMoney((overtimeMinutes / 60) * hourlyRate * 1.5);
      const nightAdditionalValue = roundMoney((nightMinutes / 60) * hourlyRate * 0.2);
      const dsrOvertimeValue = roundMoney(workedScheduleDays > 0 ? overtimeValue * (restDays / workedScheduleDays) : 0);
      const grossAmount = roundMoney(employee.base_salary + overtimeValue + nightAdditionalValue + dsrOvertimeValue);

      const details = [
        "Cálculo automático do holerite:",
        `Salário base: R$ ${toMoney(employee.base_salary)}`,
        `Horas trabalhadas no mês: ${Math.floor(workedMinutes / 60)}h${pad2(workedMinutes % 60)}`,
        `Horas extras apuradas: ${Math.floor(overtimeMinutes / 60)}h${pad2(overtimeMinutes % 60)} = R$ ${toMoney(overtimeValue)}`,
        `Adicional noturno 22h às 05h: ${Math.floor(nightMinutes / 60)}h${pad2(nightMinutes % 60)} em ${daysWithNight} dia(s) = R$ ${toMoney(nightAdditionalValue)}`,
        `DSR sobre horas extras: R$ ${toMoney(dsrOvertimeValue)} (${restDays} DSR/folga(s) ÷ ${workedScheduleDays} dia(s) programado(s))`,
        "Observação: cálculo estimado sem descontos automáticos de INSS/IRRF/adiantamentos. Conferir regras da empresa/contador antes de enviar o holerite final.",
      ].join("\n");

      setPayslipForm((form) => ({
        ...form,
        gross: grossAmount,
        net: form.net && form.net > 0 ? form.net : grossAmount,
        notes: details,
      }));
      setPayslipCalcDetails(details);
      toast.success("Holerite recalculado com adicional noturno e DSR sobre horas extras.");
    } catch (error) {
      console.error("[payslip] erro ao recalcular", error);
      toast.error(error instanceof Error ? error.message : "Erro ao recalcular holerite.");
    } finally {
      setCalculatingPayslip(false);
    }
  };

  const uploadPayslip = async () => {
    if (!payslipForm.employee_id || !payslipForm.file) {
      toast.error("Selecione funcionário e arquivo");
      return;
    }
    const path = `${payslipForm.employee_id}/${payslipForm.year}-${String(payslipForm.month).padStart(2, "0")}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("payslips")
      .upload(path, payslipForm.file, { contentType: "application/pdf" });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("payslips").insert({
      employee_id: payslipForm.employee_id,
      reference_month: payslipForm.month,
      reference_year: payslipForm.year,
      gross_amount: payslipForm.gross,
      net_amount: payslipForm.net,
      pdf_url: path,
      notes: payslipForm.notes,
      uploaded_by: user!.id,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Holerite enviado");
    setShowPayslipDialog(false);
    setPayslipCalcDetails("");
    setPayslipForm({
      employee_id: "",
      month: new Date().getMonth() + 1,
      year: new Date().getFullYear(),
      gross: 0,
      net: 0,
      notes: "",
      file: null,
    });
    loadAll();
  };

  if (loading) return <div className="p-6">Carregando...</div>;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="employees">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-1">
          <TabsTrigger value="employees">
            <Users size={14} className="mr-1" />
            Funcionários
          </TabsTrigger>
          <TabsTrigger value="punches">
            <Clock size={14} className="mr-1" />
            Histórico
          </TabsTrigger>
          <TabsTrigger value="occurrences">
            <AlertTriangle size={14} className="mr-1" />
            Ocorrências
          </TabsTrigger>
          <TabsTrigger value="payslips">
            <FileText size={14} className="mr-1" />
            Holerites
          </TabsTrigger>
          <TabsTrigger value="settings">
            <SettingsIcon size={14} className="mr-1" />
            Config
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-3">
          <Button onClick={openNew}>
            <Plus size={16} className="mr-1" />
            Novo funcionário
          </Button>
          <div className="grid gap-2">
            {employees.map((e) => (
              <Card key={e.id} className="p-3 flex items-center gap-3">
                {e.photo_url ? (
                  <img src={e.photo_url} alt={e.full_name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{e.employee_code}</span>
                    <span className="truncate">{e.full_name}</span>
                    {!e.active && <span className="text-xs text-destructive">INATIVO</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {e.role || "—"} · Admissão {formatDateTimeBR(e.hire_date, { dateStyle: "short" })}
                  </div>
                  <div className="text-xs">{e.face_descriptor ? "✅ Face cadastrada" : "⚠️ Face não cadastrada"}</div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingEmployee(e);
                      setShowEmployeeDialog(true);
                    }}
                  >
                    Editar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setShowFaceDialog(e)}>
                    <Camera size={14} className="mr-1" />
                    Face
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openSchedule(e)}>
                    Escala
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="punches" className="space-y-2">
          <p className="text-xs text-muted-foreground">Registros imutáveis. Não é possível apagar.</p>
          {punches.map((p) => {
            const emp = employees.find((e) => e.id === p.employee_id);
            return (
              <Card key={p.id} className="p-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-bold">{emp?.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatDateTimeBR(p.punched_at)} · {p.punch_type === "in" ? "ENTRADA" : "SAÍDA"}
                    {p.distance_meters != null && ` · ${Math.round(p.distance_meters)}m`}
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="occurrences" className="space-y-2">
          {occurrences.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma ocorrência registrada.</p>}
          {occurrences.map((o) => {
            const emp = employees.find((e) => e.id === o.employee_id);
            return (
              <Card key={o.id} className="p-3 text-sm">
                <div className="font-bold">
                  {emp?.full_name} · {o.occurrence_type}
                </div>
                <div className="text-xs text-muted-foreground">
                  {o.occurrence_date} · {o.details}
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="payslips" className="space-y-3">
          <Button
            onClick={() => {
              setPayslipCalcDetails("");
              setShowPayslipDialog(true);
            }}
          >
            <Upload size={16} className="mr-1" />
            Enviar/Recalcular holerite
          </Button>
          {payslips.map((p) => {
            const emp = employees.find((e) => e.id === p.employee_id);
            return (
              <Card key={p.id} className="p-3 text-sm flex items-center justify-between">
                <div>
                  <div className="font-bold">{emp?.full_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {String(p.reference_month).padStart(2, "0")}/{p.reference_year} · Líquido R${" "}
                    {p.net_amount.toFixed(2)}
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="settings" className="space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Button onClick={useCurrentLocation} variant="outline">
                <MapPin size={14} className="mr-1" />
                Capturar localização atual
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Latitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={settings.store_lat ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, store_lat: e.target.value ? Number(e.target.value) : null }))
                  }
                />
              </div>
              <div>
                <Label>Longitude</Label>
                <Input
                  type="number"
                  step="any"
                  value={settings.store_lng ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, store_lng: e.target.value ? Number(e.target.value) : null }))
                  }
                />
              </div>
              <div>
                <Label>Raio permitido (m)</Label>
                <Input
                  type="number"
                  value={settings.allowed_radius_meters}
                  onChange={(e) => setSettings((s) => ({ ...s, allowed_radius_meters: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Tolerância atraso (min)</Label>
                <Input
                  type="number"
                  value={settings.late_tolerance_minutes}
                  onChange={(e) => setSettings((s) => ({ ...s, late_tolerance_minutes: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Limite face match (0-1)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={settings.face_match_threshold}
                  onChange={(e) => setSettings((s) => ({ ...s, face_match_threshold: Number(e.target.value) }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.require_face_match}
                  onChange={(e) => setSettings((s) => ({ ...s, require_face_match: e.target.checked }))}
                />
                Exigir face
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.require_geolocation}
                  onChange={(e) => setSettings((s) => ({ ...s, require_geolocation: e.target.checked }))}
                />
                Exigir GPS
              </label>
            </div>
            <Button onClick={saveSettings}>Salvar configurações</Button>
            <p className="text-xs text-muted-foreground">
              URL do portal do funcionário: <code>/funcionario</code>
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee dialog */}
      <Dialog
        open={showEmployeeDialog}
        onOpenChange={(o) => {
          if (!o) {
            setShowEmployeeDialog(false);
            setEditingEmployee(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEmployee?.id ? "Editar" : "Novo"} funcionário</DialogTitle>
          </DialogHeader>
          {editingEmployee && (
            <div className="space-y-3">
              {editingEmployee.id && (
                <p className="text-xs text-muted-foreground">
                  Código: <strong>{editingEmployee.employee_code}</strong>
                </p>
              )}
              <div>
                <Label>Nome completo</Label>
                <Input
                  value={editingEmployee.full_name}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={editingEmployee.cpf}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, cpf: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={editingEmployee.phone}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input
                    value={editingEmployee.role}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Salário base</Label>
                  <Input
                    type="number"
                    value={editingEmployee.base_salary}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, base_salary: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Admissão</Label>
                  <Input
                    type="date"
                    value={editingEmployee.hire_date}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, hire_date: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Demissão</Label>
                  <Input
                    type="date"
                    value={editingEmployee.termination_date || ""}
                    onChange={(e) =>
                      setEditingEmployee({ ...editingEmployee, termination_date: e.target.value || null })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Foto</Label>
                <div className="flex items-center gap-3">
                  {editingEmployee.photo_url && (
                    <img src={editingEmployee.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                  )}
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files && handlePhotoUpload(e.target.files[0])}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingEmployee.active}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, active: e.target.checked })}
                />
                Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button onClick={saveEmployee}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Face capture dialog */}
      {showFaceDialog && (
        <FaceCaptureDialog
          employee={showFaceDialog}
          onClose={() => {
            setShowFaceDialog(null);
            loadAll();
          }}
        />
      )}

      {/* Schedule dialog */}
      <Dialog open={!!showScheduleDialog} onOpenChange={(o) => !o && setShowScheduleDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escala — {showScheduleDialog?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {scheduleData.map((s, i) => (
              <div key={s.day_of_week} className="flex items-center gap-2">
                <label className="flex items-center gap-1 w-20">
                  <input
                    type="checkbox"
                    checked={s.active}
                    onChange={(e) => {
                      const n = [...scheduleData];
                      n[i].active = e.target.checked;
                      setScheduleData(n);
                    }}
                  />
                  {DAYS[s.day_of_week]}
                </label>
                <Input
                  type="time"
                  value={s.start_time}
                  disabled={!s.active}
                  onChange={(e) => {
                    const n = [...scheduleData];
                    n[i].start_time = e.target.value;
                    setScheduleData(n);
                  }}
                />
                <Input
                  type="time"
                  value={s.end_time}
                  disabled={!s.active}
                  onChange={(e) => {
                    const n = [...scheduleData];
                    n[i].end_time = e.target.value;
                    setScheduleData(n);
                  }}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={saveSchedule}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payslip upload */}
      <Dialog open={showPayslipDialog} onOpenChange={setShowPayslipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar holerite</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Funcionário</Label>
              <select
                className="w-full rounded-md border p-2"
                value={payslipForm.employee_id}
                onChange={(e) => setPayslipForm({ ...payslipForm, employee_id: e.target.value })}
              >
                <option value="">Selecione...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Mês</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={payslipForm.month}
                  onChange={(e) => setPayslipForm({ ...payslipForm, month: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Ano</Label>
                <Input
                  type="number"
                  value={payslipForm.year}
                  onChange={(e) => setPayslipForm({ ...payslipForm, year: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Bruto</Label>
                <Input
                  type="number"
                  value={payslipForm.gross}
                  onChange={(e) => setPayslipForm({ ...payslipForm, gross: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Líquido</Label>
                <Input
                  type="number"
                  value={payslipForm.net}
                  onChange={(e) => setPayslipForm({ ...payslipForm, net: Number(e.target.value) })}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={calculatePayslipAutomatic}
              disabled={calculatingPayslip || !payslipForm.employee_id}
            >
              {calculatingPayslip ? "Recalculando..." : "Recalcular automático: adicional noturno + DSR HE"}
            </Button>
            {payslipCalcDetails && (
              <pre className="max-h-56 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
                {payslipCalcDetails}
              </pre>
            )}
            <div>
              <Label>Observações</Label>
              <Input
                value={payslipForm.notes}
                onChange={(e) => {
                  setPayslipCalcDetails(e.target.value);
                  setPayslipForm({ ...payslipForm, notes: e.target.value });
                }}
              />
            </div>
            <div>
              <Label>PDF</Label>
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => setPayslipForm({ ...payslipForm, file: e.target.files?.[0] || null })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={uploadPayslip}>Enviar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FaceCaptureDialog({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Carregando modelos...");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        await loadFaceModels();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
          setStatus("Posicione o rosto e clique em capturar");
        }
      } catch (e) {
        setStatus("Erro ao acessar câmera");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = async () => {
    if (!videoRef.current) return;
    setStatus("Detectando rosto...");
    const desc = await getFaceDescriptor(videoRef.current);
    if (!desc) {
      setStatus("Rosto não detectado. Tente novamente.");
      return;
    }
    const { error } = await supabase
      .from("employees")
      .update({ face_descriptor: descriptorToArray(desc) })
      .eq("id", employee.id);
    if (error) {
      setStatus("Erro: " + error.message);
      return;
    }
    toast.success("Face cadastrada");
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cadastrar face — {employee.full_name}</DialogTitle>
        </DialogHeader>
        <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black" />
        <p className="text-sm text-muted-foreground">{status}</p>
        <DialogFooter>
          <Button onClick={capture} disabled={!ready}>
            Capturar e salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
