import { describe, expect, it } from "vitest";
import { cercaPazienti, sembraCodiceFiscale } from "../ricercaPazienti";
import { formatPatientDisplayName, patientInitials } from "../patientDisplay";

const pazienti = [
  { id: "1", nome: "Mario", cognome: "Rossi", codiceFiscale: "RSSMRA50D12A794K" },
  { id: "2", nome: "Anna", cognome: "Prosperi", codiceFiscale: "PRSNNA60A41G702X" },
  { id: "3", nome: "Nicolò", cognome: "D'Angelo", codiceFiscale: undefined },
  { id: "4", nome: "Rosa", cognome: "Bianchi", codiceFiscale: "BNCRSO70C50G702Y" },
];

const ids = (q: string) => cercaPazienti(pazienti, q).map((p) => p.id);

describe("ricerca del paziente", () => {
  it("trova per cognome, anche chi non ha il codice fiscale", () => {
    // Il pannello "Nuova visita" cercava solo sul CF: il paziente 3 era
    // irraggiungibile, e bastava lui a spegnere i suggerimenti per tutti.
    expect(ids("dangelo")).toEqual(["3"]);
    expect(ids("d'angelo")).toEqual(["3"]);
  });

  it("ignora accenti, maiuscole e ordine delle parole", () => {
    expect(ids("NICOLO")).toEqual(["3"]);
    expect(ids("mario rossi")).toEqual(["1"]);
    expect(ids("rossi mario")).toEqual(["1"]);
  });

  it("mette prima chi ha il cognome che comincia cosi'", () => {
    // "ros" e' dentro Prosperi e comincia Rossi e Rosa: il cognome vince sul
    // nome, e l'inizio di parola vince sul pezzo in mezzo.
    expect(ids("ros")).toEqual(["1", "4", "2"]);
  });

  it("riconosce il codice fiscale, intero o in parte", () => {
    expect(ids("RSSMRA50D12A794K")).toEqual(["1"]);
    expect(ids("702")).toEqual([]);
    expect(ids("G702X")).toEqual(["2"]);
    expect(ids("PRSN")).toEqual(["2"]);
  });

  it("non restituisce nulla senza ricerca", () => {
    expect(ids("   ")).toEqual([]);
  });

  it("distingue un nome da un codice fiscale", () => {
    expect(sembraCodiceFiscale("elisabetta")).toBe(false);
    expect(sembraCodiceFiscale("RSSMRA50")).toBe(true);
    expect(sembraCodiceFiscale("RSSMRA50D12A794K")).toBe(true);
  });
});

describe("nome del paziente", () => {
  it("scrive il cognome in maiuscolo e poi il nome, come il referto", () => {
    expect(formatPatientDisplayName({ nome: "Mario", cognome: "Rossi" })).toBe("ROSSI Mario");
    expect(formatPatientDisplayName({ nome: "Nicolò", cognome: "D'Angelò" })).toBe("D'ANGELÒ Nicolò");
  });

  it("regge i nomi incompleti", () => {
    expect(formatPatientDisplayName({ nome: "Mario", cognome: "" })).toBe("Mario");
    expect(formatPatientDisplayName({ nome: " ", cognome: "" })).toBeNull();
    expect(patientInitials({ nome: "Mario", cognome: "Rossi" })).toBe("RM");
    expect(patientInitials({ nome: "", cognome: "" })).toBe("?");
  });
});
