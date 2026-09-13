import { describe, expect, it } from "vitest";
import {
  FASCE_HOMA_IR,
  ordinaSegnalati,
  scomponiPressione,
  valutaMisura,
  valutaPressione,
} from "../rangeClinici";

describe("soglie senza valore", () => {
  it("non segnala nulla quando la misura manca", () => {
    expect(valutaMisura("eco.fe", undefined).livello).toBe("nella-norma");
    expect(valutaMisura("eco.fe", Number.NaN).livello).toBe("nella-norma");
  });
});

describe("frazione di eiezione", () => {
  it("separa conservata, lievemente ridotta e ridotta", () => {
    expect(valutaMisura("eco.fe", 60).livello).toBe("nella-norma");
    expect(valutaMisura("eco.fe", 45).livello).toBe("attenzione");
    expect(valutaMisura("eco.fe", 35).livello).toBe("alterato");
  });

  it("segnala anche i valori ipercinetici", () => {
    expect(valutaMisura("eco.fe", 75).livello).toBe("attenzione");
  });

  it("porta con sé la soglia che ha superato", () => {
    expect(valutaMisura("eco.fe", 35).nota).toContain("40");
  });

  it("una FE di 40 è già funzione sistolica ridotta", () => {
    // Confine ESC 2021: il 40 appartiene alla fascia ridotta, ed e' lo stesso
    // taglio con cui `scompenso.ts` assegna il fenotipo HFrEF.
    expect(valutaMisura("eco.fe", 40).livello).toBe("alterato");
    expect(valutaMisura("eco.fe", 41).livello).toBe("attenzione");
  });
});

describe("QTc", () => {
  it("usa una soglia più alta per le donne", () => {
    expect(valutaMisura("ecg.qtc", 455, "M").livello).toBe("attenzione");
    expect(valutaMisura("ecg.qtc", 455, "F").livello).toBe("nella-norma");
  });

  it("segnala come alterato il prolungamento marcato", () => {
    expect(valutaMisura("ecg.qtc", 510, "F").livello).toBe("alterato");
  });

  it("segnala anche il QT corto", () => {
    expect(valutaMisura("ecg.qtc", 330, "M").livello).toBe("attenzione");
  });
});

describe("conduzione all'ECG", () => {
  it("riconosce il BAV di primo grado", () => {
    expect(valutaMisura("ecg.pr", 220).nota).toContain("BAV");
    expect(valutaMisura("ecg.pr", 160).livello).toBe("nella-norma");
  });

  it("riconosce il ritardo di conduzione intraventricolare", () => {
    expect(valutaMisura("ecg.qrs", 130).livello).toBe("attenzione");
    expect(valutaMisura("ecg.qrs", 100).livello).toBe("nella-norma");
  });
});

describe("spessori parietali", () => {
  it("applica il limite femminile più basso", () => {
    expect(valutaMisura("eco.siv", 10, "F").livello).toBe("attenzione");
    expect(valutaMisura("eco.siv", 10, "M").livello).toBe("nella-norma");
  });

  it("distingue l'ipertrofia severa", () => {
    expect(valutaMisura("eco.pp", 18, "M").livello).toBe("alterato");
  });
});

describe("laboratorio", () => {
  it("usa le soglie diagnostiche di glicemia e HbA1c", () => {
    expect(valutaMisura("lab.glicemia", 95).livello).toBe("nella-norma");
    expect(valutaMisura("lab.glicemia", 110).livello).toBe("attenzione");
    expect(valutaMisura("lab.glicemia", 130).livello).toBe("alterato");
    expect(valutaMisura("lab.hba1c", 6.8).livello).toBe("alterato");
  });

  it("stadia la funzione renale", () => {
    expect(valutaMisura("lab.egfr", 80).livello).toBe("nella-norma");
    expect(valutaMisura("lab.egfr", 50).livello).toBe("attenzione");
    expect(valutaMisura("lab.egfr", 25).livello).toBe("alterato");
  });

  it("stadia l'albuminuria", () => {
    expect(valutaMisura("lab.albuminuria", 15).livello).toBe("nella-norma");
    expect(valutaMisura("lab.albuminuria", 60).nota).toContain("A2");
    expect(valutaMisura("lab.albuminuria", 400).nota).toContain("A3");
  });

  it("usa il limite di emoglobina per sesso", () => {
    expect(valutaMisura("lab.emoglobina", 12.5, "F").livello).toBe("nella-norma");
    expect(valutaMisura("lab.emoglobina", 12.5, "M").livello).toBe("attenzione");
  });

  it("non trasforma la soglia LDL in un obiettivo terapeutico", () => {
    // Il target dipende dalla categoria di rischio e non viene deciso qui: la
    // nota deve restare descrittiva.
    const nota = valutaMisura("lab.ldl", 130).nota;
    expect(nota).toContain("riferimento");
    expect(nota).not.toMatch(/statin|terapia|target/i);
  });
});

