import { describe, expect, it } from "vitest";
import { titoloDaSpecializzazione, titoloReferto } from "../titoloReferto";

describe("titolo del referto", () => {
  it("si ricava dalla specializzazione scritta nel profilo", () => {
    expect(titoloDaSpecializzazione("Specialista in medicina interna")).toBe("Visita internistica");
    expect(titoloDaSpecializzazione("Cardiologia")).toBe("Visita cardiologica");
    expect(titoloDaSpecializzazione("Geriatra")).toBe("Visita geriatrica");
    expect(titoloDaSpecializzazione("Endocrinologia e malattie del metabolismo")).toBe(
      "Visita endocrinologica",
    );
  });

  it("con due discipline vince quella nominata per prima", () => {
    expect(titoloDaSpecializzazione("Specialista in cardiologia e geriatria")).toBe(
      "Visita cardiologica",
    );
    expect(titoloDaSpecializzazione("Geriatria e cardiologia")).toBe("Visita geriatrica");
  });

  it("chirurgia vascolare e' angiologica, non chirurgica", () => {
    expect(titoloDaSpecializzazione("Chirurgia vascolare")).toBe("Visita angiologica");
  });

  it("senza una disciplina riconoscibile e' una visita medica", () => {
    expect(titoloDaSpecializzazione("Medicina generale")).toBe("Visita medica");
    expect(titoloDaSpecializzazione("")).toBe("Visita medica");
    expect(titoloDaSpecializzazione(undefined)).toBe("Visita medica");
  });

  it("il titolo scritto nelle impostazioni vince", () => {
    expect(titoloReferto("Visita di controllo", "Cardiologia")).toBe("Visita di controllo");
    expect(titoloReferto("   ", "Cardiologia")).toBe("Visita cardiologica");
    expect(titoloReferto(undefined, "Cardiologia")).toBe("Visita cardiologica");
  });
});
