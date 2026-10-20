import { describe, expect, it } from "vitest";
import { confrontaNomi, ordinaPerChiaveDecrescente } from "../ordinamento";

describe("confrontaNomi", () => {
  const nomi = ["Rossi Mario", "d'Angelo Anna", "Àlvarez Luca", "rossi mario", "De Luca Ugo", "Zanni Èva", "Bianchi"];

  it("ordina come localeCompare in italiano senza maiuscole e accenti", () => {
    const atteso = [...nomi].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
    expect([...nomi].sort(confrontaNomi)).toEqual(atteso);
  });

  it("maiuscole e accenti non contano", () => {
    expect(confrontaNomi("rossi", "ROSSI")).toBe(0);
    expect(confrontaNomi("Nicolò", "Nicolo")).toBe(0);
  });
});

describe("ordinaPerChiaveDecrescente", () => {
  const visite = [
    { id: "a", data: "2024-05-01" },
    { id: "b", data: "2026-01-10" },
    { id: "c", data: "non una data" },
    { id: "d", data: "2024-05-01" },
    { id: "e", data: "2025-12-31" },
    { id: "f", data: "" },
  ];
  const tempo = (v: { data: string }) => new Date(v.data).getTime();

  it("stesso ordine del confronto con le date lette a ogni passo, date non valide comprese", () => {
    const atteso = [...visite].sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    expect(ordinaPerChiaveDecrescente(visite, tempo).map((v) => v.id)).toEqual(atteso.map((v) => v.id));
  });

  it("stabile a parità di chiave e senza toccare l'array di partenza", () => {
    const copia = [...visite];
    const ordinate = ordinaPerChiaveDecrescente(visite, tempo).map((v) => v.id);
    expect(ordinate.indexOf("a")).toBeLessThan(ordinate.indexOf("d"));
    expect(visite).toEqual(copia);
  });
});
