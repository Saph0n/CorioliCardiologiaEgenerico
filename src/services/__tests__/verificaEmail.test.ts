import { describe, expect, it } from "vitest";
import { emailConfermata, normalizzaEmail } from "../VerificaEmailService";

describe("conferma dell'email del profilo", () => {
  it("normalizza spazi e maiuscole", () => {
    expect(normalizzaEmail("  Medico@Example.COM ")).toBe("medico@example.com");
    expect(normalizzaEmail(undefined)).toBe("");
  });

  it("è confermata solo se coincide con l'ultima email verificata", () => {
    expect(emailConfermata({ email: "Medico@example.com", emailVerificata: "medico@example.com" })).toBe(true);
    expect(emailConfermata({ email: "nuova@example.com", emailVerificata: "medico@example.com" })).toBe(false);
    expect(emailConfermata({ email: "medico@example.com" })).toBe(false);
    expect(emailConfermata({ email: "", emailVerificata: "" })).toBe(false);
    expect(emailConfermata(null)).toBe(false);
  });
});
