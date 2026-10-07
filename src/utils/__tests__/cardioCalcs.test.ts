import { describe, expect, it } from "vitest";
import { SCORE2_OP_COEFFICIENTS_VALIDATED } from "../score2OpCoefficients";
import {
  calcolaClearanceCockcroftGault,
  calcolaEgfrCkdEpi,
  calcolaHomaIr,
  calcolaLdlFriedewald,
  calcolaMassaVs,
  calcolaMassaVsIndicizzata,
  calcolaCaloNotturno,
  calcolaFcMaxTeorica,
  calcolaNonHdl,
  calcolaPercentualeFcMax,
  calcolaRapportoCtHdl,
  calcolaRapportoTgHdl,
  calcolaQtcBazett,
  calcolaQtcFramingham,
  calcolaQtcFridericia,
  calcolaQtcHodges,
  calcolaScore2,
  calcolaScore2Op,
  calcolaSpessoreParietaleRelativo,
  calcolaSuperficieCorporea,
  categoriaRischioScore2,
  computeScore2,
  stadioKdigo,
} from "../cardioCalcs";
import {
  SCORE2_COEFFICIENTS_VALIDATED,
  SCORE2_RECALIBRATION,
} from "../score2Coefficients";

describe("LDL secondo Friedewald", () => {
  it("calcola LDL = totale - HDL - TG/5", () => {
    const out = calcolaLdlFriedewald(200, 50, 150);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(120, 5);
  });

  it("rifiuta il calcolo con trigliceridi >= 400", () => {
    const out = calcolaLdlFriedewald(250, 40, 400);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("400");
  });

  it("non calcola se manca un valore", () => {
    expect(calcolaLdlFriedewald(200, undefined, 150).ok).toBe(false);
    expect(calcolaLdlFriedewald(undefined, 50, 150).ok).toBe(false);
    expect(calcolaLdlFriedewald(200, 50, undefined).ok).toBe(false);
  });

  it("rifiuta combinazioni incoerenti", () => {
    expect(calcolaLdlFriedewald(60, 50, 150).ok).toBe(false);
  });
});

describe("colesterolo non-HDL", () => {
  it("sottrae HDL dal totale", () => {
    const out = calcolaNonHdl(220, 55);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBe(165);
  });

  it("non calcola se HDL supera il totale", () => {
    expect(calcolaNonHdl(50, 60).ok).toBe(false);
  });
});

describe("HOMA-IR", () => {
  it("applica (glicemia x insulina) / 405", () => {
    const out = calcolaHomaIr(100, 10);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(2.469, 3);
  });

  it("richiede entrambi i valori", () => {
    expect(calcolaHomaIr(100, undefined).ok).toBe(false);
  });
});

describe("eGFR CKD-EPI 2021", () => {
  // Riferimenti calcolati con la formula pubblicata (senza coefficiente etnico).
  it("uomo 60 anni, creatinina 1.0 mg/dL", () => {
    const out = calcolaEgfrCkdEpi(1.0, 60, "M");
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeGreaterThan(80);
    if (out.ok) expect(out.result.value).toBeLessThan(95);
  });

  it("a parità di creatinina la donna ha eGFR più basso dell'uomo", () => {
    const uomo = calcolaEgfrCkdEpi(1.2, 55, "M");
    const donna = calcolaEgfrCkdEpi(1.2, 55, "F");
    expect(uomo.ok && donna.ok).toBe(true);
    if (uomo.ok && donna.ok) {
      expect(donna.result.value).toBeLessThan(uomo.result.value);
    }
  });

  it("l'eGFR cala al crescere della creatinina", () => {
    const a = calcolaEgfrCkdEpi(0.8, 50, "M");
    const b = calcolaEgfrCkdEpi(1.6, 50, "M");
    if (a.ok && b.ok) expect(b.result.value).toBeLessThan(a.result.value);
  });

  it("richiede sesso valido", () => {
    expect(calcolaEgfrCkdEpi(1.0, 60, undefined).ok).toBe(false);
  });
});

describe("stadio KDIGO", () => {
  it.each([
    [100, "G1"],
    [75, "G2"],
    [50, "G3a"],
    [35, "G3b"],
    [20, "G4"],
    [10, "G5"],
  ])("eGFR %s -> %s", (egfr, atteso) => {
    expect(stadioKdigo(egfr as number)).toBe(atteso);
  });
});

