import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@nextui-org/react";
import { HardDrive, Mail, MessageSquareText, Phone, RefreshCw } from "lucide-react";
import { DoctorService } from "../services/OfflineServices";
import { storageService } from "../services/StorageServiceFallback";
import { sendHeartbeat } from "../services/HeartbeatService";

const SUPPORT_EMAIL = "info@corioli.it";
const SUPPORT_PHONE = "+39 3938001284";
const BLOCKED_STORAGE_KEY = "blocked_users";

type Esito = "ancora-sospeso" | "offline" | null;

/**
 * Accesso sospeso dall'assistenza (blocco manuale dalla dashboard). Il tono è
 * volutamente calmo: chi arriva qui deve capire subito che i dati non sono
 * persi e cosa fare per riprendere a lavorare.
 */
export default function Blocked() {
  const navigate = useNavigate();
  const [controllo, setControllo] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [esito, setEsito] = useState<Esito>(null);

  const controllaDiNuovo = async () => {
    setEsito(null);
    setControllo(true);
    try {
      const doctor = await DoctorService.getDoctor();
      if (!doctor?.id?.trim()) {
        setEsito("offline");
        return;
      }
      const { blocked, reason } = await sendHeartbeat(doctor, "corioli-cardiologia");
      if (blocked === false) {
        await storageService.setPreference(
          BLOCKED_STORAGE_KEY,
          JSON.stringify({ blocked: false, checkedAt: new Date().toISOString() }),
        );
        navigate("/", { replace: true });
      } else if (blocked === true) {
        setReason(reason ?? null);
        setEsito("ancora-sospeso");
      } else {
        setEsito("offline");
      }
    } catch (e) {
      console.error("Blocked controllaDiNuovo:", e);
      setEsito("offline");
    } finally {
      setControllo(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const raw = await storageService.getPreference(BLOCKED_STORAGE_KEY);
        const data = raw ? (JSON.parse(raw) as { reason?: string | null }) : null;
        setReason(data?.reason?.trim() || null);
      } catch (e) {
        console.error("Errore lettura stato sospensione:", e);
      }
      try {
        const doctor = await DoctorService.getDoctor();
        setEmail(doctor?.email?.trim() || null);
      } catch {
        // l'email serve solo come promemoria nel testo
      }
    })();
  }, []);

  const oggetto = encodeURIComponent("Riattivazione accesso Corioli Cardiologia");
  const corpo = encodeURIComponent(
    `Buongiorno,\nvorrei riattivare l'accesso a Corioli Cardiologia.${email ? `\nEmail del profilo: ${email}` : ""}\n`,
  );

  return (
    <div className="flex min-h-finestra items-center justify-center bg-default-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <img
          src={`${import.meta.env.BASE_URL}corioli-logo.svg`}
          alt="Corioli"
          className="mx-auto mb-6 h-9 w-auto"
        />

        <section
          aria-labelledby="titolo-sospeso"
          className="overflow-hidden rounded-2xl border border-default-200 bg-white shadow-sm"
        >
          <div className="px-6 pb-5 pt-6 sm:px-8">
            <h1 id="titolo-sospeso" className="text-xl font-semibold text-foreground">
              L&apos;accesso a Corioli Cardiologia è sospeso
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-default-600">
              Per il momento l&apos;app non si può usare su questo computer. Basta contattarci:
              lo riattiviamo noi, non devi reinstallare nulla.
            </p>

            <div className="mt-5 flex gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3">
              <HardDrive className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden />
              <p className="text-sm leading-relaxed text-brand-900">
                <span className="font-medium">I tuoi dati sono al sicuro.</span> Pazienti, visite e
                documenti restano su questo computer, e li ritrovi così come li hai lasciati.
              </p>
            </div>

            {reason ? (
              <div className="mt-3 flex gap-3 rounded-xl border border-default-200 px-4 py-3">
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-default-500" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-foreground">Nota dall&apos;assistenza</p>
                  <p className="mt-0.5 leading-relaxed text-default-600">{reason}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-default-100 px-6 py-5 sm:px-8">
            <p className="text-sm font-medium text-foreground">Come riattivarlo</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${oggetto}&body=${corpo}`}
                className="flex items-center gap-3 rounded-xl border border-default-200 px-3 py-2.5 text-sm text-foreground transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                <Mail className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">Scrivici</span>
                  <span className="block truncate text-xs text-default-500">{SUPPORT_EMAIL}</span>
                </span>
              </a>
              <a
                href={`tel:${SUPPORT_PHONE.replace(/\s/g, "")}`}
                className="flex items-center gap-3 rounded-xl border border-default-200 px-3 py-2.5 text-sm text-foreground transition-colors hover:border-brand-200 hover:bg-brand-50"
              >
                <Phone className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
                <span className="min-w-0">
                  <span className="block font-medium">Chiamaci</span>
                  <span className="block text-xs text-default-500">{SUPPORT_PHONE}</span>
                </span>
              </a>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-default-500">
              {email
                ? `Indica l'email del profilo (${email}): così ti troviamo subito.`
                : "Indica l'email del tuo profilo: così ti troviamo subito."}{" "}
              Quando ti confermiamo la riattivazione, premi &quot;Controlla di nuovo&quot;.
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t border-default-100 bg-default-50/60 px-6 py-4 sm:px-8">
            <Button
              className="w-full bg-brand-700 font-medium text-white"
              onPress={() => void controllaDiNuovo()}
              isLoading={controllo}
              startContent={controllo ? undefined : <RefreshCw size={16} />}
            >
              Controlla di nuovo
            </Button>
            {esito ? (
              <p role="status" className="text-center text-xs text-default-600">
                {esito === "ancora-sospeso"
                  ? "L'accesso non è ancora stato riattivato. Se ci hai già contattato, riprova tra qualche minuto."
                  : "Non riesco a collegarmi a Corioli. Controlla la connessione a internet e riprova."}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
