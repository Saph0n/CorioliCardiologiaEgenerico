import { afterEach, describe, expect, it, vi } from "vitest";
import { chiamataSicura } from "../AppLockService";

describe("chiamate al processo principale che rispondono sempre", () => {
  afterEach(() => vi.useRealTimers());

  it("passa la risposta di Electron, anche quando è un errore (PIN sbagliato)", async () => {
    await expect(chiamataSicura(async () => ({ ok: false, error: "PIN non corretto." }))).resolves.toEqual({
      ok: false,
      error: "PIN non corretto.",
    });
  });

  it("app aggiornata ma non riavviata: chiede di riaprire Corioli invece di restare a caricare", async () => {
    const esito = await chiamataSicura(async () => {
      throw new Error("Error invoking remote method 'appLock:setPassword': Error: No handler registered for 'appLock:setPassword'");
    });
    expect(esito).toMatchObject({ ok: false, error: expect.stringMatching(/chiudilo e riaprilo/) });
  });

  it("funzione assente o nessuna risposta: errore leggibile", async () => {
    await expect(chiamataSicura(undefined)).resolves.toMatchObject({ ok: false });
    vi.useFakeTimers();
    const attesa = chiamataSicura(() => new Promise<{ ok: boolean }>(() => {}));
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(attesa).resolves.toMatchObject({ ok: false, error: expect.stringMatching(/Nessuna risposta/) });
  });
});
