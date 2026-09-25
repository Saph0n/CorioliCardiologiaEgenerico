import { beforeEach, describe, expect, it } from "vitest";

const store = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
  },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: {} });

const {
  bozzaDaProporre,
  cancellaBozzaVisita,
  chiaveBozzaVisita,
  leggiBozzaVisita,
  scriviBozzaVisita,
} = await import("../bozzaVisita");

beforeEach(() => store.clear());

const bozza = {
  salvataIl: "2026-09-23T10:42:00.000Z",
  visitData: { dataVisita: "2026-09-23" },
  visitaData: { esameObiettivo: "Toni validi" },
  anamnesiStrutturata: {},
};

describe("bozza della visita", () => {
  it("si ritrova dopo una chiusura improvvisa e sparisce quando si cancella", async () => {
    const chiave = chiaveBozzaVisita(undefined, "p1");
    await scriviBozzaVisita(chiave, bozza);
    expect(await leggiBozzaVisita(chiave)).toEqual(bozza);
    await cancellaBozzaVisita(chiave);
    expect(await leggiBozzaVisita(chiave)).toBeNull();
  });

  it("tiene separate la visita nuova e quelle in archivio", () => {
    expect(chiaveBozzaVisita(undefined, "p1")).not.toBe(chiaveBozzaVisita("v1", "p1"));
    expect(chiaveBozzaVisita(undefined, "p1")).not.toBe(chiaveBozzaVisita(undefined, "p2"));
  });

  it("propone la bozza solo se e' piu' recente del salvataggio", () => {
    expect(bozzaDaProporre(bozza)).toBe(true);
    expect(bozzaDaProporre(bozza, "2026-09-23T09:00:00.000Z")).toBe(true);
    expect(bozzaDaProporre(bozza, "2026-09-23T11:00:00.000Z")).toBe(false);
    expect(bozzaDaProporre(null)).toBe(false);
  });

  it("ignora una bozza illeggibile", async () => {
    store.set("AppDottori_bozza_visita_x", "{rotto");
    expect(await leggiBozzaVisita("bozza_visita_x")).toBeNull();
  });
});
