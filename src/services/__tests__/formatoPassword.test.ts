import { describe, expect, it } from "vitest";
import { erroreFormatoPassword } from "../AppLockService";

describe("regole della password (lato pagina)", () => {
  it("accetta password con lettere, numeri e simboli", () => {
    expect(erroreFormatoPassword("Siboney2005.")).toBeNull();
    expect(erroreFormatoPassword("Studio2026")).toBeNull();
  });

  it("rifiuta password corte, senza numeri o senza lettere", () => {
    expect(erroreFormatoPassword("Ab1")).toMatch(/8 caratteri/);
    expect(erroreFormatoPassword("solodlettere")).toMatch(/una lettera e un numero/);
    expect(erroreFormatoPassword("12345678")).toMatch(/una lettera e un numero/);
  });
});
