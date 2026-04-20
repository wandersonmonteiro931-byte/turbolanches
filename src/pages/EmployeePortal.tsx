import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { loadFaceModels, getFaceDescriptor, euclideanDistance, arrayToDescriptor } from "@/lib/faceRecognition";
import { Camera, MapPin, LogIn, LogOut, FileText, History, ArrowLeft } from "lucide-react";
import { formatDateTimeBR } from "@/lib/brasiliaTime";

type Employee = {
  id: string; store_id: string; full_name: string; employee_code: string;
  photo_url: string; role: string; face_descriptor: number[] | null;
};
type Settings = {
  store_lat: number | null; store_lng: number | null; allowed_radius_meters: number;
  require_face_match: boolean; require_geolocation: boolean; face_match_threshold: number;
};

export default function EmployeePortal() {
  const [code, setCode] = useState("");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"home" | "history" | "punch">("home");
  const [history, setHistory] = useState<{ punches: any[]; payslips: any[] }>({ punches: [], payslips: [] });
  const [punchType, setPunchType] = useState<"in" | "out">("in");

  useEffect(() => {
    const saved = sessionStorage.getItem("employee_code");
    if (saved) { setCode(saved); login(saved); }
  }, []);

  const login = async (overrideCode?: string) => {
    const c = (overrideCode || code).toUpperCase().trim();
    if (!c) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("employee-portal", { body: { action: "auth", employee_code: c } });
    setLoading(false);
    if (error || data?.error) { toast.error(data?.error || "Falha ao entrar"); return; }
    setEmployee(data.employee);
    setSettings(data.settings);
    sessionStorage.setItem("employee_code", c);
    loadHistory(c);
  };

  const loadHistory = async (c?: string) => {
    const ec = c || employee?.employee_code;
    if (!ec) return;
    const { data } = await supabase.functions.invoke("employee-portal", { body: { action: "history", employee_code: ec } });
    if (data) setHistory({ punches: data.punches || [], payslips: data.payslips || [] });
  };

  const logout = () => {
    sessionStorage.removeItem("employee_code");
    setEmployee(null); setSettings(null); setView("home");
  };

  const downloadPayslip = async (id: string) => {
    if (!employee) return;
    const { data } = await supabase.functions.invoke("employee-portal", {
      body: { action: "payslip_url", employee_code: employee.employee_code, payload: { payslip_id: id } },
    });
    if (data?.url) window.open(data.url, "_blank");
  };

  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm p-6 space-y-4">
          <h1 className="text-xl font-bold text-center">Portal do Funcionário</h1>
          <div>
            <label className="text-sm">Seu código (ex: F0001)</label>
            <Input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && login()} placeholder="F0001" className="text-center text-lg uppercase" />
          </div>
          <Button onClick={() => login()} disabled={loading} className="w-full">Entrar</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <Card className="p-4 flex items-center gap-3">
          {employee.photo_url ? <img src={employee.photo_url} className="h-14 w-14 rounded-full object-cover" /> : <div className="h-14 w-14 rounded-full bg-muted" />}
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{employee.full_name}</div>
            <div className="text-xs text-muted-foreground">{employee.employee_code} · {employee.role || "—"}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={logout}>Sair</Button>
        </Card>

        {view === "home" && (
          <div className="grid grid-cols-2 gap-3">
            <Button className="h-24 flex-col" onClick={() => { setPunchType("in"); setView("punch"); }}><LogIn size={28} />ENTRADA</Button>
            <Button className="h-24 flex-col" variant="secondary" onClick={() => { setPunchType("out"); setView("punch"); }}><LogOut size={28} />SAÍDA</Button>
            <Button className="h-20 flex-col" variant="outline" onClick={() => setView("history")}><History size={20} />Meu histórico</Button>
            <Button className="h-20 flex-col" variant="outline" onClick={() => { loadHistory(); setView("history"); }}><FileText size={20} />Holerites</Button>
          </div>
        )}

        {view === "punch" && (
          <PunchScreen
            employee={employee} settings={settings!} type={punchType}
            onDone={() => { setView("home"); loadHistory(); }}
            onCancel={() => setView("home")}
          />
        )}

        {view === "history" && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setView("home")}><ArrowLeft size={16} /></Button>
              <h2 className="font-bold">Histórico</h2>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2">Pontos recentes</h3>
              {history.punches.length === 0 && <p className="text-xs text-muted-foreground">Nenhum registro.</p>}
              {history.punches.map(p => (
                <div key={p.id} className="text-sm py-1 border-b last:border-0">
                  {formatDateTimeBR(p.punched_at)} · <strong>{p.punch_type === "in" ? "ENTRADA" : "SAÍDA"}</strong>
                </div>
              ))}
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 mt-3">Holerites</h3>
              {history.payslips.length === 0 && <p className="text-xs text-muted-foreground">Nenhum holerite.</p>}
              {history.payslips.map(p => (
                <div key={p.id} className="flex items-center justify-between py-1 border-b last:border-0">
                  <div className="text-sm">{String(p.reference_month).padStart(2, "0")}/{p.reference_year} · R$ {Number(p.net_amount).toFixed(2)}</div>
                  <Button size="sm" variant="outline" onClick={() => downloadPayslip(p.id)}>Baixar</Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function PunchScreen({ employee, settings, type, onDone, onCancel }: {
  employee: Employee; settings: Settings; type: "in" | "out"; onDone: () => void; onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Iniciando câmera...");
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        if (settings.require_face_match) {
          setStatus("Carregando reconhecimento facial...");
          await loadFaceModels();
        }
        setStatus("Iniciando câmera...");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
          setStatus("Pronto. Clique em registrar.");
        }
      } catch {
        setStatus("Erro ao acessar câmera");
      }
    })();
    return () => { stream?.getTracks().forEach(t => t.stop()); };
  }, [settings]);

  const captureSelfie = (): string | null => {
    if (!videoRef.current) return null;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let lat: number | undefined, lng: number | undefined;
      if (settings.require_geolocation) {
        setStatus("Obtendo localização...");
        const pos = await new Promise<GeolocationPosition>((res, rej) => {
          navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 15000 });
        }).catch(() => null);
        if (!pos) { setStatus("Não foi possível obter sua localização"); setSubmitting(false); return; }
        lat = pos.coords.latitude; lng = pos.coords.longitude;
      }

      let face_match_score: number | undefined;
      if (settings.require_face_match) {
        if (!employee.face_descriptor) { setStatus("Cadastro facial pendente — avise o admin"); setSubmitting(false); return; }
        setStatus("Reconhecendo rosto...");
        const desc = await getFaceDescriptor(videoRef.current!);
        if (!desc) { setStatus("Rosto não detectado, tente novamente"); setSubmitting(false); return; }
        face_match_score = euclideanDistance(desc, arrayToDescriptor(employee.face_descriptor));
      }

      const selfie = captureSelfie();
      setStatus("Registrando ponto...");
      const { data, error } = await supabase.functions.invoke("employee-clock-in", {
        body: {
          employee_code: employee.employee_code, punch_type: type,
          lat, lng, selfie_base64: selfie, face_match_score,
          device_info: navigator.userAgent.slice(0, 200),
        },
      });
      if (error || data?.error) { toast.error(data?.error || "Falha ao registrar"); setSubmitting(false); setStatus("Tente novamente"); return; }
      toast.success(`${type === "in" ? "Entrada" : "Saída"} registrada!`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro");
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}><ArrowLeft size={16} /></Button>
        <h2 className="font-bold">{type === "in" ? "Registrar ENTRADA" : "Registrar SAÍDA"}</h2>
      </div>
      <video ref={videoRef} autoPlay playsInline muted className="w-full rounded-lg bg-black aspect-square object-cover" />
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {settings.require_geolocation && <span className="flex items-center gap-1"><MapPin size={14} />GPS exigido</span>}
        {settings.require_face_match && <span className="flex items-center gap-1"><Camera size={14} />Face exigida</span>}
      </div>
      <p className="text-sm text-center">{status}</p>
      <Button onClick={submit} disabled={!ready || submitting} className="w-full h-14 text-lg">
        {submitting ? "Processando..." : "REGISTRAR PONTO"}
      </Button>
    </Card>
  );
}
