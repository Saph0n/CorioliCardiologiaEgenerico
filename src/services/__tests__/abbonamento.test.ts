import { beforeEach, describe, expect, it } from "vitest";

/**
 * Abbonamento: lo stato che l'app ricava dall'ultima licenza del server, anche
 * senza connessione, e la sola lettura dell'archivio vero ad abbonamento scaduto.
 * Fuori da Electron l'archivio usa localStorage: qui e' una mappa.
 */
const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});
const eventi: string[] = [];
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: { dispatchEvent: (e: Event) => void eventi.push(e.type) },
});

const { calcolaStatoAbbonamento, scadenzaInArrivo, testoPrezzo, GIORNI_TOLLERANZA_OFFLINE } = await import(
  "../AbbonamentoService"
);
const {
  storageService,
  impostaSolaLettura,
  apriArchivioDiProva,
  chiudiArchivioDiProva,
  ErroreSolaLettura,
  EVENTO_SCRITTURA_BLOCCATA,
} = await import("../StorageServiceFallback");
type LicenzaServer = import("../AbbonamentoService").LicenzaServer;

const GIORNO = 24 * 60 * 60 * 1000;
const ADESSO = new Date("2026-11-08T12:00:00Z");
const tra = (giorni: number) => new Date(ADESSO.getTime() + giorni * GIORNO).toISOString();

const licenza = (extra: Partial<LicenzaServer>): LicenzaServer => ({
  required: true,
  checkedAt: ADESSO.toISOString(),
  ...extra,
});

describe("calcolaStatoAbbonamento", () => {
  it("senza licenza, o con pagamenti spenti sul server, non limita nulla", () => {
    expect(calcolaStatoAbbonamento(null, ADESSO)).toEqual({ tipo: "libero" });
    expect(calcolaStatoAbbonamento(licenza({ required: false }), ADESSO)).toEqual({ tipo: "libero" });
  });

  it("prova: giorni rimasti contati in locale fino alla data di fine", () => {
    const stato = calcolaStatoAbbonamento(licenza({ status: "trial", trialEndsAt: tra(2.5) }), ADESSO);
    expect(stato).toMatchObject({ tipo: "prova", giorniRimasti: 3 });
  });

  it("la prova finisce alla sua data anche senza connessione", () => {
    const stato = calcolaStatoAbbonamento(licenza({ status: "trial", trialEndsAt: tra(-0.1) }), ADESSO);
    expect(stato).toEqual({ tipo: "scaduto", motivo: "prova_finita" });
  });

  it("abbonamento attivo, con disdetta e pagamento in ritardo", () => {
    const stato = calcolaStatoAbbonamento(
      licenza({
        status: "active",
        validUntil: tra(10),
        subscription: { status: "past_due", currentPeriodEnd: tra(10), cancelAt: null, cancelAtPeriodEnd: true, pastDue: true },
      }),
      ADESSO,
    );
    expect(stato).toMatchObject({ tipo: "attivo", disdetto: true, pagamentoInRitardo: true });
  });

  it("offline dopo il rinnovo: una settimana di tolleranza, poi serve una verifica", () => {
    const attivo = licenza({ status: "active", validUntil: tra(-(GIORNI_TOLLERANZA_OFFLINE - 1)) });
    expect(calcolaStatoAbbonamento(attivo, ADESSO).tipo).toBe("attivo");
    const vecchio = licenza({ status: "active", validUntil: tra(-(GIORNI_TOLLERANZA_OFFLINE + 1)) });
    expect(calcolaStatoAbbonamento(vecchio, ADESSO)).toEqual({ tipo: "scaduto", motivo: "verifica_necessaria" });
  });

  it("scaduto: il motivo arriva dal server", () => {
    expect(calcolaStatoAbbonamento(licenza({ status: "expired", reason: "payment_failed" }), ADESSO)).toEqual({
      tipo: "scaduto",
      motivo: "pagamento_non_riuscito",
    });
    expect(calcolaStatoAbbonamento(licenza({ status: "expired", reason: "subscription_ended" }), ADESSO)).toEqual({
      tipo: "scaduto",
      motivo: "abbonamento_finito",
    });
  });
});