describe("QTc secondo Bazett", () => {
  it("a 60 bpm QTc coincide con QT", () => {
    const out = calcolaQtcBazett(400, 60);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(400, 5);
  });

  it("a frequenza alta il QTc supera il QT", () => {
    const out = calcolaQtcBazett(400, 100);
    if (out.ok) expect(out.result.value).toBeGreaterThan(400);
  });

  it("segnala il limite fuori dai 50-100 bpm", () => {
    const out = calcolaQtcBazett(400, 120);
    if (out.ok) expect(out.result.source).toContain("poco affidabile");
  });
});

describe("SCORE2", () => {
  const paziente = {
    eta: 55,
    sesso: "M" as const,
    fumatore: true,
    pas: 140,
    colesteroloTotale: 220,
    hdl: 45,
    region: "moderato" as const,
  };

  it("resta disattivato finche' i coefficienti non sono validati", () => {
    const out = calcolaScore2(paziente);
    if (!SCORE2_COEFFICIENTS_VALIDATED) {
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.reason).toContain("validati");
    } else {
      expect(out.ok).toBe(true);
    }
  });

  it("rifiuta le età fuori dal range di validità", () => {
    const out = calcolaScore2({ ...paziente, eta: 75 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("SCORE2-OP");
  });

  it("rifiuta gli input incompleti", () => {
    const out = calcolaScore2({ ...paziente, hdl: undefined });
    expect(out.ok).toBe(false);
  });

  // La pipeline di calcolo viene comunque verificata: i valori assoluti
  // dipendono dai coefficienti da validare, le relazioni no.
  it("produce una percentuale plausibile", () => {
    const r = computeScore2(paziente);
    expect(r.value).toBeGreaterThan(0);
    expect(r.value).toBeLessThan(100);
  });

  it("il fumo aumenta il rischio", () => {
    const fumatore = computeScore2(paziente);
    const nonFumatore = computeScore2({ ...paziente, fumatore: false });
    expect(fumatore.value).toBeGreaterThan(nonFumatore.value);
  });

  it("una pressione più alta aumenta il rischio", () => {
    const alta = computeScore2({ ...paziente, pas: 170 });
    const bassa = computeScore2({ ...paziente, pas: 120 });
    expect(alta.value).toBeGreaterThan(bassa.value);
  });

  it("un HDL più alto riduce il rischio", () => {
    const hdlBasso = computeScore2({ ...paziente, hdl: 35 });
    const hdlAlto = computeScore2({ ...paziente, hdl: 70 });
    expect(hdlAlto.value).toBeLessThan(hdlBasso.value);
  });

  it("l'età maggiore aumenta il rischio", () => {
    const giovane = computeScore2({ ...paziente, eta: 45 });
    const anziano = computeScore2({ ...paziente, eta: 65 });
    expect(anziano.value).toBeGreaterThan(giovane.value);
  });

  it("le regioni a rischio più alto danno percentuali più alte", () => {
    const basso = computeScore2({ ...paziente, region: "basso" });
    const moltoAlto = computeScore2({ ...paziente, region: "molto_alto" });
    expect(moltoAlto.value).toBeGreaterThan(basso.value);
  });
});

describe("categorie di rischio SCORE2 per età", () => {
  it("sotto i 50 anni la soglia di rischio alto è 2,5%", () => {
    expect(categoriaRischioScore2(2.4, 45)).toBe("basso-moderato");
    expect(categoriaRischioScore2(2.6, 45)).toBe("alto");
    expect(categoriaRischioScore2(8, 45)).toBe("molto-alto");
  });

  it("fra 50 e 69 anni la soglia è 5%", () => {
    expect(categoriaRischioScore2(4.9, 60)).toBe("basso-moderato");
    expect(categoriaRischioScore2(6, 60)).toBe("alto");
    expect(categoriaRischioScore2(12, 60)).toBe("molto-alto");
  });

  it("dai 70 anni in su la soglia è 7,5%", () => {
    expect(categoriaRischioScore2(7, 72)).toBe("basso-moderato");
    expect(categoriaRischioScore2(10, 72)).toBe("alto");
    expect(categoriaRischioScore2(20, 72)).toBe("molto-alto");
  });
});

/**
 * Casi di riferimento calcolati a parte dalle formule pubblicate (vedi la nota
 * di provenienza in `score2Coefficients.ts`). Servono a inchiodare il modello:
 * se qualcuno tocca un coefficiente, una centratura o la conversione delle
 * unita', questi numeri cambiano e il test lo dice.
 *
 * I colesteroli sono espressi in mg/dL partendo dai valori in mmol/L usati nel
 * calcolo di riferimento, così la conversione non introduce scarti.
 */
describe("SCORE2 — casi di riferimento", () => {
  const MMOL = 38.67;

  it("uomo di 50 anni, fumatore, regione a rischio moderato", () => {
    const out = computeScore2({
      eta: 50,
      sesso: "M",
      fumatore: true,
      pas: 140,
      colesteroloTotale: 6.3 * MMOL,
      hdl: 1.4 * MMOL,
      region: "moderato",
    });
    expect(out.value).toBeCloseTo(8.11, 1);
  });

  it("donna di 60 anni, non fumatrice, regione a rischio moderato", () => {
    const out = computeScore2({
      eta: 60,
      sesso: "F",
      fumatore: false,
      pas: 130,
      colesteroloTotale: 5.5 * MMOL,
      hdl: 1.6 * MMOL,
      region: "moderato",
    });
    expect(out.value).toBeCloseTo(3.73, 1);
  });

  it("usa il colesterolo totale, non il non-HDL", () => {
    // Due pazienti con lo stesso non-HDL (160 mg/dL) ma colesterolo totale
    // diverso devono ricevere punteggi diversi: se il modello ricevesse il
    // non-HDL, il termine lipidico sarebbe identico e a distinguerli
    // resterebbe il solo effetto dell'HDL, con uno scarto molto piu' piccolo.
    const base = {
      eta: 55,
      sesso: "M" as const,
      fumatore: false,
      pas: 130,
      region: "moderato" as const,
    };
    const totaleBasso = computeScore2({ ...base, colesteroloTotale: 200, hdl: 40 });
    const totaleAlto = computeScore2({ ...base, colesteroloTotale: 240, hdl: 80 });
    expect(totaleAlto.value).not.toBeCloseTo(totaleBasso.value, 2);
  });

  it("la regione moderata e quella alta hanno ricalibrazioni distinte", () => {
    // Erano state trascritte uguali per le donne: l'Italia e' regione moderata,
    // quindi l'errore ricadeva su tutte le pazienti.
    expect(SCORE2_RECALIBRATION.moderato.F).not.toEqual(
      SCORE2_RECALIBRATION.alto.F,
    );
    expect(SCORE2_RECALIBRATION.moderato.M).not.toEqual(
      SCORE2_RECALIBRATION.alto.M,
    );
  });

  it("la regione moderata da' un rischio più basso di quella alta", () => {
    const paziente = {
      eta: 60,
      sesso: "F" as const,
      fumatore: false,
      pas: 130,
      colesteroloTotale: 212,
      hdl: 62,
    };
    expect(
      computeScore2({ ...paziente, region: "moderato" }).value,
    ).toBeLessThan(computeScore2({ ...paziente, region: "alto" }).value);
  });
});

describe("frequenza cardiaca massima teorica", () => {
  it("applica 220 - età", () => {
    const out = calcolaFcMaxTeorica(60);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBe(160);
  });

  it("non calcola senza età", () => {
    expect(calcolaFcMaxTeorica(undefined).ok).toBe(false);
  });

  it("segnala il test submassimale sotto l'85%", () => {
    const out = calcolaPercentualeFcMax(120, 60);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.value).toBeCloseTo(75, 5);
      expect(out.result.source).toContain("submassimale");
    }
  });

  it("non segnala nulla di anomalo quando il test è massimale", () => {
    const out = calcolaPercentualeFcMax(150, 60);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.source).not.toContain("submassimale");
  });
});

