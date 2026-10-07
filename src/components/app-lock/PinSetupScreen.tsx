import { useEffect, useMemo, useState } from "react";
import { Button } from "@nextui-org/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  setupAppLock,
  changeAppLockPin,
  getAppLockStatus,
  revealRecoveryCode,
} from "../../services/AppLockService";
import { DoctorService, PreferenceService } from "../../services/OfflineServices";
import { sendHeartbeat } from "../../services/HeartbeatService";
import {
  isDoctorProfileComplete,
  getMissingDoctorProfileFields,
  titoloMedico,
} from "../../utils/doctorProfile";
import { normalizzaPartitaIva, validatePartitaIva } from "../../utils/formValidation";
import type { TitoloMedico } from "../../types/Storage";
import AppLockShell from "./AppLockShell";
import RecoveryCodePanel from "./RecoveryCodePanel";
import PinDigitInput from "./PinDigitInput";
import DoctorMascot, { type MascotField } from "./DoctorMascot";
import DoctorProfileSetupFields, {
  doctorValuesFromProfile,
  validateDoctorProfileForm,
  getMissingProfileFieldKeys,
  type DoctorProfileFormValues,
} from "./DoctorProfileSetupFields";
import { SetupReferto, TitoloSelettore } from "./SetupReferto";

const PIN_LENGTH = 4;
// Altezza comune del corpo card per i passi profilo/PIN → niente "scatto" tra uno e l'altro
const STEP_BODY_MIN_HEIGHT = 372;
type Props = {
  mode: "first-run" | "migration";
  onComplete: () => void;
};

/**
 * "referto" sta fra il profilo e il PIN: partita IVA e titolo del referto,
 * chiesti subito perche' finiscono sul primo foglio stampato (Pablo, 8 ottobre
 * 2026). Prima si trovavano solo nelle impostazioni.
 */
type Step = "profile" | "referto" | "pin" | "recovery";

