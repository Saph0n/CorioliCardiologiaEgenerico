import { describe, expect, it } from "vitest";
import {
  CHIAVE_PREF_GUIDA,
  CHIAVE_PREF_PAZIENTI_PROVA,
  conPazientiProva,
  conStatoGuida,
  deveAprirsiDaSola,
  leggiPazientiProva,
  leggiStatoGuida,
} from "../guidaPrimoAvvio";

describe("guida di primo avvio", () => {
  it("si apre da sola con l'archivio vuoto e la guida mai chiusa", () => {
    expect(deveAprirsiDaSola(null, 0)).toBe(true);
    expect(deveAprirsiDaSola({}, 0)).toBe(true);
  });

  // Chi aggiorna da una versione precedente ha gia' i suoi pazienti: la guida
  // non deve comparirgli davanti a una visita.
  it("non si apre da sola a chi ha gia' dei pazienti", () => {
    expect(deveAprirsiDaSola(null, 1)).toBe(false);
    expect(deveAprirsiDaSola({}, 250)).toBe(false);
  });

  it("non torna da sola dopo essere stata chiusa, finita o saltata", () => {
    expect(deveAprirsiDaSola(conStatoGuida({}, "completata"), 0)).toBe(false);
    expect(deveAprirsiDaSola(conStatoGuida({}, "saltata"), 0)).toBe(false);
  });

  it("registra l'esito senza toccare le altre preferenze", () => {
    const adesso = new Date("2026-09-27T10:00:00.000Z");
    const prefs = conStatoGuida(
      { moduliVisita: { holterEcg: true }, gruppiRicercaEnabled: true },
      "completata",
      adesso,
    );
    expect(prefs.moduliVisita).toEqual({ holterEcg: true });
    expect(prefs.gruppiRicercaEnabled).toBe(true);
    expect(leggiStatoGuida(prefs)).toEqual({
      esito: "completata",
      data: "2026-09-27T10:00:00.000Z",
    });
  });

  // Una preferenza scritta male vale "mai vista": al peggio la guida si
  // riapre una volta, mai il contrario (sparire senza essere stata vista).
  it("tratta come mai vista una preferenza scritta male", () => {
    expect(leggiStatoGuida({ [CHIAVE_PREF_GUIDA]: true })).toBeNull();
    expect(leggiStatoGuida({ [CHIAVE_PREF_GUIDA]: "completata" })).toBeNull();
    expect(leggiStatoGuida({ [CHIAVE_PREF_GUIDA]: { esito: "forse" } })).toBeNull();
  });

  it("ricorda i pazienti di prova e li dimentica senza toccare il resto", () => {
    const con = conPazientiProva({ moduliVisita: { holterEcg: true } }, ["p-1", "p-2"]);
    expect(leggiPazientiProva(con)).toEqual(["p-1", "p-2"]);
    const senza = conPazientiProva(con, []);
    expect(leggiPazientiProva(senza)).toEqual([]);
    expect(CHIAVE_PREF_PAZIENTI_PROVA in senza).toBe(false);
    expect(senza.moduliVisita).toEqual({ holterEcg: true });
  });

  // Le versioni precedenti registravano un paziente solo, come stringa: se
  // l'app si era chiusa a meta' prova, va cancellato anche lui.
  it("legge il paziente di prova delle versioni precedenti", () => {
    expect(leggiPazientiProva({ [CHIAVE_PREF_PAZIENTI_PROVA]: "p-42" })).toEqual(["p-42"]);
  });

  it("ignora i pazienti di prova scritti male", () => {
    expect(leggiPazientiProva({ [CHIAVE_PREF_PAZIENTI_PROVA]: "" })).toEqual([]);
    expect(leggiPazientiProva({ [CHIAVE_PREF_PAZIENTI_PROVA]: 12 })).toEqual([]);
    expect(leggiPazientiProva({ [CHIAVE_PREF_PAZIENTI_PROVA]: ["p-1", 3, " "] })).toEqual(["p-1"]);
    expect(leggiPazientiProva(null)).toEqual([]);
  });
});