describe("calo pressorio notturno", () => {
  it("calcola (diurna - notturna) / diurna", () => {
    const out = calcolaCaloNotturno(130, 117);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(10, 5);
  });

  it("riconosce il profilo non-dipper", () => {
    const out = calcolaCaloNotturno(130, 125);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.source).toContain("non-dipper");
  });

  it("riconosce il profilo riverso quando la notturna supera la diurna", () => {
    const out = calcolaCaloNotturno(120, 130);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.value).toBeLessThan(0);
      expect(out.result.source).toContain("riverso");
    }
  });

  it("non calcola con una sola delle due medie", () => {
    expect(calcolaCaloNotturno(130, undefined).ok).toBe(false);
  });
});

describe("rapporto colesterolo totale / HDL", () => {
  it("divide il totale per l'HDL", () => {
    const out = calcolaRapportoCtHdl(200, 50);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(4, 5);
  });

  it("colloca il valore nella fascia giusta", () => {
    const ottimale = calcolaRapportoCtHdl(180, 60);
    const borderline = calcolaRapportoCtHdl(200, 45);
    const sfavorevole = calcolaRapportoCtHdl(240, 40);
    if (ottimale.ok) expect(ottimale.result.source).toContain("ottimale");
    if (borderline.ok) expect(borderline.result.source).toContain("borderline");
    if (sfavorevole.ok) expect(sfavorevole.result.source).toContain("sfavorevole");
  });

  it("non calcola senza uno dei due valori", () => {
    expect(calcolaRapportoCtHdl(200, undefined).ok).toBe(false);
    expect(calcolaRapportoCtHdl(undefined, 50).ok).toBe(false);
  });
});

