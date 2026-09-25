import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardBody, CardHeader, Button } from "@nextui-org/react";
import { ShieldAlert, Mail, Phone, RefreshCw } from "lucide-react";
import { DoctorService } from "../services/OfflineServices";
import { storageService } from "../services/StorageServiceFallback";
import { sendHeartbeat } from "../services/HeartbeatService";

const SUPPORT_EMAIL = "pablobertot@gmail.com";
const SUPPORT_PHONE = "+39 3938001284";
const BLOCKED_STORAGE_KEY = "blocked_users";

export default function Blocked() {
  const navigate = useNavigate();
  const [updating, setUpdating] = useState(false);
  const [reason, setReason] = useState<string | null>(null);

  const handleAggiorna = async () => {
    try {
      setUpdating(true);
      const doctor = await DoctorService.getDoctor();
      const id = doctor?.id?.trim();
      if (!id) return;

      if (doctor) {
        const { blocked, reason } = await sendHeartbeat(doctor, "corioli-cardiologia");
        if (blocked === false) {
          const payload = {
            blocked: false,
            checkedAt: new Date().toISOString(),
          };
          await storageService.setPreference(
            BLOCKED_STORAGE_KEY,
            JSON.stringify(payload),
          );
          navigate("/", { replace: true });
        } else if (blocked === true) {
          setReason(reason ?? null);
        } else {
          const raw = await storageService.getPreference(BLOCKED_STORAGE_KEY);
          if (raw) {
            const data = JSON.parse(raw) as { reason?: string | null };
            setReason(data.reason ?? null);
          }
        }
      }
    } catch (e) {
      console.error("Blocked handleAggiorna:", e);
    } finally {
      setUpdating(false);
    }
  };

  const getStatus = async () => {
    try {
      const raw = await storageService.getPreference(BLOCKED_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as {
          blocked?: boolean;
          reason?: string | null;
        };
        setReason(data.reason ?? null);
      } else {
        setReason(null);
      }
    } catch (parseError) {
      console.error("Errore lettura stato bloccato da storage:", parseError);
      setReason(null);
    }
  };

  useEffect(() => {
    getStatus();
  }, []);

  return (
    <div className="min-h-finestra flex items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-900/20 via-transparent to-transparent" />
      <Card className="relative w-full max-w-lg shadow-2xl border border-amber-500/30 bg-slate-800/90 backdrop-blur-sm">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <div className="flex justify-center">
            <div className="rounded-full bg-amber-500/20 p-4">
              <ShieldAlert className="w-14 h-14 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-center text-white">
            Account temporaneamente sospeso
          </h1>
          <p className="text-center text-slate-300 text-sm">
            L&apos;accesso a Corioli Cardiologia è stato disattivato. <br />
            {reason && (
              <p className="text-slate-300 text-sm">Motivo: {reason}</p>
            )}
          </p>
        </CardHeader>
        <CardBody className="gap-6 pt-4">
          <div className="rounded-xl bg-slate-700/50 p-4 space-y-4">
            <p className="text-slate-200 text-sm font-medium">
              Contatti per assistenza e sblocco:
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-600/50 hover:bg-slate-600 transition-colors text-amber-300 hover:text-amber-200"
            >
              <Mail className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{SUPPORT_EMAIL}</span>
            </a>
            <a
              href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-600/50 hover:bg-slate-600 transition-colors text-amber-300 hover:text-amber-200"
            >
              <Phone className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium">{SUPPORT_PHONE}</span>
            </a>
          </div>
          <p className="text-slate-400 text-xs text-center">
            Includi nella richiesta l&apos;email con cui hai effettuato
            l&apos;accesso per una risposta più rapida.
          </p>
          <Button
            color="primary"
            variant="flat"
            onPress={handleAggiorna}
            isLoading={updating}
            startContent={!updating ? <RefreshCw size={18} /> : undefined}
            className="w-full font-medium"
          >
            Aggiorna
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
