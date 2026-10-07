import { describe, expect, it } from "vitest";
import { normalizzaPartitaIva, validatePartitaIva } from "../formValidation";

describe("partita IVA", () => {
  it("si conserva come 11 cifre, senza IT e spazi", () => {
    expect(normalizzaPartitaIva(" IT 123 456 789 03 ")).toBe("12345678903");
    expect(normalizzaPartitaIva("")).toBe("");
  });

  it("e' facoltativa", () => {
    expect(validatePartitaIva("")).toBeNull();
    expect(validatePartitaIva(undefined)).toBeNull();
  });

  it("controlla lunghezza e cifra di controllo", () => {
    expect(validatePartitaIva("12345678903")).toBeNull();
    expect(validatePartitaIva("IT12345678903")).toBeNull();
    expect(validatePartitaIva("1234567890")).toMatch(/11 cifre/);
    expect(validatePartitaIva("12345678901")).toMatch(/non valida/);
  });
});