describe("rapporto trigliceridi / HDL", () => {
  it("divide i trigliceridi per l'HDL", () => {
    const out = calcolaRapportoTgHdl(150, 50);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(3, 5);
  });

  it("sopra 3,5 richiama l'insulino-resistenza", () => {
    const out = calcolaRapportoTgHdl(220, 40);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.source).toContain("insulino-resistenza");
  });

  it("sotto 2 segnala la buona sensibilità insulinica", () => {
    const out = calcolaRapportoTgHdl(80, 60);
    if (out.ok) expect(out.result.source).toContain("sensibilità");
  });

  it("dichiara che le fasce valgono per i mg/dL", () => {
    const out = calcolaRapportoTgHdl(150, 50);
    if (out.ok) expect(out.result.source).toContain("mg/dL");
  });
});

describe("HOMA-IR", () => {
  // La fascia di lettura sta in `rangeClinici` (`lab.homa`) insieme alle altre
  // soglie di riferimento: qui resta solo la formula.
  it("dichiara che vale solo a digiuno", () => {
    const out = calcolaHomaIr(100, 15);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.source).toContain("digiuno");
  });
});

describe("SCORE2-OP", () => {
  const anziano = {
    eta: 75,
    sesso: "M" as const,
    fumatore: false,
    pas: 140,
    colesteroloTotale: 200,
    hdl: 50,
    region: "moderato" as const,
  };

  it("dai 70 anni SCORE2 passa la mano a SCORE2-OP", () => {
    // Prima diceva solo "oltre serve SCORE2-OP" e si fermava: ora nomina il
    // modello giusto e spiega perche' il numero non c'e' ancora.
    const out = calcolaScore2(anziano);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("SCORE2-OP non attivo");
  });

  it("non produce numeri finche' i coefficienti non sono verificati", () => {
    expect(SCORE2_OP_COEFFICIENTS_VALIDATED).toBe(false);
    const out = calcolaScore2Op(anziano);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("verificati");
  });

  it("rifiuta le età fuori dai 70-89 anni", () => {
    const out = calcolaScore2Op({ ...anziano, eta: 95 });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("70 e 89");
  });

  it("sotto i 70 anni resta in carico a SCORE2, che risponde", () => {
    const out = calcolaScore2({ ...anziano, eta: 65 });
    expect(out.ok).toBe(true);
  });
});