describe("scadenzaInArrivo", () => {
  const disdetto = (fine: string, cancelAtPeriodEnd = false) =>
    calcolaStatoAbbonamento(
      licenza({
        status: "active",
        validUntil: fine,
        subscription: { status: "active", currentPeriodEnd: fine, cancelAt: cancelAtPeriodEnd ? null : fine, cancelAtPeriodEnd, pastDue: false },
      }),
      ADESSO,
    );

  it("prova: giorni rimasti della prova", () => {
    const stato = calcolaStatoAbbonamento(licenza({ status: "trial", trialEndsAt: tra(2.5) }), ADESSO);
    expect(scadenzaInArrivo(stato, ADESSO)).toMatchObject({ tipo: "prova", giorni: 3 });
  });

  it("abbonamento disdetto: giorni alla fine, con cancel_at o a fine periodo", () => {
    expect(scadenzaInArrivo(disdetto(tra(6.5)), ADESSO)).toMatchObject({ tipo: "abbonamento", giorni: 7 });
    expect(scadenzaInArrivo(disdetto(tra(0.2), true), ADESSO)).toMatchObject({ tipo: "abbonamento", giorni: 1 });
  });

  it("abbonamento che si rinnova o stato libero: nessuna scadenza", () => {
    const rinnovo = calcolaStatoAbbonamento(licenza({ status: "active", validUntil: tra(20) }), ADESSO);
    expect(scadenzaInArrivo(rinnovo, ADESSO)).toBeNull();
    expect(scadenzaInArrivo({ tipo: "libero" }, ADESSO)).toBeNull();
  });
});

describe("testoPrezzo", () => {
  const base = { amount: 3000, currency: "eur", interval: "month", intervalCount: 1, trialDays: 30 };
  it("scrive l'IVA solo se il Checkout la calcola", () => {
    expect(testoPrezzo({ ...base, taxBehavior: "exclusive", automaticTax: false })).toMatch(/^30\s€ al mese$/);
    expect(testoPrezzo({ ...base, taxBehavior: "exclusive", automaticTax: true })).toMatch(/^30\s€ al mese \+ IVA$/);
    expect(testoPrezzo({ ...base, taxBehavior: "inclusive", automaticTax: true })).toMatch(/IVA inclusa$/);
    expect(testoPrezzo({ ...base, amount: 3050, taxBehavior: "exclusive", automaticTax: false })).toMatch(/^30,50\s€/);
  });
});

describe("sola lettura dell'archivio", () => {
  beforeEach(() => {
    store.clear();
    eventi.length = 0;
    impostaSolaLettura(false);
    chiudiArchivioDiProva();
  });

  const nuovaPaziente = () =>
    storageService.addPatient({ nome: "Anna", cognome: "Bianchi", dataNascita: "1990-01-01" } as never);

  it("rifiuta pazienti nuovi e cancellazioni, e avvisa l'app", async () => {
    const anna = await nuovaPaziente();
    impostaSolaLettura(true);
    await expect(nuovaPaziente()).rejects.toBeInstanceOf(ErroreSolaLettura);
    await expect(storageService.deletePatient(anna.id)).rejects.toBeInstanceOf(ErroreSolaLettura);
    expect(eventi).toContain(EVENTO_SCRITTURA_BLOCCATA);
    expect(await storageService.getPatients()).toHaveLength(1);
  });

  it("le letture, le preferenze e il reset completo restano possibili", async () => {
    await nuovaPaziente();
    impostaSolaLettura(true);
    expect(await storageService.countPatients()).toBe(1);
    await storageService.setPreference("prova", "1");
    expect(await storageService.getPreference("prova")).toBe("1");
    await storageService.clearAllData();
    expect(await storageService.countPatients()).toBe(0);
  });

  it("la guida di primo avvio lavora in memoria e non è bloccata", async () => {
    impostaSolaLettura(true);
    apriArchivioDiProva({ patients: [], visits: [] });
    await expect(nuovaPaziente()).resolves.toMatchObject({ nome: "Anna" });
    chiudiArchivioDiProva();
    expect(await storageService.countPatients()).toBe(0);
  });
});
