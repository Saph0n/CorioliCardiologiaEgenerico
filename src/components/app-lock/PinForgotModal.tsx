import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@nextui-org/react";
import { ChevronLeft, KeyRound, Mail, WifiOff } from "lucide-react";
import {
  resetPinWithRecovery,
  resetPinWithOnlineGrant,
} from "../../services/AppLockService";
import {
  requestPinRecoveryOtp,
  verifyPinRecoveryOtp,
} from "../../services/PinRecoveryService";
import { DoctorService } from "../../services/OfflineServices";
import { doctorValuesFromProfile } from "./DoctorProfileSetupFields";
import AppLockShell from "./AppLockShell";
import PinDigitInput from "./PinDigitInput";

const PIN_LENGTH = 4;
const OTP_LENGTH = 6;

type Props = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUnlocked: (newPin?: string) => void;
};

type View = "choose" | "code" | "email" | "email-otp" | "email-pin";

export default function PinForgotModal({ isOpen, onOpenChange, onUnlocked }: Props) {
  const [view, setView] = useState<View>("choose");
  const [clientId, setClientId] = useState("");
  const [email, setEmail] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [otp, setOtp] = useState("");
  const [grant, setGrant] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [newPinConfirm, setNewPinConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pinShake, setPinShake] = useState(false);
  const [confirmShake, setConfirmShake] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);

  const resetState = () => {
    setView("choose");
    setRecoveryCode("");
    setOtp("");
    setGrant(null);
    setNewPin("");
    setNewPinConfirm("");
    setError(null);
    setInfo(null);
    setLoading(false);
    setPinShake(false);
    setConfirmShake(false);
  };

  useEffect(() => {
    if (!isOpen) return;
    void DoctorService.getDoctor().then((doctor) => {
      const values = doctorValuesFromProfile(doctor);
      setClientId(doctor?.id ?? "");
      setEmail(values.email);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const syncOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, [isOpen]);

  const close = () => {
    onOpenChange(false);
    resetState();
  };

  const goBack = () => {
    setError(null);
    setInfo(null);
    if (view === "email-otp") setView("email");
    else if (view === "email-pin") setView("email-otp");
    else setView("choose");
  };

  const validateNewPin = (): string | null => {
    const a = newPin.replace(/\D/g, "");
    const b = newPinConfirm.replace(/\D/g, "");
    if (a.length !== PIN_LENGTH) {
      setPinShake(true);
      setTimeout(() => setPinShake(false), 600);
      return `Il nuovo PIN deve avere esattamente ${PIN_LENGTH} cifre.`;
    }
    if (a !== b) {
      setConfirmShake(true);
      setTimeout(() => setConfirmShake(false), 600);
      return "I PIN non coincidono.";
    }
    return null;
  };

  const handleCodeReset = async () => {
    setError(null);
    const pinErr = validateNewPin();
    if (pinErr) {
      setError(pinErr);
      return;
    }
    setLoading(true);
    try {
      const a = newPin.replace(/\D/g, "");
      const result = await resetPinWithRecovery(recoveryCode, a);
      if (!result.ok) {
        setError(result.error || "Recupero non riuscito.");
        return;
      }
      close();
      onUnlocked(a);
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async () => {
    setError(null);
    setInfo(null);
    if (!clientId) {
      setError("Profilo medico non trovato su questo dispositivo.");
      return;
    }
    if (!email.trim()) {
      setError("Inserisci l'email del profilo medico.");
      return;
    }
    setLoading(true);
    try {
      const result = await requestPinRecoveryOtp(clientId, email);
      if (!result.ok) {
        setError(result.error || "Invio non riuscito.");
        return;
      }
      setInfo(result.message || "Codice inviato. Controlla la casella email.");
      setView("email-otp");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setError(null);
    if (!clientId) {
      setError("Profilo medico non trovato.");
      return;
    }
    setLoading(true);
    try {
      const result = await verifyPinRecoveryOtp(clientId, email, otp);
      if (!result.ok || !result.grant) {
        setError(result.error || "Codice non valido.");
        return;
      }
      setGrant(result.grant);
      setView("email-pin");
    } finally {
      setLoading(false);
    }
  };

  const handleEmailPinReset = async () => {
    setError(null);
    const pinErr = validateNewPin();
    if (pinErr) {
      setError(pinErr);
      return;
    }
    if (!grant || !clientId) {
      setError("Sessione di recupero scaduta. Richiedi un nuovo codice.");
      return;
    }
    setLoading(true);
    try {
      const a = newPin.replace(/\D/g, "");
      const result = await resetPinWithOnlineGrant(clientId, grant, a);
      if (!result.ok) {
        setError(result.error || "Impossibile impostare il nuovo PIN.");
        return;
      }
      close();
      onUnlocked(a);
    } finally {
      setLoading(false);
    }
  };

  const { title, subtitle, icon } = useMemo(() => {
    if (view === "choose") {
      return {
        title: "Recupero PIN",
        subtitle: "Scegli come reimpostare l'accesso all'app.",
        icon: "lock" as const,
      };
    }
    if (view === "code") {
      return {
        title: "Codice CORI-…",
        subtitle: "Inserisci il codice salvato alla configurazione, poi un nuovo PIN.",
        icon: "key" as const,
      };
    }
    if (view === "email") {
      return {
        title: "Recupero via email",
        subtitle: "Passo 1 di 3 — Invieremo un codice all'email del profilo.",
        icon: "mail" as const,
      };
    }
    if (view === "email-otp") {
      return {
        title: "Controlla la email",
        subtitle: "Passo 2 di 3 — Inserisci il codice a 6 cifre ricevuto.",
        icon: "mail" as const,
      };
    }
    return {
      title: "Nuovo PIN",
      subtitle: "Passo 3 di 3 — Scegli un PIN a 4 cifre.",
      icon: "lock" as const,
    };
  }, [view]);

  const pinReady =
    newPin.replace(/\D/g, "").length === PIN_LENGTH &&
    newPinConfirm.replace(/\D/g, "").length === PIN_LENGTH;

  const otpReady = otp.replace(/\D/g, "").length === OTP_LENGTH;

  if (!isOpen) return null;

  return (
    <AppLockShell title={title} subtitle={subtitle} icon={icon} overlay>
      {view === "choose" ? (
        <div className="space-y-3">
          <RecoveryOptionCard
            icon={<KeyRound className="h-5 w-5 text-primary" />}
            title="Ho il codice CORI-…"
            description="Salvato durante la configurazione del PIN. Funziona anche offline."
            onPress={() => {
              setError(null);
              setView("code");
            }}
          />
          <RecoveryOptionCard
            icon={<Mail className="h-5 w-5 text-primary" />}
            title="Recupero via email"
            description={
              online
                ? "Codice inviato all'email del profilo medico."
                : "Richiede connessione internet."
            }
            disabled={!online}
            onPress={() => {
              setError(null);
              setView("email");
            }}
          />
          {!online ? (
            <div className="flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2.5">
              <WifiOff className="h-4 w-4 text-warning-700 shrink-0 mt-0.5" />
              <p className="text-xs text-warning-800 leading-relaxed">
                Sei offline. Usa il codice CORI-… oppure un backup dei dati.
              </p>
            </div>
          ) : null}
          <button
            type="button"
            className="w-full text-sm text-default-500 hover:text-foreground transition-colors pt-1"
            onClick={close}
          >
            Annulla
          </button>
        </div>
      ) : null}

      {view === "code" ? (
        <div className="space-y-5">
          <RecoveryCodeField value={recoveryCode} onChange={setRecoveryCode} />
          <PinPairInputs
            newPin={newPin}
            newPinConfirm={newPinConfirm}
            onNewPin={setNewPin}
            onConfirm={setNewPinConfirm}
            pinShake={pinShake}
            confirmShake={confirmShake}
            disabled={loading}
          />
          {error ? <AlertMessage tone="danger">{error}</AlertMessage> : null}
          <Button
            color="primary"
            className="w-full font-medium"
            isLoading={loading}
            isDisabled={!pinReady || !recoveryCode.trim()}
            onPress={() => void handleCodeReset()}
          >
            Imposta nuovo PIN
          </Button>
          <NavBack onPress={goBack} />
        </div>
      ) : null}

      {view === "email" ? (
        <div className="space-y-5">
          <p className="text-sm text-default-600 text-center leading-relaxed">
            Inserisci l&apos;email del tuo profilo: ti invieremo un codice per reimpostare
            il PIN.
          </p>
          <Input
            label="Email del profilo"
            type="email"
            value={email}
            onValueChange={setEmail}
            variant="bordered"
            classNames={{ input: "text-base" }}
          />
          <p className="text-xs text-default-500 text-center leading-relaxed">
            Non ricordi l&apos;email o non ricevi il codice?{" "}
            <a
              href="mailto:info@corioli.it"
              className="text-primary font-medium hover:underline"
            >
              Scrivi a info@corioli.it
            </a>
          </p>
          {error ? <AlertMessage tone="danger">{error}</AlertMessage> : null}
          <Button
            color="primary"
            className="w-full font-medium"
            isLoading={loading}
            onPress={() => void handleSendOtp()}
          >
            Invia codice
          </Button>
          <NavBack onPress={goBack} />
        </div>
      ) : null}

      {view === "email-otp" ? (
        <div className="space-y-5">
          {info ? <AlertMessage tone="success">{info}</AlertMessage> : null}
          <p className="text-xs text-default-500 text-center">
            Inviato a <span className="font-medium text-foreground">{email}</span>
          </p>
          <div className="space-y-1">
            <p className="text-xs text-default-500 text-center">Codice a 6 cifre</p>
            <PinDigitInput
              value={otp}
              onChange={setOtp}
              length={OTP_LENGTH}
              autoFocus
              disabled={loading}
              showHint={false}
              onComplete={() => void handleVerifyOtp()}
              aria-label="Codice OTP"
            />
          </div>
          {error ? <AlertMessage tone="danger">{error}</AlertMessage> : null}
          <Button
            color="primary"
            className="w-full font-medium"
            isLoading={loading}
            isDisabled={!otpReady}
            onPress={() => void handleVerifyOtp()}
          >
            Verifica codice
          </Button>
          <NavBack onPress={goBack} />
        </div>
      ) : null}

      {view === "email-pin" ? (
        <div className="space-y-5">
          <PinPairInputs
            newPin={newPin}
            newPinConfirm={newPinConfirm}
            onNewPin={setNewPin}
            onConfirm={setNewPinConfirm}
            pinShake={pinShake}
            confirmShake={confirmShake}
            disabled={loading}
            autoFocus
            onComplete={() => void handleEmailPinReset()}
          />
          {error ? <AlertMessage tone="danger">{error}</AlertMessage> : null}
          <Button
            color="primary"
            className="w-full font-medium"
            isLoading={loading}
            isDisabled={!pinReady}
            onPress={() => void handleEmailPinReset()}
          >
            Salva nuovo PIN
          </Button>
          <NavBack onPress={goBack} />
        </div>
      ) : null}
    </AppLockShell>
  );
}

function RecoveryOptionCard({
  icon,
  title,
  description,
  onPress,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className={[
        "w-full text-left rounded-xl border-2 p-4 transition-all",
        disabled
          ? "border-default-200 bg-default-50 opacity-60 cursor-not-allowed"
          : "border-default-200 bg-content1 hover:border-primary hover:bg-primary-50/40 active:scale-[0.99]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3.5">
        <div className="h-11 w-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0 pt-0.5">
          <p className="font-semibold text-foreground">{title}</p>
          <p className="text-sm text-default-500 mt-0.5 leading-snug">{description}</p>
        </div>
      </div>
    </button>
  );
}

function RecoveryCodeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-default-500 text-center">Codice di recupero</p>
      <div className="rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/60 px-3 py-2 focus-within:border-primary focus-within:bg-primary-50 transition-colors">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="CORI-XXXX-XXXX-XXXX"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent text-center font-mono text-base sm:text-lg font-bold tracking-wider text-primary-900 placeholder:text-default-500 placeholder:font-normal placeholder:tracking-normal outline-none"
        />
      </div>
    </div>
  );
}

function PinPairInputs({
  newPin,
  newPinConfirm,
  onNewPin,
  onConfirm,
  pinShake,
  confirmShake,
  disabled,
  autoFocus,
  onComplete,
}: {
  newPin: string;
  newPinConfirm: string;
  onNewPin: (v: string) => void;
  onConfirm: (v: string) => void;
  pinShake?: boolean;
  confirmShake?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  onComplete?: () => void;
}) {
  return (
    <>
      <div className="space-y-1">
        <p className="text-xs text-default-500 text-center">Nuovo PIN</p>
        <PinDigitInput
          value={newPin}
          onChange={onNewPin}
          length={PIN_LENGTH}
          autoFocus={autoFocus}
          disabled={disabled}
          invalid={pinShake}
          aria-label="Nuovo PIN"
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-default-500 text-center">Conferma PIN</p>
        <PinDigitInput
          value={newPinConfirm}
          onChange={onConfirm}
          length={PIN_LENGTH}
          disabled={disabled}
          invalid={confirmShake}
          onComplete={onComplete}
          onSubmit={onComplete}
          aria-label="Conferma nuovo PIN"
        />
      </div>
    </>
  );
}

function AlertMessage({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "danger" | "success";
}) {
  const styles =
    tone === "danger"
      ? "border-danger-200 bg-danger-50 text-danger-700"
      : "corioli-feedback-success";
  return (
    <p
      className={`text-sm text-center rounded-xl border px-3 py-2.5 leading-relaxed ${styles}`}
      role="alert"
    >
      {children}
    </p>
  );
}

function NavBack({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      className="w-full flex items-center justify-center gap-1 text-sm text-primary font-medium hover:underline"
      onClick={onPress}
    >
      <ChevronLeft size={16} />
      Indietro
    </button>
  );
}
