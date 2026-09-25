import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardBody, Button } from "@nextui-org/react";
import { Fingerprint, Lock } from "lucide-react";
import {
  verifyAppLockPin,
  getAppLockStatus,
  verifyAppLockBiometric,
} from "../../services/AppLockService";
import PinDigitInput from "./PinDigitInput";
import PinForgotModal from "./PinForgotModal";

const PIN_LENGTH = 4;

type Props = {
  onUnlocked: () => void;
};

export default function PinUnlockScreen({ onUnlocked }: Props) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [bioLoading, setBioLoading] = useState(false);
  const autoBioAttempted = useRef(false);

  useEffect(() => {
    void getAppLockStatus().then((s) => {
      if (s?.biometricAvailable && s.biometricEnabled) {
        setBiometricEnabled(true);
      }
    });
  }, []);

  const handleBiometricUnlock = useCallback(async () => {
    setError(null);
    setBioLoading(true);
    try {
      const result = await verifyAppLockBiometric();
      if (!result.ok) {
        if (!result.cancelled) {
          setError(result.error || "Autenticazione non riuscita.");
        }
        return;
      }
      onUnlocked();
    } finally {
      setBioLoading(false);
    }
  }, [onUnlocked]);

  useEffect(() => {
    if (!biometricEnabled || autoBioAttempted.current) return;
    autoBioAttempted.current = true;
    void handleBiometricUnlock();
  }, [biometricEnabled, handleBiometricUnlock]);

  const handleUnlock = useCallback(
    async (digits: string) => {
      if (digits.length !== PIN_LENGTH) return;
      setError(null);
      setLoading(true);
      try {
        const result = await verifyAppLockPin(digits);
        if (!result.ok) {
          setError(result.error || "PIN non corretto.");
          setShake(true);
          setPin("");
          setTimeout(() => setShake(false), 600);
          return;
        }
        onUnlocked();
      } finally {
        setLoading(false);
      }
    },
    [onUnlocked],
  );

  return (
    <>
      <div className="min-h-finestra corioli-auth-bg flex items-center justify-center p-6">
        <Card className="w-full max-w-md shadow-lg corioli-card">
          <CardBody className="p-6 sm:p-8 space-y-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-primary-100 flex items-center justify-center">
                <Lock className="text-primary h-7 w-7" />
              </div>
              <h1 className="text-xl font-bold text-foreground">Accesso a Corioli Cardiologia</h1>
              <p className="text-sm text-default-500">
                {biometricEnabled
                  ? "Autenticazione biometrica disponibile. Inserire il PIN in alternativa."
                  : "Inserire il PIN per accedere alla cartella clinica."}
              </p>
            </div>

            {biometricEnabled ? (
              <Button
                color="primary"
                variant="flat"
                className="w-full font-medium"
                startContent={<Fingerprint size={18} />}
                isLoading={bioLoading}
                onPress={() => void handleBiometricUnlock()}
              >
                Accesso biometrico
              </Button>
            ) : null}

            <PinDigitInput
              value={pin}
              onChange={setPin}
              length={PIN_LENGTH}
              autoFocus={!biometricEnabled}
              disabled={loading}
              invalid={shake}
              onComplete={(v) => void handleUnlock(v)}
              onSubmit={() => void handleUnlock(pin.replace(/\D/g, ""))}
              aria-label="PIN di sblocco"
            />

            {error ? (
              <p className="text-sm text-danger text-center" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              color="primary"
              className="w-full font-medium"
              isLoading={loading}
              isDisabled={pin.replace(/\D/g, "").length !== PIN_LENGTH}
              onPress={() => void handleUnlock(pin.replace(/\D/g, ""))}
            >
              Accedi
            </Button>

            <button
              type="button"
              className="w-full text-sm text-primary font-medium hover:underline"
              onClick={() => {
                setForgotOpen(true);
                setError(null);
              }}
            >
              PIN dimenticato — Recupera l&apos;accesso
            </button>
          </CardBody>
        </Card>
      </div>

      <PinForgotModal
        isOpen={forgotOpen}
        onOpenChange={setForgotOpen}
        onUnlocked={(newPin) => {
          if (newPin) setPin(newPin);
          onUnlocked();
        }}
      />
    </>
  );
}
