import { describe, expect, it } from "vitest";
import { calculateAge, localTimestampForFileName, todayIsoDate, toLocalIsoDate } from "../dateUtils";

describe("date locali", () => {
  it("usa il giorno locale, non quello UTC", () => {
    // 19 agosto 2026, 00:30 in Italia (UTC+2) = 18 agosto 22:30 UTC.
    // Con toISOString() la visita sarebbe datata al giorno prima.
    const notte = new Date(2026, 7, 19, 0, 30, 0);
    expect(toLocalIsoDate(notte)).toBe("2026-08-19");
    expect(notte.toISOString().slice(0, 10)).toBe("2026-08-18");
  });

  it("gestisce i confini di giorno, mese e anno", () => {
    expect(toLocalIsoDate(new Date(2026, 11, 31, 23, 59, 59))).toBe("2026-12-31");
    expect(toLocalIsoDate(new Date(2027, 0, 1, 0, 0, 0))).toBe("2027-01-01");
    expect(toLocalIsoDate(new Date(2026, 1, 28))).toBe("2026-02-28");
  });

  it("mette lo zero iniziale a giorno e mese", () => {
    expect(toLocalIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toLocalIsoDate(new Date(2026, 8, 9))).toBe("2026-09-09");
  });

  it("una data non valida non produce una stringa fasulla", () => {
    expect(toLocalIsoDate(new Date("non-una-data"))).toBe("");
  });

  it("todayIsoDate è la data locale di oggi", () => {
    expect(todayIsoDate()).toBe(toLocalIsoDate(new Date()));
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("il timestamp per i nomi file è ordinabile e senza caratteri vietati", () => {
    const nome = localTimestampForFileName(new Date(2026, 7, 19, 9, 5, 3));
    expect(nome).toBe("2026-08-19_09-05-03");
    expect(nome).not.toMatch(/[:/?*"<>|]/);
  });
});

describe("età del paziente", () => {
  it("calcola gli anni compiuti", () => {
    const oggi = new Date();
    const trentenne = new Date(oggi.getFullYear() - 30, oggi.getMonth(), oggi.getDate());
    expect(calculateAge(toLocalIsoDate(trentenne))).toBe(30);
  });

  it("non conta il compleanno non ancora arrivato", () => {
    const oggi = new Date();
    const domani = new Date(oggi.getFullYear() - 30, oggi.getMonth(), oggi.getDate() + 1);
    expect(calculateAge(toLocalIsoDate(domani))).toBe(29);
  });

  it("rifiuta input non validi", () => {
    expect(calculateAge("")).toBeNull();
    expect(calculateAge("non-una-data")).toBeNull();
    // Data futura: nessuna età sensata
    expect(calculateAge("2099-01-01")).toBeNull();
  });
});

describe("eta' a una data", () => {
  it("calcola l'eta' alla data indicata", () => {
    expect(calculateAge("2008-06-15", "2026-06-14")).toBe(17);
    expect(calculateAge("2008-06-15", "2026-06-15")).toBe(18);
    expect(calculateAge("2008-06-15", "data sbagliata")).toBeNull();
  });
});
