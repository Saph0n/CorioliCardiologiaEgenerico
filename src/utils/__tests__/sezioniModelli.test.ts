import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MedicalTemplates } from "../../data/medicalTemplates";
import { createDefaultAnamnesiConfig } from "../anamnesiStrutturata";
import { MODULI_VISITA_SPENTI } from "../moduliVisita";
import { SEZIONI_VISITA_CON_MODELLI, doveCompareModello } from "../sezioniModelli";

const sezioni = SEZIONI_VISITA_CON_MODELLI.map((s) => s.sezione);
const singola = createDefaultAnamnesiConfig("singola");
const strutturata = createDefaultAnamnesiConfig("strutturata");
const tuttiSpenti = { moduli: MODULI_VISITA_SPENTI, anamnesi: singola };

describe("sezioni dei modelli della visita", () => {
  // L'editor proponeva la TC coronarica, che nella visita il pulsante non ce
  // l'ha, e non proponeva Holter e Doppler, che ce l'hanno: l'elenco deve
  // essere quello dei pulsanti «Modello» della maschera, ne' uno di piu' ne'
  // uno di meno.
  it("sono esattamente quelle col pulsante «Modello» nella visita", () => {
    const sorgente = readFileSync("src/Pages/Dashboard/AddVisit.tsx", "utf8");
    const nellaVisita = new Set(
      [...sorgente.matchAll(/t\.section === "([A-Za-z]+)"/g)].map((m) => m[1]),
    );
    expect([...nellaVisita].sort()).toEqual([...sezioni].sort());
  });

  it("ogni modello predefinito della visita ha una sezione che esiste", () => {
    for (const sezione of Object.keys(MedicalTemplates.visita)) {
      expect(sezioni, sezione).toContain(sezione);
    }
  });
});

describe("dove compare un modello", () => {
  it("chiama le sezioni come la visita, non con la chiave tecnica", () => {
    const dove = doveCompareModello({ category: "visita", section: "holterEcg" }, tuttiSpenti);
    expect(dove.etichetta).toBe("Holter ECG");
    expect(doveCompareModello({ category: "esame_complementare", section: "nome" }, tuttiSpenti).etichetta).toBe(
      "Richiesta di esame",
    );
  });

  it("dice quando il modulo e' spento, e non quando e' acceso", () => {
    const spento = doveCompareModello({ category: "visita", section: "dopplerTsa" }, tuttiSpenti);
    expect(spento.nascosto).toBe("Modulo spento");
    const acceso = doveCompareModello(
      { category: "visita", section: "dopplerTsa" },
      { moduli: { ...MODULI_VISITA_SPENTI, dopplerTsa: true }, anamnesi: singola },
    );
    expect(acceso.nascosto).toBeUndefined();
  });

  it("vede l'ecocardiogramma portato dallo scompenso", () => {
    const dove = doveCompareModello(
      { category: "visita", section: "ecocardiogramma" },
      { moduli: { ...MODULI_VISITA_SPENTI, scompenso: true }, anamnesi: singola },
    );
    expect(dove.nascosto).toBeUndefined();
  });

  it("mette la TC coronarica fra le sezioni con modelli, legata al suo modulo", () => {
    const dove = doveCompareModello({ category: "visita", section: "tcCoronarica" }, tuttiSpenti);
    expect(dove).toEqual({ etichetta: "TC coronarica", nascosto: "Modulo spento" });
  });

  it("segnala un modello di una sezione che nella visita non c'e'", () => {
    const dove = doveCompareModello({ category: "visita", section: "sezioneSparita" }, tuttiSpenti);
    expect(dove.nascosto).toBe("Non c'è nella visita");
  });

  it("segue la struttura dell'anamnesi", () => {
    const unico = { category: "visita" as const, section: "prestazione" };
    const familiare = { category: "visita" as const, section: "anamnesiFamiliare" };
    expect(doveCompareModello(unico, tuttiSpenti).nascosto).toBeUndefined();
    expect(doveCompareModello(familiare, tuttiSpenti).nascosto).toBe("Anamnesi a campo unico");

    const aSezioni = { moduli: MODULI_VISITA_SPENTI, anamnesi: strutturata };
    expect(doveCompareModello(unico, aSezioni).nascosto).toBe("Anamnesi divisa in sezioni");
    expect(doveCompareModello(familiare, aSezioni)).toEqual({ etichetta: "Anamnesi · Familiare" });
    // Chirurgica non e' fra le sezioni accese di default.
    expect(
      doveCompareModello({ category: "visita", section: "anamnesiChirurgica" }, aSezioni).nascosto,
    ).toBe("Sezione spenta");
  });
});
