import crypto from "crypto";
import { safeStorage } from "electron";
import { consumePinRecoveryGrant, verifyEmailCode } from "./pinRecoveryClient.js";

export const APP_LOCK_CONFIG_KEY = "app_lock_config_v1";
export const APP_LOCK_RECOVERY_ENC_KEY = "app_lock_recovery_enc_v1";
export const APP_LOCK_BIOMETRIC_PREF_KEY = "app_lock_biometric_pref_v1";

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HASH_KEYLEN = 32;
const PIN_MIN = 4;
const PIN_MAX = 4;
const RECOVERY_SEGMENT = 4;

function scryptHash(secret, salt) {
  return crypto.scryptSync(secret, salt, HASH_KEYLEN, SCRYPT_PARAMS);
}

// Stessa chiave con cui StorageServiceFallback salva il profilo del medico.
const DOCTOR_KV_KEY = "AppDottori_doctor";

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function normalizePin(pin) {
  return String(pin ?? "").replace(/\D/g, "");
}

function normalizeRecoveryCode(code) {
  return String(code ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validatePinFormat(pin) {
  const n = normalizePin(pin);
  if (n.length !== PIN_MIN) {
    return {
      ok: false,
      error: `Il PIN deve avere esattamente ${PIN_MIN} cifre.`,
    };
  }
  return { ok: true, normalized: n };
}

const PASSWORD_MIN = 8;

/**
 * Password dell'account: serve per cambiare il PIN. Almeno 8 caratteri, con
 * almeno una lettera e un numero.
 */
export function validatePasswordFormat(password) {
  const p = String(password ?? "");
  if (p.length < PASSWORD_MIN) {
    return { ok: false, error: `La password deve avere almeno ${PASSWORD_MIN} caratteri.` };
  }
  if (p.length > 128) return { ok: false, error: "La password è troppo lunga." };
  if (!/[A-Za-zÀ-ÿ]/.test(p) || !/\d/.test(p)) {
    return { ok: false, error: "La password deve contenere almeno una lettera e un numero." };
  }
  return { ok: true, value: p };
}

function hashSecret(secret, saltHex) {
  const salt = Buffer.from(saltHex, "hex");
  return scryptHash(secret, salt).toString("hex");
}

function createSalt() {
  return crypto.randomBytes(16).toString("hex");
}

export function generateRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(RECOVERY_SEGMENT * 3);
  const parts = [];
  for (let p = 0; p < 3; p++) {
    let segment = "";
    for (let i = 0; i < RECOVERY_SEGMENT; i++) {
      segment += alphabet[bytes[p * RECOVERY_SEGMENT + i] % alphabet.length];
    }
    parts.push(segment);
  }
  return `CORI-${parts.join("-")}`;
}

function formatRecoveryForDisplay(code) {
  const raw = normalizeRecoveryCode(code);
  if (raw.startsWith("CORI") && raw.length >= 16) {
    const body = raw.slice(4);
    const chunks = body.match(/.{1,4}/g) || [];
    return `CORI-${chunks.join("-")}`;
  }
  return code;
}

export function createAppLockHandlers(kvGet, kvSet, biometric = null) {
  async function readConfig() {
    const raw = await kvGet(APP_LOCK_CONFIG_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.version !== 1 || !parsed.pinHash || !parsed.pinSalt) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  /** Email del profilo già confermata con il codice (campo `emailVerificata`). */
  async function readVerifiedProfileEmail() {
    try {
      const raw = await kvGet(DOCTOR_KV_KEY);
      return normalizeEmail(raw ? JSON.parse(raw)?.emailVerificata : "");
    } catch {
      return "";
    }
  }

  async function writeConfig(config) {
    await kvSet(APP_LOCK_CONFIG_KEY, JSON.stringify(config));
  }

  async function storeRecoveryEncrypted(recoveryCode) {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "safe_storage_unavailable" };
    }
    const enc = safeStorage.encryptString(recoveryCode);
    await kvSet(APP_LOCK_RECOVERY_ENC_KEY, enc.toString("base64"));
    return { ok: true };
  }

  async function readRecoveryDecrypted() {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, reason: "safe_storage_unavailable" };
    }
    const blob = await kvGet(APP_LOCK_RECOVERY_ENC_KEY);
    if (!blob) return { ok: false, reason: "not_found" };
    try {
      const plain = safeStorage.decryptString(Buffer.from(blob, "base64"));
      return { ok: true, code: formatRecoveryForDisplay(plain) };
    } catch {
      return { ok: false, reason: "decrypt_failed" };
    }
  }

  function verifyPinAgainstConfig(pin, config) {
    const check = validatePinFormat(pin);
    if (!check.ok) return false;
    const hash = hashSecret(check.normalized, config.pinSalt);
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"),
      Buffer.from(config.pinHash, "hex"),
    );
  }

  function verifyPasswordAgainstConfig(password, config) {
    if (!config?.passwordHash || !config?.passwordSalt) return false;
    const hash = hashSecret(String(password ?? ""), config.passwordSalt);
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(config.passwordHash, "hex"));
    } catch {
      return false;
    }
  }

  function applyPassword(config, password) {
    config.passwordSalt = createSalt();
    config.passwordHash = hashSecret(password, config.passwordSalt);
    config.passwordUpdatedAt = new Date().toISOString();
  }

  function verifyRecoveryAgainstConfig(code, config) {
    const normalized = normalizeRecoveryCode(code);
    if (normalized.length < 12) return false;
    const hash = hashSecret(normalized, config.recoverySalt);
    try {
      return crypto.timingSafeEqual(
        Buffer.from(hash, "hex"),
        Buffer.from(config.recoveryHash, "hex"),
      );
    } catch {
      return false;
    }
  }

  async function readBiometricPref() {
    const raw = await kvGet(APP_LOCK_BIOMETRIC_PREF_KEY);
    if (!raw) return { enabled: false };
    try {
      const parsed = JSON.parse(raw);
      return { enabled: Boolean(parsed?.enabled) };
    } catch {
      return { enabled: false };
    }
  }

  async function writeBiometricPref(enabled) {
    await kvSet(
      APP_LOCK_BIOMETRIC_PREF_KEY,
      JSON.stringify({ version: 1, enabled: Boolean(enabled) }),
    );
  }

  return {
    async getStatus() {
      const config = await readConfig();
      const bio = biometric ? await biometric.checkAvailable() : null;
      const pref = await readBiometricPref();
      return {
        configured: Boolean(config),
        passwordConfigured: Boolean(config?.passwordHash),
        canRevealRecovery:
          Boolean(config) && safeStorage.isEncryptionAvailable(),
        biometricAvailable: Boolean(bio?.available),
        biometricLabel: bio?.label ?? null,
        biometricKind: bio?.kind ?? null,
        biometricEnabled:
          Boolean(config) && Boolean(bio?.available) && pref.enabled,
      };
    },

    async setup(pin, password) {
      const pinCheck = validatePinFormat(pin);
      if (!pinCheck.ok) {
        return { ok: false, error: pinCheck.error };
      }
      const passwordCheck = password == null ? null : validatePasswordFormat(password);
      if (passwordCheck && !passwordCheck.ok) {
        return { ok: false, error: passwordCheck.error };
      }

      const existing = await readConfig();
      if (existing) {
        return { ok: false, error: "Il PIN è già configurato." };
      }

      const recoveryCode = generateRecoveryCode();
      const recoveryNormalized = normalizeRecoveryCode(recoveryCode);
      const pinSalt = createSalt();
      const recoverySalt = createSalt();
      const config = {
        version: 1,
        pinSalt,
        pinHash: hashSecret(pinCheck.normalized, pinSalt),
        recoverySalt,
        recoveryHash: hashSecret(recoveryNormalized, recoverySalt),
        createdAt: new Date().toISOString(),
      };
      if (passwordCheck) applyPassword(config, passwordCheck.value);

      await writeConfig(config);
      const stored = await storeRecoveryEncrypted(
        formatRecoveryForDisplay(recoveryCode),
      );

      return {
        ok: true,
        recoveryCode: formatRecoveryForDisplay(recoveryCode),
        recoveryStoredSecurely: stored.ok,
      };
    },

    async verifyPin(pin) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (!verifyPinAgainstConfig(pin, config)) {
        return { ok: false, error: "PIN non corretto." };
      }
      return { ok: true };
    },

    async revealRecovery(pin) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (!verifyPinAgainstConfig(pin, config)) {
        return { ok: false, error: "PIN non corretto." };
      }
      const revealed = await readRecoveryDecrypted();
      if (!revealed.ok) {
        return {
          ok: false,
          error:
            "Codice di recupero non disponibile su questo dispositivo. Rigenera un nuovo codice dalle impostazioni.",
        };
      }
      return { ok: true, recoveryCode: revealed.code };
    },

    async regenerateRecovery(pin) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (!verifyPinAgainstConfig(pin, config)) {
        return { ok: false, error: "PIN non corretto." };
      }

      const recoveryCode = generateRecoveryCode();
      const recoveryNormalized = normalizeRecoveryCode(recoveryCode);
      config.recoverySalt = createSalt();
      config.recoveryHash = hashSecret(recoveryNormalized, config.recoverySalt);
      await writeConfig(config);
      const stored = await storeRecoveryEncrypted(
        formatRecoveryForDisplay(recoveryCode),
      );

      return {
        ok: true,
        recoveryCode: formatRecoveryForDisplay(recoveryCode),
        recoveryStoredSecurely: stored.ok,
      };
    },

    /**
     * Cambio PIN: con la password dell'account se c'è; chi non l'ha ancora
     * creata (profili precedenti) conferma con il PIN attuale.
     */
    async changePin(currentPin, newPin, password) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (config.passwordHash) {
        if (!verifyPasswordAgainstConfig(password, config)) {
          return { ok: false, error: "Password non corretta." };
        }
      } else if (!verifyPinAgainstConfig(currentPin, config)) {
        return { ok: false, error: "PIN attuale non corretto." };
      }

      const pinCheck = validatePinFormat(newPin);
      if (!pinCheck.ok) {
        return { ok: false, error: pinCheck.error };
      }

      const pinSalt = createSalt();
      config.pinSalt = pinSalt;
      config.pinHash = hashSecret(pinCheck.normalized, pinSalt);
      await writeConfig(config);
      return { ok: true };
    },

    /** Prima creazione: si conferma con il PIN (appena scelto, o quello attuale). */
    async setPassword(pin, password) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (config.passwordHash) return { ok: false, error: "La password è già impostata: usa \"Cambia password\"." };
      if (!verifyPinAgainstConfig(pin, config)) return { ok: false, error: "PIN non corretto." };
      const check = validatePasswordFormat(password);
      if (!check.ok) return { ok: false, error: check.error };
      applyPassword(config, check.value);
      await writeConfig(config);
      return { ok: true };
    },

    async changePassword(currentPassword, newPassword) {
      const config = await readConfig();
      if (!config?.passwordHash) return { ok: false, error: "Password non ancora impostata." };
      if (!verifyPasswordAgainstConfig(currentPassword, config)) {
        return { ok: false, error: "Password attuale non corretta." };
      }
      const check = validatePasswordFormat(newPassword);
      if (!check.ok) return { ok: false, error: check.error };
      applyPassword(config, check.value);
      await writeConfig(config);
      return { ok: true };
    },

    /**
     * Password dimenticata: il codice mandato all'email del profilo viene
     * verificato dal server da qui (processo principale), poi si salva la nuova.
     */
    async resetPasswordWithEmail(clientId, email, otp, ticket, newPassword) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      const check = validatePasswordFormat(newPassword);
      if (!check.ok) return { ok: false, error: check.error };
      // Il codice vale solo se l'indirizzo è quello già confermato nel profilo:
      // l'email arriva dalla pagina e non basta a dimostrare che sia del medico.
      const profileEmail = await readVerifiedProfileEmail();
      if (!profileEmail || profileEmail !== normalizeEmail(email)) {
        return {
          ok: false,
          error: "L'email non corrisponde a quella confermata nel profilo.",
        };
      }
      const verified = await verifyEmailCode(clientId, profileEmail, otp, ticket);
      if (!verified.ok) return { ok: false, error: verified.error };
      applyPassword(config, check.value);
      await writeConfig(config);
      return { ok: true };
    },

    async resetPinWithOnlineGrant(clientId, grant, newPin) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };

      const consumed = await consumePinRecoveryGrant(clientId, grant);
      if (!consumed.ok) {
        return { ok: false, error: consumed.error };
      }

      const pinCheck = validatePinFormat(newPin);
      if (!pinCheck.ok) {
        return { ok: false, error: pinCheck.error };
      }

      const pinSalt = createSalt();
      config.pinSalt = pinSalt;
      config.pinHash = hashSecret(pinCheck.normalized, pinSalt);
      await writeConfig(config);
      return { ok: true };
    },

    async resetPinWithRecovery(recoveryCode, newPin) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (!verifyRecoveryAgainstConfig(recoveryCode, config)) {
        return { ok: false, error: "Codice di recupero non valido." };
      }

      const pinCheck = validatePinFormat(newPin);
      if (!pinCheck.ok) {
        return { ok: false, error: pinCheck.error };
      }

      const pinSalt = createSalt();
      config.pinSalt = pinSalt;
      config.pinHash = hashSecret(pinCheck.normalized, pinSalt);
      await writeConfig(config);
      return { ok: true };
    },

    async setBiometricEnabled(pin, enabled) {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      if (!verifyPinAgainstConfig(pin, config)) {
        return { ok: false, error: "PIN non corretto." };
      }
      if (!biometric) {
        return { ok: false, error: "Biometria non supportata." };
      }
      const avail = await biometric.checkAvailable();
      if (!avail.available && enabled) {
        return {
          ok: false,
          error: `${avail.label || "Biometria"} non disponibile su questo dispositivo.`,
        };
      }
      await writeBiometricPref(enabled);
      return { ok: true, biometricEnabled: enabled };
    },

    async verifyBiometric() {
      const config = await readConfig();
      if (!config) return { ok: false, error: "PIN non configurato." };
      const pref = await readBiometricPref();
      if (!pref.enabled) {
        return { ok: false, error: "Sblocco biometrico non attivo." };
      }
      if (!biometric) {
        return { ok: false, error: "Biometria non supportata." };
      }
      const avail = await biometric.checkAvailable();
      if (!avail.available) {
        return {
          ok: false,
          error: `${avail.label || "Biometria"} non disponibile.`,
        };
      }
      const result = await biometric.prompt();
      if (!result.ok) {
        return {
          ok: false,
          error: result.error || "Autenticazione non riuscita.",
          cancelled: Boolean(result.cancelled),
        };
      }
      return { ok: true };
    },
  };
}
