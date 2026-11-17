import { beforeEach, describe, expect, it, vi } from "vitest";

// safeStorage non serve qui (solo per il codice di recupero cifrato).
vi.mock("electron", () => ({
  safeStorage: { isEncryptionAvailable: () => false },
}));
const verifyEmailCode = vi.fn();
vi.mock("../pinRecoveryClient.js", () => ({
  consumePinRecoveryGrant: vi.fn(),
  verifyEmailCode: (...args) => verifyEmailCode(...args),
}));

const { createAppLockHandlers, validatePasswordFormat } = await import("../appLock.js");

function nuovoLock(emailVerificata = "a@b.it") {
  const store = new Map();
  if (emailVerificata) store.set("AppDottori_doctor", JSON.stringify({ emailVerificata }));
  return createAppLockHandlers(
    async (k) => store.get(k) ?? null,
    async (k, v) => void store.set(k, v),
  );
}

describe("password dell'account", () => {
  beforeEach(() => verifyEmailCode.mockReset());

  it("regole: almeno 8 caratteri, una lettera e un numero", () => {
    expect(validatePasswordFormat("corta1").ok).toBe(false);
    expect(validatePasswordFormat("solotesto").ok).toBe(false);
    expect(validatePasswordFormat("12345678").ok).toBe(false);
    expect(validatePasswordFormat("Studio2026").ok).toBe(true);
  });

  it("creata insieme al PIN alla prima configurazione", async () => {
    const lock = nuovoLock();
    expect((await lock.setup("1234", "corta")).ok).toBe(false);
    expect((await lock.setup("1234", "Studio2026")).ok).toBe(true);
    expect((await lock.getStatus()).passwordConfigured).toBe(true);
  });

  it("il cambio PIN chiede la password, non il PIN", async () => {
    const lock = nuovoLock();
    await lock.setup("1234", "Studio2026");
    expect((await lock.changePin("1234", "5678", undefined)).error).toMatch(/Password non corretta/);
    expect((await lock.changePin(undefined, "5678", "Sbagliata1")).ok).toBe(false);
    expect((await lock.changePin(undefined, "5678", "Studio2026")).ok).toBe(true);
    expect((await lock.verifyPin("5678")).ok).toBe(true);
  });

  it("senza password (profili precedenti) il PIN si cambia ancora con il PIN, e la password si crea col PIN", async () => {
    const lock = nuovoLock();
    await lock.setup("1234");
    expect((await lock.getStatus()).passwordConfigured).toBe(false);
    expect((await lock.changePin("1234", "5678")).ok).toBe(true);
    expect((await lock.setPassword("0000", "Studio2026")).ok).toBe(false);
    expect((await lock.setPassword("5678", "Studio2026")).ok).toBe(true);
    expect((await lock.setPassword("5678", "Altra2026x")).ok).toBe(false);
  });

  it("cambio password con quella attuale", async () => {
    const lock = nuovoLock();
    await lock.setup("1234", "Studio2026");
    expect((await lock.changePassword("Sbagliata1", "Nuova2027")).ok).toBe(false);
    expect((await lock.changePassword("Studio2026", "Nuova2027")).ok).toBe(true);
    expect((await lock.changePin(undefined, "9999", "Nuova2027")).ok).toBe(true);
  });

  it("password dimenticata: si reimposta solo se il server conferma il codice email", async () => {
    const lock = nuovoLock();
    await lock.setup("1234", "Studio2026");
    verifyEmailCode.mockResolvedValueOnce({ ok: false, error: "Codice errato." });
    expect((await lock.resetPasswordWithEmail("pc", "a@b.it", "111111", "t", "Nuova2027")).error).toBe("Codice errato.");
    verifyEmailCode.mockResolvedValueOnce({ ok: true, email: "a@b.it", proof: "p" });
    expect((await lock.resetPasswordWithEmail("pc", "a@b.it", "123456", "t", "Nuova2027")).ok).toBe(true);
    expect(verifyEmailCode).toHaveBeenLastCalledWith("pc", "a@b.it", "123456", "t");
    expect((await lock.changePin(undefined, "4321", "Nuova2027")).ok).toBe(true);
  });

  it("password dimenticata: un'email diversa da quella confermata nel profilo viene rifiutata senza chiamare il server", async () => {
    const lock = nuovoLock("medico@studio.it");
    await lock.setup("1234", "Studio2026");
    const esito = await lock.resetPasswordWithEmail("pc", "intruso@mail.it", "123456", "t", "Nuova2027");
    expect(esito.ok).toBe(false);
    expect(verifyEmailCode).not.toHaveBeenCalled();
    expect((await lock.changePin(undefined, "4321", "Nuova2027")).ok).toBe(false);
  });

  it("password dimenticata: senza email confermata nel profilo non si reimposta", async () => {
    const lock = nuovoLock(null);
    await lock.setup("1234", "Studio2026");
    expect((await lock.resetPasswordWithEmail("pc", "a@b.it", "123456", "t", "Nuova2027")).ok).toBe(false);
    expect(verifyEmailCode).not.toHaveBeenCalled();
  });

  it("l'email è confrontata senza maiuscole né spazi", async () => {
    const lock = nuovoLock("a@b.it");
    await lock.setup("1234", "Studio2026");
    verifyEmailCode.mockResolvedValueOnce({ ok: true, email: "a@b.it", proof: "p" });
    expect((await lock.resetPasswordWithEmail("pc", "  A@B.it ", "123456", "t", "Nuova2027")).ok).toBe(true);
  });
});
