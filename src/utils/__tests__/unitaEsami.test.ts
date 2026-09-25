import { describe, expect, it } from "vitest";
import { suggerisciUnita } from "../unitaEsami";

describe("suggerisciUnita", () => {
  it("riconosce la creatinina scritta in µmol/L", () => {
    expect(suggerisciUnita("lab.crea", 90)).toEqual({ unita: "µmol/L", valore: 1.02, testo: "1,02" });
  });

  it("lascia stare i valori plausibili nell'unita' del campo", () => {
    expect(suggerisciUnita("lab.crea", 1.05)).toBeNull();
    expect(suggerisciUnita("lab.crea", 8)).toBeNull(); // insufficienza renale grave, ma mg/dL
    expect(suggerisciUnita("lab.tot", 186)).toBeNull();
    expect(suggerisciUnita("lab.ldl", 12)).toBeNull(); // LDL molto bassa in terapia intensiva
    expect(suggerisciUnita("lab.gli", 42)).toBeNull();
    expect(suggerisciUnita("lab.hba1c", 6.1)).toBeNull();
    expect(suggerisciUnita("lab.apob", 92)).toBeNull();
  });

  it("converte le unita' dei laboratori che non usano mg/dL", () => {
    expect(suggerisciUnita("lab.hba1c", 48)?.testo).toBe("6,5");
    expect(suggerisciUnita("lab.gli", 5.5)?.valore).toBe(99);
    expect(suggerisciUnita("lab.tot", 5.2)?.valore).toBe(201);
    expect(suggerisciUnita("lab.tg", 1.7)?.valore).toBe(151);
    expect(suggerisciUnita("lab.apob", 0.92)?.valore).toBe(92);
    expect(suggerisciUnita("lab.hb", 135)?.testo).toBe("13,5");
  });

  it("riconosce gli intervalli ECG in secondi e le misure dell'eco in cm", () => {
    expect(suggerisciUnita("ecg.qt", 0.4)).toEqual({ unita: "secondi", valore: 400, testo: "400" });
    expect(suggerisciUnita("ecg.pr", 160)).toBeNull();
    expect(suggerisciUnita("eco.ddvs", 5)?.valore).toBe(50);
    expect(suggerisciUnita("eco.ddvs", 52)).toBeNull();
    expect(suggerisciUnita("eco.siv", 1)?.valore).toBe(10);
    expect(suggerisciUnita("eco.siv", 11)).toBeNull();
  });

  it("non suggerisce niente dove le unita' si sovrappongono o il valore manca", () => {
    expect(suggerisciUnita("lab.azot", 5)).toBeNull();
    expect(suggerisciUnita("lab.hspcr", 0.3)).toBeNull();
    expect(suggerisciUnita("lab.crea", undefined)).toBeNull();
    expect(suggerisciUnita("lab.crea", 0)).toBeNull();
  });
});