describe("pressione arteriosa", () => {
  it("classifica per gradi secondo la coppia di valori", () => {
    expect(valutaPressione(120, 75).livello).toBe("nella-norma");
    expect(valutaPressione(135, 85).livello).toBe("attenzione");
    expect(valutaPressione(145, 85).nota).toContain("grado 1");
    expect(valutaPressione(165, 95).nota).toContain("grado 2");
    expect(valutaPressione(185, 100).nota).toContain("grado 3");
  });

  it("basta che uno dei due valori superi la soglia", () => {
    expect(valutaPressione(130, 95).nota).toContain("grado 1");
  });

  it("segnala l'ipotensione", () => {
    expect(valutaPressione(85, 55).nota).toContain("Ipotensione".toLowerCase());
  });

  it("non segnala nulla senza valori", () => {
    expect(valutaPressione(undefined, undefined).livello).toBe("nella-norma");
  });
});

describe("lettura della pressione scritta a mano", () => {
  it("scompone il formato sistolica/diastolica", () => {
    expect(scomponiPressione("140/85")).toEqual({
      sistolica: 140,
      diastolica: 85,
    });
    expect(scomponiPressione(" 140 / 85 ")).toEqual({
      sistolica: 140,
      diastolica: 85,
    });
  });

  it("restituisce vuoto su testo non interpretabile", () => {
    expect(scomponiPressione("centoquaranta")).toEqual({});
    expect(scomponiPressione(undefined)).toEqual({});
    expect(scomponiPressione("140")).toEqual({});
  });
});

describe("riepilogo dei valori segnalati", () => {
  it("tiene solo i fuori range, con gli alterati per primi", () => {
    const voci = [
      {
        etichetta: "FE",
        valore: "60%",
        segnale: valutaMisura("eco.fe", 60),
      },
      {
        etichetta: "Glicemia",
        valore: "110",
        segnale: valutaMisura("lab.glicemia", 110),
      },
      {
        etichetta: "eGFR",
        valore: "25",
        segnale: valutaMisura("lab.egfr", 25),
      },
    ];
    const ordinati = ordinaSegnalati(voci);
    expect(ordinati.map((v) => v.etichetta)).toEqual(["eGFR", "Glicemia"]);
  });
});

describe("pannello lipidico esteso", () => {
  it("segnala la Lp(a) oltre la soglia di rischio molto elevato", () => {
    expect(valutaMisura("lab.lpa", 30).livello).toBe("nella-norma");
    expect(valutaMisura("lab.lpa", 90).livello).toBe("attenzione");
    const alta = valutaMisura("lab.lpa", 200);
    expect(alta.livello).toBe("alterato");
    expect(alta.nota).toContain("180");
  });

  it("segnala l'ApoB elevata senza fissarle un obiettivo", () => {
    expect(valutaMisura("lab.apoB", 90).livello).toBe("nella-norma");
    const nota = valutaMisura("lab.apoB", 140).nota;
    expect(nota).toContain("130");
    // L'obiettivo dipende dalla classe di rischio e non viene deciso qui.
    expect(nota).not.toMatch(/obiettivo|target/i);
  });
});

