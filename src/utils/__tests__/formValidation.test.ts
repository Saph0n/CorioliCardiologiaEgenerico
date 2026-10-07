import { describe, expect, it } from "vitest";
import {
  normalizzaPartitaIva,
  normalizzaPressioneArteriosa,
  validatePartitaIva,
  validatePressioneArteriosa,
} from "../formValidation";

/**
 * Il cardiologo aveva scritto "120 80" e la visita non si salvava: il campo
 * accettava la sola barra. Un modulo che rifiuta un input ovvio a meta' visita
 * e' il tipo di attrito che fa chiudere il programma.
 */
describe("pressione arteriosa", () => {
  it("accetta i separatori che si scrivono davvero", () => {
    for (const scritta of ["120/80", "120 80", "120-80", "120 / 80", "120\\80"]) {
      expect(validatePressioneArteriosa(scritta)).toBeNull();
      expect(normalizzaPressioneArteriosa(scritta)).toBe("120/80");
    }
  });

  it("lascia passare il campo vuoto", () => {
    expect(validatePressioneArteriosa("")).toBeNull();
    expect(validatePressioneArteriosa(undefined)).toBeNull();
  });

  it("continua a fermare quello che non e' una pressione", () => {
    expect(validatePressioneArteriosa("centoventi")).toContain("formato");
    expect(validatePressioneArteriosa("120")).toContain("formato");
    expect(validatePressioneArteriosa("120/80/60")).toContain("formato");
  });

  it("continua a controllare i limiti e l'ordine delle due misure", () => {
    expect(validatePressioneArteriosa("400 80")).toContain("sistolica");
    expect(validatePressioneArteriosa("120 15")).toContain("diastolica");
    expect(validatePressioneArteriosa("80 120")).toContain("inferiore");
  });

  it("non inventa un valore quando non riconosce le due misure", () => {
    expect(normalizzaPressioneArteriosa("centoventi")).toBe("centoventi");
    expect(normalizzaPressioneArteriosa("")).toBe("");
  });
});

describe("partita IVA del medico", () => {
  it("accetta una partita IVA con la cifra di controllo giusta", () => {
    expect(validatePartitaIva("12345678903")).toBeNull();
  });

  it("accetta il campo vuoto: e' facoltativa", () => {
    expect(validatePartitaIva("")).toBeNull();
    expect(validatePartitaIva(undefined)).toBeNull();
  });

  it("toglie prefisso IT e spazi, come quando si copia da una fattura", () => {
    expect(normalizzaPartitaIva(" IT 123 456 789 03 ")).toBe("12345678903");
    expect(validatePartitaIva("IT12345678903")).toBeNull();
  });

  it("rifiuta lunghezza sbagliata e cifra di controllo sbagliata", () => {
    expect(validatePartitaIva("1234567890")).toContain("11 cifre");
    expect(validatePartitaIva("12345678904")).toContain("non valida");
  });
});
