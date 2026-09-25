import { describe, expect, it } from "vitest";
import { san, sanValore } from "../PdfService";

/**
 * Le vocali accentate stanno nella codifica WinAnsi e Helvetica le disegna:
 * `san` le deve lasciar passare. Fino al settembre 2026 le cambiava in
 * apostrofo e il referto usciva con "eta'" e "attivita'".
 */
describe("sanitizer del PDF", () => {
  it("lascia passare le vocali accentate", () => {
    expect(san("attività")).toBe("attività");
    expect(san("perché")).toBe("perché");
    expect(san("è così, può, più")).toBe("è così, può, più");
    expect(san("ATTIVITÀ È Ì Ò Ù")).toBe("ATTIVITÀ È Ì Ò Ù");
  });

  it("le lettere accentate restano nella tabella a un byte", () => {
    // Se una finisse sopra 0xFF jsPDF ripiegherebbe su UTF-16 per tutta la riga.
    for (const carattere of san("àèéìòù ÀÈÉÌÒÙ")) {
      expect(carattere.charCodeAt(0)).toBeLessThanOrEqual(0xff);
    }
  });

  it("ricompone gli accenti di un testo UTF-8 riletto come Latin-1", () => {
    expect(san("attivit\u00c3\u00a0 fisica")).toBe("attività fisica");
    expect(san("perch\u00c3\u00a9")).toBe("perché");
    expect(san("\u00c3\u00a8 cos\u00c3\u00ac")).toBe("è così");
  });

  it("lascia intatto il resto del testo", () => {
    expect(san("Ritmo sinusale, FC 72 bpm")).toBe("Ritmo sinusale, FC 72 bpm");
    expect(san("E/e' > 14")).toBe("E/e' > 14");
    expect(san("eta' scritta con l'apostrofo")).toBe("eta' scritta con l'apostrofo");
    expect(san("")).toBe("");
  });
});

/**
 * Un carattere fuori dalla codifica WinAnsi fa ripiegare jsPDF su UTF-16 per
 * tutta la stringa: il testo esce illeggibile e, siccome la misura per andare
 * a capo viene calcolata su un byte per carattere, la riga sborda oltre il
 * margine destro del foglio. E' successo in ambulatorio sul calcium score.
 */
describe("simboli fuori dalla codifica del font", () => {
  it("traduce il maggiore e minore uguale", () => {
    expect(san("Agatston \u2265 300")).toBe("Agatston >= 300");
    expect(san("FE \u2264 40%")).toBe("FE <= 40%");
    expect(san("\u2260")).toBe("!=");
  });

  it("traduce i pedici del CHA2DS2-VASc", () => {
    expect(san("CHA\u2082DS\u2082-VASc")).toBe("CHA2DS2-VASc");
  });

  it("lascia stare i caratteri che il font sa scrivere", () => {
    // Stanno tutti nella fascia alta di WinAnsi: tradurli cambierebbe il testo
    // senza motivo, e il trattino lungo separa le categorie CAD-RADS.
    expect(san("CAD-RADS 2 \u2014 lieve")).toBe("CAD-RADS 2 \u2014 lieve");
    expect(san("I\u00b1")).toBe("I\u00b1");
    expect(san("100 \u00b7 severa")).toBe("100 \u00b7 severa");
    expect(san("mL/min/1,73 m\u00b2")).toBe("mL/min/1,73 m\u00b2");
  });

  it("non lascia passare nulla che il font non sappia scrivere", () => {
    // La rete di sicurezza: meglio un carattere sbagliato che una riga
    // illeggibile fuori margine.
    for (const carattere of san("soglia \u2265 300 \u2192 \u4e2d")) {
      expect(carattere.charCodeAt(0)).toBeLessThanOrEqual(0xff);
    }
  });
});

describe("valori delle tabelle", () => {
  it("usa la virgola decimale", () => {
    expect(sanValore("1.2 mg/dL")).toBe("1,2 mg/dL");
    expect(sanValore("27.4")).toBe("27,4");
    expect(sanValore("0.5-1.0")).toBe("0,5-1,0");
  });

  it("non tocca date, frazioni e punti fuori dai numeri", () => {
    expect(sanValore("12/04/1950")).toBe("12/04/1950");
    expect(sanValore("150/85 mmHg")).toBe("150/85 mmHg");
    expect(sanValore("CAD-RADS 3/HRP")).toBe("CAD-RADS 3/HRP");
    expect(sanValore("Bruce. 8 min")).toBe("Bruce. 8 min");
  });
});