describe("pannello metabolico contestuale", () => {
  it("usa il range indicativo delle transaminasi", () => {
    expect(valutaMisura("lab.ast", 25).livello).toBe("nella-norma");
    expect(valutaMisura("lab.alt", 60).livello).toBe("attenzione");
    expect(valutaMisura("lab.alt", 200).livello).toBe("alterato");
  });

  it("dichiara che il riferimento delle transaminasi è indicativo", () => {
    expect(valutaMisura("lab.ast", 60).nota).toContain("indicativo");
  });

  it("applica i limiti di uricemia distinti per sesso", () => {
    expect(valutaMisura("lab.uricemia", 6.5, "M").livello).toBe("nella-norma");
    expect(valutaMisura("lab.uricemia", 6.5, "F").livello).toBe("attenzione");
    expect(valutaMisura("lab.uricemia", 2.0, "F").livello).toBe("attenzione");
  });

  it("segnala il TSH fuori dal riferimento in entrambe le direzioni", () => {
    expect(valutaMisura("lab.tsh", 2).livello).toBe("nella-norma");
    expect(valutaMisura("lab.tsh", 6).livello).toBe("attenzione");
    expect(valutaMisura("lab.tsh", 0.2).livello).toBe("attenzione");
    expect(valutaMisura("lab.tsh", 15).livello).toBe("alterato");
  });

  it("segnala anche la glicemia sotto il limite inferiore", () => {
    expect(valutaMisura("lab.glicemia", 85).livello).toBe("nella-norma");
    expect(valutaMisura("lab.glicemia", 60).livello).toBe("attenzione");
  });
});

describe("rapporti lipidici", () => {
  // Tabella indicata dal cardiologo:
  //   CT/HDL   < 4    ottimale | 4-5    borderline | > 5    a rischio
  //   TG/HDL   < 2    ottimale | 2-3,5  borderline | > 3,5  a rischio
  it("CT/HDL: separa ottimale, borderline e a rischio", () => {
    expect(valutaMisura("lab.ctHdl", 3.9).livello).toBe("nella-norma");
    expect(valutaMisura("lab.ctHdl", 4.5).livello).toBe("attenzione");
    expect(valutaMisura("lab.ctHdl", 6.3).livello).toBe("alterato");
  });

  it("CT/HDL: i bordi 4 e 5 cadono nella fascia borderline", () => {
    expect(valutaMisura("lab.ctHdl", 4).livello).toBe("attenzione");
    expect(valutaMisura("lab.ctHdl", 5).livello).toBe("attenzione");
    expect(valutaMisura("lab.ctHdl", 5.01).livello).toBe("alterato");
  });

  it("TG/HDL: separa ottimale, borderline e a rischio", () => {
    expect(valutaMisura("lab.tgHdl", 1.9).livello).toBe("nella-norma");
    expect(valutaMisura("lab.tgHdl", 2.8).livello).toBe("attenzione");
    expect(valutaMisura("lab.tgHdl", 4.2).livello).toBe("alterato");
  });

  it("TG/HDL: i bordi 2 e 3,5 cadono nella fascia borderline", () => {
    expect(valutaMisura("lab.tgHdl", 2).livello).toBe("attenzione");
    expect(valutaMisura("lab.tgHdl", 3.5).livello).toBe("attenzione");
    expect(valutaMisura("lab.tgHdl", 3.51).livello).toBe("alterato");
  });

  it("il rapporto TG/HDL dichiara che le fasce valgono in mg/dL", () => {
    // In mmol/L le soglie sono diverse: se il medico legge un referto in altre
    // unita' deve accorgersene dalla nota.
    expect(valutaMisura("lab.tgHdl", 4.2).nota).toContain("insulino-resistenza");
  });
});

