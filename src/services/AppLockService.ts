export type AppLockStatus = {
  configured: boolean;
  /** Password dell'account impostata (serve per cambiare il PIN). */
  passwordConfigured?: boolean;
  canRevealRecovery: boolean;
  biometricAvailable?: boolean;
  biometricLabel?: string | null;
  biometricKind?: "touchId" | "windowsHello" | null;
  biometricEnabled?: boolean;
};

export type AppLockSetupResult = {
  ok: boolean;
  recoveryCode?: string;
  recoveryStoredSecurely?: boolean;
  error?: string;
};

type ElectronAppLockApi = {
  appLockStatus?: () => Promise<AppLockStatus>;
  appLockSetup?: (pin: string, password?: string) => Promise<AppLockSetupResult>;
  appLockVerifyPin?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  appLockRevealRecovery?: (pin: string) => Promise<{
    ok: boolean;
    recoveryCode?: string;
    error?: string;
  }>;
  appLockRegenerateRecovery?: (pin: string) => Promise<AppLockSetupResult>;
  appLockChangePin?: (payload: {
    currentPin?: string;
    newPin: string;
    password?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appLockSetPassword?: (payload: { pin: string; password: string }) => Promise<{ ok: boolean; error?: string }>;
  appLockChangePassword?: (payload: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appLockResetPasswordWithEmail?: (payload: {
    clientId: string;
    email: string;
    otp: string;
    ticket: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appLockResetPinWithRecovery?: (payload: {
    recoveryCode: string;
    newPin: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appLockResetPinWithOnlineGrant?: (payload: {
    clientId: string;
    grant: string;
    newPin: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  appLockSetBiometricEnabled?: (payload: {
    pin: string;
    enabled: boolean;
  }) => Promise<{ ok: boolean; biometricEnabled?: boolean; error?: string }>;
  appLockVerifyBiometric?: () => Promise<{
    ok: boolean;
    error?: string;
    cancelled?: boolean;
  }>;
  appLockIsSessionUnlocked?: () => Promise<boolean>;
  appLockSetSessionUnlocked?: () => Promise<void>;
};

function api(): ElectronAppLockApi | undefined {
  return (window as unknown as { electronAPI?: ElectronAppLockApi }).electronAPI;
}

type EsitoLock = { ok: boolean; error?: string };

const ATTESA_MASSIMA_MS = 30_000;

/**
 * Chiamata al processo principale che risponde sempre: se Electron non ha
 * l'operazione (app aggiornata ma non riavviata), lancia un errore o non
 * risponde, si restituisce un errore leggibile invece di lasciare la
 * finestra a caricare.
 */
export async function chiamataSicura<T extends EsitoLock>(
  chiamata: (() => Promise<T> | undefined) | undefined,
): Promise<T | EsitoLock> {
  if (!chiamata) return { ok: false, error: "Funzione non disponibile." };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const promessa = chiamata();
    if (!promessa) return { ok: false, error: "Funzione non disponibile." };
    const scaduta = new Promise<EsitoLock>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, error: "Nessuna risposta. Riprova tra qualche secondo." }),
        ATTESA_MASSIMA_MS,
      );
    });
    return (await Promise.race([promessa, scaduta])) ?? { ok: false, error: "Funzione non disponibile." };
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    if (/No handler registered/i.test(messaggio)) {
      return { ok: false, error: "Corioli è stato aggiornato: chiudilo e riaprilo per usare questa funzione." };
    }
    console.error("[AppLock]", messaggio);
    return { ok: false, error: "Operazione non riuscita. Riprova." };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function isAppLockAvailable(): boolean {
  return Boolean(api()?.appLockStatus);
}

export async function getAppLockStatus(): Promise<AppLockStatus | null> {
  return (await api()?.appLockStatus?.()) ?? null;
}

export async function setupAppLock(pin: string, password?: string): Promise<AppLockSetupResult> {
  const a = api();
  return chiamataSicura(a?.appLockSetup ? () => a.appLockSetup!(pin, password) : undefined);
}

export async function verifyAppLockPin(
  pin: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api()?.appLockVerifyPin?.(pin);
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function revealRecoveryCode(
  pin: string,
): Promise<{ ok: boolean; recoveryCode?: string; error?: string }> {
  const res = await api()?.appLockRevealRecovery?.(pin);
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function regenerateRecoveryCode(
  pin: string,
): Promise<AppLockSetupResult> {
  const res = await api()?.appLockRegenerateRecovery?.(pin);
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

/** Con la password dell'account; senza password impostata vale il PIN attuale. */
export async function changeAppLockPin(
  currentPin: string | undefined,
  newPin: string,
  password?: string,
): Promise<{ ok: boolean; error?: string }> {
  const a = api();
  return chiamataSicura(
    a?.appLockChangePin ? () => a.appLockChangePin!({ currentPin, newPin, password }) : undefined,
  );
}

export async function resetPinWithRecovery(
  recoveryCode: string,
  newPin: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api()?.appLockResetPinWithRecovery?.({
    recoveryCode,
    newPin,
  });
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function resetPinWithOnlineGrant(
  clientId: string,
  grant: string,
  newPin: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await api()?.appLockResetPinWithOnlineGrant?.({
    clientId,
    grant,
    newPin,
  });
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function setBiometricUnlockEnabled(
  pin: string,
  enabled: boolean,
): Promise<{ ok: boolean; biometricEnabled?: boolean; error?: string }> {
  const res = await api()?.appLockSetBiometricEnabled?.({ pin, enabled });
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function verifyAppLockBiometric(): Promise<{
  ok: boolean;
  error?: string;
  cancelled?: boolean;
}> {
  const res = await api()?.appLockVerifyBiometric?.();
  return res ?? { ok: false, error: "Funzione non disponibile." };
}

export async function isSessionUnlocked(): Promise<boolean> {
  return (await api()?.appLockIsSessionUnlocked?.()) ?? false;
}

export async function markSessionUnlocked(): Promise<void> {
  await api()?.appLockSetSessionUnlocked?.();
}

/** Regole della password, uguali a quelle del processo principale. */
export function erroreFormatoPassword(password: string): string | null {
  if (password.length < 8) return "La password deve avere almeno 8 caratteri.";
  if (password.length > 128) return "La password è troppo lunga.";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) {
    return "La password deve contenere almeno una lettera e un numero.";
  }
  return null;
}

export async function setAppLockPassword(pin: string, password: string): Promise<{ ok: boolean; error?: string }> {
  const a = api();
  return chiamataSicura(a?.appLockSetPassword ? () => a.appLockSetPassword!({ pin, password }) : undefined);
}

export async function changeAppLockPassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string }> {
  const a = api();
  return chiamataSicura(
    a?.appLockChangePassword ? () => a.appLockChangePassword!({ currentPassword, newPassword }) : undefined,
  );
}

export async function resetAppLockPasswordWithEmail(payload: {
  clientId: string;
  email: string;
  otp: string;
  ticket: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const a = api();
  return chiamataSicura(
    a?.appLockResetPasswordWithEmail ? () => a.appLockResetPasswordWithEmail!(payload) : undefined,
  );
}
