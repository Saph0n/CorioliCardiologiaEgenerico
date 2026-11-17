import { useState } from "react";
import { Button, Checkbox } from "@nextui-org/react";
import { Copy, Check, Mail, ChevronLeft, ArrowLeft, ArrowRight } from "lucide-react";
import { PRIVACY_POLICY_URL } from "../../constants/privacy";

type Props = {
  recoveryCode: string;
  storedSecurely?: boolean;
  onConfirmSaved: () => void;
  confirmLabel?: string;
  loading?: boolean;
  /** Mostra la nota: si può reimpostare il PIN anche tramite l'email del profilo. */
  showEmailRecoveryNote?: boolean;
  /** Email del profilo, mostrata nella nota di recupero via email. */
  recoveryEmail?: string;
  /** Mostra il paragrafo introduttivo (off quando il testo è già nel sottotitolo). */
  showIntro?: boolean;
  /** Richiede la spunta di accettazione della privacy policy per proseguire. */
  requirePolicyConsent?: boolean;
  /** URL dell'informativa privacy (default: costante dell'app). */
  policyUrl?: string;
  /** Se presente, mostra un pulsante "Indietro". */
  onBack?: () => void;
  /** Pulsanti in stile onboarding (uguali agli altri passi del setup). */
  onboardingStyle?: boolean;
  /** Notifica lo stato dei consensi (usato per animare la mascotte). */
  onConsentChange?: (state: { ack: boolean; policyAck: boolean }) => void;
};

export default function RecoveryCodePanel({
  recoveryCode,
  storedSecurely = true,
  onConfirmSaved,
  confirmLabel = "Confermo — Continua",
  loading = false,
  showEmailRecoveryNote = false,
  recoveryEmail,
  showIntro = true,
  requirePolicyConsent = false,
  policyUrl = PRIVACY_POLICY_URL,
  onBack,
  onboardingStyle = false,
  onConsentChange,
}: Props) {
  const [ack, setAck] = useState(false);
  const [policyAck, setPolicyAck] = useState(false);
  const [copied, setCopied] = useState(false);

  const canConfirm = ack && (!requirePolicyConsent || policyAck);

  const handleAck = (v: boolean) => {
    setAck(v);
    onConsentChange?.({ ack: v, policyAck });
  };
  const handlePolicyAck = (v: boolean) => {
    setPolicyAck(v);
    onConsentChange?.({ ack, policyAck: v });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-3">
      {showIntro ? (
        <p className="text-sm text-default-600 leading-relaxed">
          Conserva il codice al sicuro (password manager o stampa): serve a recuperare
          l&apos;accesso se dimentichi il PIN.
        </p>
      ) : null}
      {!storedSecurely ? (
        <p className="text-sm text-warning-700 bg-warning-50 border border-warning-200 rounded-lg px-3 py-2">
          Su questo dispositivo non sarà più visualizzabile: salvalo adesso.
        </p>
      ) : (
        <p className="text-xs text-default-500">
          Potrai rivederlo da Impostazioni → Account Corioli, con il PIN.
        </p>
      )}
      <div className="flex items-center gap-2 rounded-xl border-2 border-dashed border-primary-200 bg-primary-50/80 px-4 py-3">
        <code className="flex-1 text-center text-lg font-mono font-bold tracking-wider text-primary-900 break-all">
          {recoveryCode}
        </code>
        <Button
          isIconOnly
          size="sm"
          variant="flat"
          aria-label="Copia codice"
          onPress={() => void handleCopy()}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
        </Button>
      </div>
      {showEmailRecoveryNote ? (
        <div className="flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-50/60 px-3 py-2.5">
          <Mail className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-default-600 leading-relaxed">
            In alternativa puoi reimpostare il PIN via email del profilo
            {recoveryEmail ? (
              <>
                {" "}
                (<span className="font-medium text-foreground">{recoveryEmail}</span>)
              </>
            ) : null}
            , con internet.
          </p>
        </div>
      ) : null}
      <Checkbox isSelected={ack} onValueChange={handleAck} size="sm">
        Ho salvato il codice di recupero
      </Checkbox>
      {requirePolicyConsent ? (
        <Checkbox isSelected={policyAck} onValueChange={handlePolicyAck} size="sm">
          <span className="text-sm">
            Accetto e ho letto la{" "}
            <a
              href={policyUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary font-medium hover:underline"
            >
              privacy policy
            </a>
          </span>
        </Checkbox>
      ) : null}
      {onboardingStyle ? (
        <>
          {onBack ? (
            <Button
              variant="light"
              className="onboarding-back-btn w-full"
              isDisabled={loading}
              onPress={onBack}
              startContent={<ArrowLeft size={16} />}
            >
              Indietro
            </Button>
          ) : null}
          <Button
            color="primary"
            className="onboarding-cta-btn w-full"
            isDisabled={!canConfirm}
            isLoading={loading}
            onPress={onConfirmSaved}
            endContent={!loading ? <ArrowRight size={18} /> : null}
          >
            {confirmLabel}
          </Button>
        </>
      ) : (
        <>
          <Button
            color="primary"
            className="w-full font-medium"
            isDisabled={!canConfirm}
            isLoading={loading}
            onPress={onConfirmSaved}
          >
            {confirmLabel}
          </Button>
          {onBack ? (
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1 text-sm text-primary font-medium hover:underline disabled:opacity-50"
              onClick={onBack}
              disabled={loading}
            >
              <ChevronLeft size={16} />
              Indietro
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