export default function PinSetupScreen({ mode, onComplete }: Props) {
  const [step, setStep] = useState<Step>("profile");
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileValues, setProfileValues] = useState<DoctorProfileFormValues>({
    nome: "",
    cognome: "",
    email: "",
    telefono: "",
    specializzazione: "",
  });
  const [profileFieldsToShow, setProfileFieldsToShow] = useState<
    Array<keyof DoctorProfileFormValues>
  >(["nome", "cognome", "email", "telefono", "specializzazione"]);
  const [titolo, setTitolo] = useState<TitoloMedico>("Dott.");
  const [partitaIva, setPartitaIva] = useState("");
  const [errorePartitaIva, setErrorePartitaIva] = useState<string | null>(null);
  const [titoloRefertoScelto, setTitoloRefertoScelto] = useState("");
  // I passi davvero mostrati: chi aggiorna con il profilo gia' completo va
  // dritto al PIN, senza profilo ne' referto.
  const [passi, setPassi] = useState<Step[]>(["profile", "referto", "pin", "recovery"]);

  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  // PIN effettivamente configurato (per gestire il ritorno indietro dal passo recupero)
  const [configuredPin, setConfiguredPin] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [recoveryStoredSecurely, setRecoveryStoredSecurely] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [confirmShake, setConfirmShake] = useState(false);
  const [activeField, setActiveField] = useState<MascotField>(null);
  // Consensi del passo "Codice di recupero" → reazioni della mascotte
  const [recoveryConsent, setRecoveryConsent] = useState({
    ack: false,
    policyAck: false,
  });
  const [mascotNod, setMascotNod] = useState(0);

  useEffect(() => {
    void (async () => {
      try {
        await DoctorService.initializeDefaultDoctor();
        const doctor = await DoctorService.getDoctor();
        // Edizione generale: nessuna specializzazione precompilata, la sceglie il medico.
        const values = doctorValuesFromProfile(doctor);
        setProfileValues(values);
        setTitolo(titoloMedico(doctor));
        setPartitaIva(doctor?.partitaIva ?? "");
        const prefs = await PreferenceService.getPreferences().catch(() => null);
        if (typeof prefs?.titoloReferto === "string") {
          setTitoloRefertoScelto(prefs.titoloReferto);
        }

        if (mode === "first-run") {
          setProfileFieldsToShow([
            "nome",
            "cognome",
            "email",
            "telefono",
            "specializzazione",
          ]);
          setStep("profile");
        } else if (!isDoctorProfileComplete(doctor)) {
          const missing = getMissingProfileFieldKeys(values);
          setProfileFieldsToShow(
            missing.length > 0
              ? missing
              : ["nome", "cognome", "email", "telefono", "specializzazione"],
          );
          setStep("profile");
        } else {
          setPassi(["pin", "recovery"]);
          setStep("pin");
        }
      } catch {
        setStep("profile");
      } finally {
        setProfileLoading(false);
      }
    })();
  }, [mode]);

  const title = useMemo(() => {
    if (step === "profile") {
      return mode === "first-run" ? "Configurazione profilo medico" : "Completamento profilo";
    }
    if (step === "referto") return "Il tuo referto";
    if (step === "pin") {
      return mode === "migration" ? "Configurazione accesso sicuro" : "Accesso sicuro";
    }
    return "Codice di recupero";
  }, [step, mode]);

  const subtitle = useMemo(() => {
    if (step === "profile") {
      return mode === "first-run"
        ? "Inserisci i tuoi dati professionali per personalizzare l'app."
        : "Completa i dati del profilo medico prima di procedere.";
    }
    if (step === "referto") {
      return "Si può cambiare anche dopo, in Impostazioni.";
    }
    if (step === "pin") {
      return mode === "migration"
        ? "Scegli un PIN a 4 cifre per proteggere i dati clinici."
        : "Scegli un PIN a 4 cifre per proteggere l'accesso.";
    }
    return "Conserva il codice in un luogo sicuro. Ti servirà per recuperare l'accesso.";
  }, [step, mode]);

  const stepProgress = useMemo(() => {
    const idx = passi.indexOf(step);
    return { current: idx + 1, total: passi.length };
  }, [step, passi]);

  const handleProfileContinue = async () => {
    setError(null);
    const validationError = validateDoctorProfileForm(
      profileValues,
      profileFieldsToShow,
    );
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      const doctor = await DoctorService.updateDoctor({
        titolo,
        nome: profileValues.nome.trim(),
        cognome: profileValues.cognome.trim(),
        email: profileValues.email.trim().toLowerCase(),
        telefono: profileValues.telefono.trim(),
        specializzazione: profileValues.specializzazione.trim(),
      });
      if (navigator.onLine) {
        void sendHeartbeat(doctor, "corioli-generale").catch(() => {});
      }
      setActiveField(null);
      setStep("referto");
    } catch {
      setError("Impossibile salvare il profilo.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefertoContinue = async () => {
    setError(null);
    const erroreIva = validatePartitaIva(partitaIva);
    if (erroreIva) {
      setErrorePartitaIva(erroreIva);
      return;
    }
    setLoading(true);
    try {
      const iva = normalizzaPartitaIva(partitaIva);
      await DoctorService.updateDoctor({ partitaIva: iva || undefined });
      setPartitaIva(iva);
      // Si scrive solo il titolo, sopra le preferenze che ci sono gia':
      // vuoto = automatico dalla specializzazione.
      const prefs = (await PreferenceService.getPreferences()) ?? {};
      await PreferenceService.savePreferences({
        ...prefs,
        titoloReferto: titoloRefertoScelto.trim(),
      });
      setActiveField(null);
      setStep("pin");
    } catch {
      setError("Impossibile salvare i dati del referto.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePin = async (resolvedPin?: string, resolvedConfirm?: string) => {
    setError(null);
    const a = (resolvedPin ?? pin).replace(/\D/g, "");
    const b = (resolvedConfirm ?? pinConfirm).replace(/\D/g, "");
    if (a.length !== PIN_LENGTH) {
      setError(`Il PIN deve avere esattamente ${PIN_LENGTH} cifre.`);
      setPinShake(true);
      setTimeout(() => setPinShake(false), 600);
      return;
    }
    if (a !== b) {
      setError("I PIN non coincidono.");
      setConfirmShake(true);
      setTimeout(() => setConfirmShake(false), 600);
      return;
    }
    setLoading(true);
    try {
      // Fonte di verità: se il lock è GIÀ configurato (siamo tornati indietro dal
      // passo "Codice di recupero"), il setup non si può rifare → si aggiorna il PIN.
      const status = await getAppLockStatus();
      if (status?.configured) {
        // PIN cambiato → aggiorna usando il vecchio PIN (il codice di recupero resta valido)
        if (configuredPin && a !== configuredPin) {
          const changed = await changeAppLockPin(configuredPin, a);
          if (!changed.ok) {
            setError(changed.error || "Impossibile aggiornare il PIN.");
            return;
          }
          setConfiguredPin(a);
        }
        // assicura di avere un codice di recupero da mostrare
        if (!recoveryCode) {
          const revealed = await revealRecoveryCode(a);
          if (revealed.ok && revealed.recoveryCode) {
            setRecoveryCode(revealed.recoveryCode);
          }
        }
        setStep("recovery");
        return;
      }

      const result = await setupAppLock(a);
      if (!result.ok || !result.recoveryCode) {
        setError(result.error || "Impossibile configurare il PIN.");
        return;
      }
      setRecoveryCode(result.recoveryCode);
      setRecoveryStoredSecurely(result.recoveryStoredSecurely !== false);
      setConfiguredPin(a);
      setStep("recovery");
    } finally {
      setLoading(false);
    }
  };

  const bothFilled =
    pin.replace(/\D/g, "").length === PIN_LENGTH &&
    pinConfirm.replace(/\D/g, "").length === PIN_LENGTH;

  const pinsMatch =
    bothFilled && pin.replace(/\D/g, "") === pinConfirm.replace(/\D/g, "");

  // Dal PIN si torna al passo prima, se c'e' (il referto, al primo avvio).
  const passoPrimaDelPin: Step | undefined = passi[passi.indexOf("pin") - 1];

  // Felice SOLO quando entrambi i PIN sono inseriti e coincidono
  const pinMascotComplete = pinsMatch;
  // Dispiaciuto quando entrambi sono inseriti ma NON coincidono
  const pinMascotMismatch = bothFilled && !pinsMatch;

  const tornaA = (passo: Step) => {
    setError(null);
    setActiveField(null);
    setStep(passo);
  };

  // Ogni spunta dei consensi → il gufo fa un cenno; tutti dati → resta sorridente
  const recoveryAllConsented =
    recoveryConsent.ack && recoveryConsent.policyAck;
  const handleRecoveryConsentChange = (next: {
    ack: boolean;
    policyAck: boolean;
  }) => {
    const becameChecked =
      (next.ack && !recoveryConsent.ack) ||
      (next.policyAck && !recoveryConsent.policyAck);
    if (becameChecked) setMascotNod((n) => n + 1);
    setRecoveryConsent(next);
  };

  const profileFilled = useMemo(() => {
    for (const key of profileFieldsToShow) {
      if (!String(profileValues[key] ?? "").trim()) return false;
    }
    if (
      profileFieldsToShow.includes("email") &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profileValues.email.trim())
    ) {
      return false;
    }
    return true;
  }, [profileValues, profileFieldsToShow]);

  if (profileLoading) {
    return (
      <AppLockShell title="Configurazione" subtitle="Caricamento dati in corso…" icon="lock">
        <p className="text-sm text-center text-default-500">Attendere prego…</p>
      </AppLockShell>
    );
  }

  if (step === "recovery" && recoveryCode) {
    return (
      <AppLockShell
        title={title}
        subtitle={subtitle}
        icon="lock"
        mascot={
          <DoctorMascot happy={recoveryAllConsented} nodSignal={mascotNod} />
        }
        stepProgress={stepProgress}
        bodyMinHeight={STEP_BODY_MIN_HEIGHT}
      >
        <RecoveryCodePanel
          recoveryCode={recoveryCode}
          storedSecurely={recoveryStoredSecurely}
          loading={loading}
          showIntro={false}
          showEmailRecoveryNote
          recoveryEmail={profileValues.email.trim() || undefined}
          requirePolicyConsent
          onboardingStyle
          onConsentChange={handleRecoveryConsentChange}
          onBack={() => {
            setError(null);
            setRecoveryConsent({ ack: false, policyAck: false });
            setStep("pin");
          }}
          onConfirmSaved={() => {
            setLoading(true);
            onComplete();
          }}
        />
      </AppLockShell>
    );
  }

  if (step === "profile") {
    const missingLabels = getMissingDoctorProfileFields(profileValues);
    return (
      <AppLockShell
        title={title}
        subtitle={subtitle}
        icon="user"
        mascot={<DoctorMascot activeField={activeField} />}
        stepProgress={stepProgress}
        bodyMinHeight={STEP_BODY_MIN_HEIGHT}
      >
        <div className="space-y-4">
          {mode === "migration" && missingLabels.length > 0 ? (
            <p className="text-xs text-default-500">
              Campi mancanti: {missingLabels.join(", ")}.
            </p>
          ) : null}
          <TitoloSelettore valore={titolo} onChange={setTitolo} />
          <DoctorProfileSetupFields
            values={profileValues}
            onChange={(field, value) =>
              setProfileValues((prev) => ({ ...prev, [field]: value }))
            }
            showFields={profileFieldsToShow}
            onFieldFocus={(field) => setActiveField(field)}
          />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            color="primary"
            className="onboarding-cta-btn w-full"
            isLoading={loading}
            isDisabled={!profileFilled}
            onPress={() => void handleProfileContinue()}
            endContent={!loading ? <ArrowRight size={18} /> : null}
          >
            Continua
          </Button>
        </div>
      </AppLockShell>
    );
  }

  if (step === "referto") {
    return (
      <AppLockShell
        title={title}
        subtitle={subtitle}
        icon="user"
        mascot={<DoctorMascot activeField={activeField} />}
        stepProgress={stepProgress}
        bodyMinHeight={STEP_BODY_MIN_HEIGHT}
      >
        <div
          className="space-y-4"
          onFocusCapture={(e) => {
            const campo = (e.target as HTMLElement).closest("[data-campo]");
            setActiveField(
              (campo?.getAttribute("data-campo") as MascotField | null) ?? null,
            );
          }}
          onBlurCapture={() => setActiveField(null)}
        >
          <SetupReferto
            titolo={titolo}
            nome={profileValues.nome.trim()}
            cognome={profileValues.cognome.trim()}
            specializzazione={profileValues.specializzazione.trim()}
            partitaIva={partitaIva}
            erroreIva={errorePartitaIva}
            titoloRefertoScelto={titoloRefertoScelto}
            onPartitaIva={(v) => {
              setPartitaIva(v);
              setErrorePartitaIva(null);
            }}
            onBlurIva={() => setErrorePartitaIva(validatePartitaIva(partitaIva))}
            onTitoloReferto={setTitoloRefertoScelto}
          />
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button
            variant="light"
            className="onboarding-back-btn w-full"
            isDisabled={loading}
            onPress={() => tornaA("profile")}
            startContent={<ArrowLeft size={16} />}
          >
            Indietro
          </Button>
          <Button
            color="primary"
            className="onboarding-cta-btn w-full"
            isLoading={loading}
            onPress={() => void handleRefertoContinue()}
            endContent={!loading ? <ArrowRight size={18} /> : null}
          >
            Continua
          </Button>
        </div>
      </AppLockShell>
    );
  }

  return (
    <AppLockShell
      title={title}
      subtitle={subtitle}
      icon="lock"
      mascot={
        <DoctorMascot
          activeField={activeField}
          pinComplete={pinMascotComplete}
          pinMismatch={pinMascotMismatch}
        />
      }
      stepProgress={stepProgress}
      bodyMinHeight={STEP_BODY_MIN_HEIGHT}
    >
      <div className="space-y-5">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-default-500 text-center tracking-wide">Nuovo PIN</p>
          <PinDigitInput
            value={pin}
            onChange={setPin}
            length={PIN_LENGTH}
            autoFocus
            disabled={loading}
            invalid={pinShake}
            onFocusChange={(f) => setActiveField(f ? "pin" : null)}
            aria-label="Nuovo PIN"
          />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-default-500 text-center tracking-wide">Conferma PIN</p>
          <PinDigitInput
            value={pinConfirm}
            onChange={setPinConfirm}
            length={PIN_LENGTH}
            disabled={loading}
            invalid={confirmShake}
            onSubmit={() => void handleCreatePin()}
            onFocusChange={(f) => setActiveField(f ? "pin-confirm" : null)}
            aria-label="Conferma PIN"
          />
        </div>
        {error ? (
          <p className="text-sm text-danger text-center" role="alert">
            {error}
          </p>
        ) : bothFilled && !pinsMatch ? (
          <p className="text-sm text-danger text-center" role="alert">
            I PIN non coincidono.
          </p>
        ) : null}
        {passoPrimaDelPin ? (
          <Button
            variant="light"
            className="onboarding-back-btn w-full"
            isDisabled={loading}
            onPress={() => tornaA(passoPrimaDelPin)}
            startContent={<ArrowLeft size={16} />}
          >
            Indietro
          </Button>
        ) : null}
        <Button
          color="primary"
          className="onboarding-cta-btn w-full"
          isLoading={loading}
          isDisabled={!pinsMatch}
          onPress={() => void handleCreatePin()}
          endContent={!loading ? <ArrowRight size={18} /> : null}
        >
          Continua
        </Button>
      </div>
    </AppLockShell>
  );
}