describe("clearance secondo Cockcroft-Gault", () => {
  // Serve alle soglie dei DOAC, che le schede tecniche scrivono su questa
  // clearance e non sull eGFR.
  it("applica la formula", () => {
    // (140 - 70) x 80 / (72 x 1) = 77,8 mL/min
    const out = calcolaClearanceCockcroftGault(1, 70, 80, "M");
    expect(out.ok).toBe(true);
    if (out.ok) expect(Math.round(out.result.value)).toBe(78);
  });

  it("applica il coefficiente femminile", () => {
    const uomo = calcolaClearanceCockcroftGault(1, 70, 80, "M");
    const donna = calcolaClearanceCockcroftGault(1, 70, 80, "F");
    expect(uomo.ok && donna.ok).toBe(true);
    if (uomo.ok && donna.ok) {
      expect(donna.result.value / uomo.result.value).toBeCloseTo(0.85, 5);
    }
  });

  it("diverge dal CKD-EPI nell anziano magro, che e il caso della riduzione di dose", () => {
    // Donna di 84 anni, 48 kg, creatinina 1,1: il CKD-EPI la colloca sopra i
    // 50 mL/min, la clearance sotto. E la fascia in cui l edoxaban va dimezzato.
    const clcr = calcolaClearanceCockcroftGault(1.1, 84, 48, "F");
    const egfr = calcolaEgfrCkdEpi(1.1, 84, "F");
    expect(clcr.ok && egfr.ok).toBe(true);
    if (clcr.ok && egfr.ok) {
      expect(clcr.result.value).toBeLessThan(50);
      expect(egfr.result.value).toBeGreaterThan(clcr.result.value);
    }
  });

  it("non calcola senza peso", () => {
    expect(calcolaClearanceCockcroftGault(1, 70, undefined, "M").ok).toBe(false);
  });
});

describe("massa del ventricolo sinistro", () => {
  it("applica Devereux con le misure in mm", () => {
    // 0,832 × (6,6³ − 4,8³) + 0,6 = 147,8 g
    const out = calcolaMassaVs(48, 9, 9);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(147.78, 1);
  });

  it("non calcola con misure che sembrano in cm", () => {
    const out = calcolaMassaVs(4.8, 0.9, 0.9);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("mm");
  });

  it("non calcola se manca una misura", () => {
    expect(calcolaMassaVs(48, 9, undefined).ok).toBe(false);
  });

  it("calcola la superficie corporea con Mosteller", () => {
    const out = calcolaSuperficieCorporea(70, 175);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(1.845, 3);
  });

  it("indicizza la massa per la superficie corporea", () => {
    const out = calcolaMassaVsIndicizzata(48, 9, 9, 70, 175);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(147.78 / 1.8447, 0);
  });

  it("senza peso o altezza dice cosa manca", () => {
    const out = calcolaMassaVsIndicizzata(48, 9, 9, 0, 175);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain("peso");
  });

  it("calcola lo spessore parietale relativo", () => {
    const out = calcolaSpessoreParietaleRelativo(48, 12);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.result.value).toBeCloseTo(0.5, 5);
  });
});

describe("QT corretto con le altre formule", () => {
  // QT 400 ms a 75 bpm: RR = 0,8 s.
  const valore = (out: ReturnType<typeof calcolaQtcFridericia>) =>
    out.ok ? out.result.value : Number.NaN;

  it("Fridericia divide per la radice cubica di RR", () => {
    expect(valore(calcolaQtcFridericia(400, 75))).toBeCloseTo(400 / Math.cbrt(0.8), 5);
    expect(valore(calcolaQtcFridericia(400, 75))).toBeCloseTo(430.9, 1);
  });

  it("Framingham aggiunge 154 × (1 − RR)", () => {
    expect(valore(calcolaQtcFramingham(400, 75))).toBeCloseTo(430.8, 5);
  });

  it("Hodges aggiunge 1,75 × (FC − 60)", () => {
    expect(valore(calcolaQtcHodges(400, 75))).toBeCloseTo(426.25, 5);
  });

  it("a 60 bpm tutte le formule restituiscono il QT misurato", () => {
    for (const f of [calcolaQtcBazett, calcolaQtcFridericia, calcolaQtcFramingham, calcolaQtcHodges]) {
      expect(valore(f(400, 60))).toBeCloseTo(400, 5);
    }
  });

  it("non calcolano senza frequenza", () => {
    expect(calcolaQtcFridericia(400, undefined).ok).toBe(false);
    expect(calcolaQtcFramingham(400, undefined).ok).toBe(false);
    expect(calcolaQtcHodges(400, undefined).ok).toBe(false);
  });
});
