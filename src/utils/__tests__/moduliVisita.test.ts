import { describe, expect, it } from "vitest";
import {
  GRUPPI_MODULI,
  MODULI_OPZIONALI,
  MODULI_VISITA_SPENTI,
  leggiModuliVisita,
  leggiProntuarioAttivo,
  moduliCheRichiedono,
  moduliDelGruppo,
} from "../moduliVisita";

describe("moduli opzionali della visita", () => {
  it("parte con tutti i moduli spenti quando non ci sono preferenze", () => {
    expect(leggiModuliVisita(null)).toEqual(MODULI_VISITA_SPENTI);
    expect(leggiModuliVisita({})).toEqual(MODULI_VISITA_SPENTI);
  });

  it("accende solo i moduli salvati come attivi", () => {
    const stato = leggiModuliVisita({
      moduliVisita: { holterEcg: true, dopplerTsa: false },
    });
    expect(stato.holterEcg).toBe(true);
    expect(stato.dopplerTsa).toBe(false);
    expect(stato.scompenso).toBe(false);
  });

  // Una preferenza scritta male non deve accendere mezza maschera: vale spento
  // tutto cio' che non e' esattamente `true`.
  it("tratta come spento qualunque valore diverso da true", () => {
    const stato = leggiModuliVisita({
      moduliVisita: { tcCoronarica: "si", testErgometrico: 1, holterEcg: null },
    });
    expect(stato.tcCoronarica).toBe(false);
    expect(stato.testErgometrico).toBe(false);
    expect(stato.holterEcg).toBe(false);
  });

  it("ignora un registro dei moduli di tipo sbagliato", () => {
    expect(leggiModuliVisita({ moduliVisita: "tutti" })).toEqual(
      MODULI_VISITA_SPENTI,
    );
  });

  it("copre ogni modulo opzionale nello stato predefinito", () => {
    for (const modulo of MODULI_OPZIONALI) {
      expect(MODULI_VISITA_SPENTI[modulo.chiave]).toBe(false);
    }
  });

  it("divide i moduli nei due gruppi decisi dal cardiologo", () => {
    expect(moduliDelGruppo("strumentali").map((m) => m.chiave)).toEqual([
      "ecocardiogramma",
      "tcCoronarica",
      "testErgometrico",
      "holterEcg",
      "holterPressorio",
      "dopplerTsa",
    ]);
    expect(moduliDelGruppo("valutazioni").map((m) => m.chiave)).toEqual([
      "scompenso",
      "fibrillazioneAtriale",
    ]);
  });

  // L'ecocardiogramma e' spento di default dal 22 settembre 2026, ma lo
  // scompenso ne legge la FE: acceso da solo mostrerebbe un fenotipo che non
  // si puo' mai calcolare.
  it("fa comparire l'ecocardiogramma con lo scompenso", () => {
    expect(MODULI_VISITA_SPENTI.ecocardiogramma).toBe(false);
    expect(moduliCheRichiedono("ecocardiogramma")).toEqual(["scompenso"]);
    expect(moduliCheRichiedono("tcCoronarica")).toEqual([]);
  });

  // La card nelle impostazioni riassume gruppo per gruppo e il modal elenca
  // gli stessi moduli: se un gruppo non fosse in elenco, i suoi interruttori
  // non comparirebbero da nessuna parte.
  it("elenca ogni modulo sotto uno dei gruppi mostrati", () => {
    const daiGruppi = GRUPPI_MODULI.flatMap((g) =>
      moduliDelGruppo(g.gruppo).map((m) => m.chiave),
    );
    expect(daiGruppi.sort()).toEqual(
      MODULI_OPZIONALI.map((m) => m.chiave).sort(),
    );
  });
});

describe("prontuario", () => {
  it("resta spento finche' non lo si attiva esplicitamente", () => {
    expect(leggiProntuarioAttivo(null)).toBe(false);
    expect(leggiProntuarioAttivo({})).toBe(false);
    expect(leggiProntuarioAttivo({ prontuarioEnabled: "true" })).toBe(false);
    expect(leggiProntuarioAttivo({ prontuarioEnabled: true })).toBe(true);
  });
});
