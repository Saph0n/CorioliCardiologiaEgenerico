import { describe, expect, it } from "vitest";
import {
  adattaAlRiquadro,
  spessoreTratto,
  type TrattoFirma,
} from "../firmaAMano";

/** Dove finisce un punto dopo l'adattamento, in altezze del riquadro. */
function porta(a: ReturnType<typeof adattaAlRiquadro>, x: number, y: number) {
  return { x: x * a.scala + a.dx, y: y * a.scala + a.dy };
}

const tratto = (...punti: [number, number][]): TrattoFirma =>
  punti.map(([x, y]) => ({ x, y, p: 0.5 }));

describe("firma sullo schermo: misura nel PDF", () => {
  it("una firma piccola in un angolo finisce al centro del riquadro", () => {
    const a = adattaAlRiquadro([tratto([0.1, 0.1], [0.4, 0.2])]);
    const inizio = porta(a, 0.1, 0.1);
    const fine = porta(a, 0.4, 0.2);
    expect((inizio.x + fine.x) / 2).toBeCloseTo(1.5);
    expect((inizio.y + fine.y) / 2).toBeCloseTo(0.5);
  });

  it("non esce dal riquadro e lascia il margine", () => {
    const a = adattaAlRiquadro([tratto([0, 0], [3, 1])]);
    const inizio = porta(a, 0, 0);
    const fine = porta(a, 3, 1);
    expect(inizio.x).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(inizio.y).toBeGreaterThanOrEqual(0.1 - 1e-9);
    expect(fine.x).toBeLessThanOrEqual(2.9 + 1e-9);
    expect(fine.y).toBeLessThanOrEqual(0.9 + 1e-9);
  });

  it("non deforma la firma", () => {
    // Una firma larga e bassa resta larga e bassa: una sola scala per x e y.
    const a = adattaAlRiquadro([tratto([0.5, 0.5], [2.5, 0.6])]);
    const inizio = porta(a, 0.5, 0.5);
    const fine = porta(a, 2.5, 0.6);
    expect((fine.x - inizio.x) / (fine.y - inizio.y)).toBeCloseTo(20);
  });

  it("una sigla minuscola non diventa una macchia", () => {
    const a = adattaAlRiquadro([tratto([1, 0.5], [1.05, 0.52])]);
    expect(a.scala).toBe(3);
  });

  it("un punto solo resta un punto, al centro", () => {
    const a = adattaAlRiquadro([tratto([0.2, 0.3])]);
    expect(porta(a, 0.2, 0.3).x).toBeCloseTo(1.5);
    expect(porta(a, 0.2, 0.3).y).toBeCloseTo(0.5);
  });

  it("senza tratti non sposta niente", () => {
    expect(adattaAlRiquadro([])).toEqual({ scala: 1, dx: 0, dy: 0 });
  });
});

describe("firma sullo schermo: spessore del tratto", () => {
  it("premendo di piu' il tratto si ingrossa", () => {
    expect(spessoreTratto(0.9)).toBeGreaterThan(spessoreTratto(0.2));
  });

  it("una pressione fuori scala non fa sparire ne' esplodere il tratto", () => {
    expect(spessoreTratto(-1)).toBe(spessoreTratto(0));
    expect(spessoreTratto(0)).toBeGreaterThan(0);
    expect(spessoreTratto(5)).toBe(spessoreTratto(1));
  });
});
