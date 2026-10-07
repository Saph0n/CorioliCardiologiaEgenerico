import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Spinner } from "@nextui-org/react";
import {
  getAppLockStatus,
  isAppLockAvailable,
  isSessionUnlocked,
  markSessionUnlocked,
} from "../services/AppLockService";
import { DoctorService, PatientService } from "../services/OfflineServices";
import PinSetupScreen from "../components/app-lock/PinSetupScreen";
import PinUnlockScreen from "../components/app-lock/PinUnlockScreen";

type Phase = "loading" | "setup" | "unlock" | "unlocked";

type AppLockContextValue = {
  isUnlocked: boolean;
  lock: () => void;
  refreshStatus: () => Promise<void>;
};

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) {
    throw new Error("useAppLock must be used within AppLockProvider");
  }
  return ctx;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [setupMode, setSetupMode] = useState<"first-run" | "migration">(
    "migration",
  );

  const refreshStatus = useCallback(async () => {
    if (!isAppLockAvailable()) {
      setPhase("unlocked");
      return;
    }
    const status = await getAppLockStatus();
    if (!status?.configured) {
      try {
        const [patients, doctor] = await Promise.all([
          PatientService.getAllPatients(),
          DoctorService.getDoctor(),
        ]);
        const hasProfile =
          Boolean(doctor?.nome?.trim()) || Boolean(doctor?.cognome?.trim());
        setSetupMode(
          patients.length === 0 && !hasProfile ? "first-run" : "migration",
        );
      } catch {
        setSetupMode("migration");
      }
      setPhase("setup");
      return;
    }
    const alreadyUnlocked = await isSessionUnlocked();
    if (alreadyUnlocked) {
      setPhase("unlocked");
      return;
    }
    setPhase((current) => (current === "unlocked" ? "unlocked" : "unlock"));
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const lock = useCallback(() => {
    if (!isAppLockAvailable()) return;
    setPhase("unlock");
  }, []);

  const value = useMemo(
    () => ({
      isUnlocked: phase === "unlocked",
      lock,
      refreshStatus,
    }),
    [phase, lock, refreshStatus],
  );

  if (phase === "loading") {
    return (
      <div className="min-h-finestra corioli-auth-bg flex flex-col items-center justify-center gap-3">
        <Spinner color="primary" size="lg" />
        <span className="text-default-500 text-sm font-medium">Caricamento…</span>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <PinSetupScreen
        mode={setupMode}
        onComplete={() => {
          void markSessionUnlocked();
          setPhase("unlocked");
        }}
      />
    );
  }

  if (phase === "unlock") {
    return (
      <PinUnlockScreen
        onUnlocked={() => {
          void markSessionUnlocked();
          setPhase("unlocked");
        }}
      />
    );
  }

  return (
    <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>
  );
}