describe("BMI", () => {
  it("assegna la fascia OMS corretta a ciascun livello", () => {
    expect(valutaMisura("vitali.bmi", 15).etichetta).toBe("sottopeso grave");
    expect(valutaMisura("vitali.bmi", 17).etichetta).toBe("sottopeso");
    expect(valutaMisura("vitali.bmi", 22).etichetta).toBe("normopeso");
    expect(valutaMisura("vitali.bmi", 27).etichetta).toBe("sovrappeso");
    expect(valutaMisura("vitali.bmi", 32).etichetta).toBe("obesità I");
    expect(valutaMisura("vitali.bmi", 37).etichetta).toBe("obesità II");
    expect(valutaMisura("vitali.bmi", 42).etichetta).toBe("obesità III");
  });

  it("i bordi delle fasce cadono in quella superiore", () => {
    expect(valutaMisura("vitali.bmi", 18.5).etichetta).toBe("normopeso");
    expect(valutaMisura("vitali.bmi", 24.9).etichetta).toBe("normopeso");
    expect(valutaMisura("vitali.bmi", 25).etichetta).toBe("sovrappeso");
    expect(valutaMisura("vitali.bmi", 30).etichetta).toBe("obesità I");
  });

  it("il normopeso resta `nella-norma`, sovrappeso e obesità salgono di livello", () => {
    expect(valutaMisura("vitali.bmi", 22).livello).toBe("nella-norma");
    expect(valutaMisura("vitali.bmi", 27).livello).toBe("attenzione");
    expect(valutaMisura("vitali.bmi", 32).livello).toBe("alterato");
    expect(valutaMisura("vitali.bmi", 17).livello).toBe("attenzione");
    expect(valutaMisura("vitali.bmi", 15).livello).toBe("alterato");
  });

  it("il normopeso non entra nell'elenco dei valori segnalati", () => {
    // Il riquadro del BMI e' sempre visibile e ha un colore anche quando il
    // valore e' giusto: il pannello di sintesi invece deve restare pulito.
    const voci = ordinaSegnalati([
      { etichetta: "BMI", valore: "22,0", segnale: valutaMisura("vitali.bmi", 22) },
      { etichetta: "BMI", valore: "32,0", segnale: valutaMisura("vitali.bmi", 32) },
    ]);
    expect(voci).toHaveLength(1);
    expect(voci[0].valore).toBe("32,0");
  });
});

describe("hs-PCR", () => {
  it("separa le tre fasce di rischio", () => {
    expect(valutaMisura("lab.hsPcr", 0.6).etichetta).toBe("basso");
    expect(valutaMisura("lab.hsPcr", 2).etichetta).toBe("intermedio");
    expect(valutaMisura("lab.hsPcr", 4).etichetta).toBe("alto");
  });

  it("sopra 10 non parla piu' di rischio ma di flogosi", () => {
    const s = valutaMisura("lab.hsPcr", 12);
    expect(s.etichetta).toBe("flogosi");
    expect(s.nota).toContain("ripetere");
  });
});

describe("HOMA-IR", () => {
  // Fasce indicate dal cardiologo: sono sei, e la borderline e la "probabile"
  // si distinguono di mezzo punto.
  it("segue le sei fasce indicate", () => {
    expect(valutaMisura("lab.homa", 0.8).etichetta).toBe("ottimale");
    expect(valutaMisura("lab.homa", 1.5).etichetta).toBe("nella norma");
    expect(valutaMisura("lab.homa", 2.2).etichetta).toBe("borderline");
    expect(valutaMisura("lab.homa", 2.7).etichetta).toBe("IR probabile");
    expect(valutaMisura("lab.homa", 3.4).etichetta).toBe("IR verosimile");
    expect(valutaMisura("lab.homa", 5.2).etichetta).toBe("marcatamente elevato");
  });

  it("le due fasce basse non accendono il semaforo", () => {
    expect(valutaMisura("lab.homa", 1.5).livello).toBe("nella-norma");
    expect(valutaMisura("lab.homa", 3).livello).toBe("alterato");
  });

  it("la tabella del pulsante i e' quella che assegna la fascia", () => {
    // Il medico legge lo schema dalla tabella e il valore riceve la fascia dal
    // semaforo: se le due cose divergessero, la tabella direbbe una soglia e
    // il campo ne applicherebbe un'altra.
    for (const fascia of FASCE_HOMA_IR) {
      expect(valutaMisura("lab.homa", fascia.da).etichetta).toBe(fascia.etichetta);
    }
  });
});
