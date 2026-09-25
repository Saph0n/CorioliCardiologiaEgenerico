/**
 * Calcolatori cardiologici.
 *
 * Regola condivisa a tutti i moduli: ogni funzione restituisce un risultato
 * **o `null`**, mai un valore approssimato quando gli input sono fuori dai
 * limiti di validita' della formula. I risultati vengono mostrati come
 * suggerimento accanto ai campi e non vengono mai scritti in automatico nel
 * referto: l'interpretazione resta del medico.
 */

import {
  SCORE2_COEFFICIENTS,
  SCORE2_COEFFICIENTS_VALIDATED,
  SCORE2_MAX_AGE,
  SCORE2_MIN_AGE,
  SCORE2_RECALIBRATION,
  type Score2Region,
} from "./score2Coefficients";
import {
  SCORE2_OP_COEFFICIENTS_VALIDATED,
  SCORE2_OP_MAX_AGE,
  SCORE2_OP_MIN_AGE,
} from "./score2OpCoefficients";

/** Esito di un calcolo: valore + unita' + fonte, oppure il motivo per cui non e' calcolabile. */
export interface CalcResult {
  value: number;
  /** Valore gia' formattato per la UI (virgola decimale). */
  display: string;
  unit: string;
  /** Riferimento della formula, mostrato in piccolo accanto al risultato. */
  source: string;
}

export type CalcOutcome =
  | { ok: true; result: CalcResult }
  | { ok: false; reason: string };

function fmt(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(".", ",");
}

function num(v: number | undefined | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ─── Assetto lipidico ────────────────────────────────────────────────────────

/** Conversione colesterolo mg/dL → mmol/L (fattore 38.67). */
export const CHOL_MGDL_TO_MMOL = 1 / 38.67;
/** Conversione trigliceridi mg/dL → mmol/L (fattore 88.57). */
export const TRIG_MGDL_TO_MMOL = 1 / 88.57;

/**
 * Colesterolo LDL stimato con la formula di Friedewald (valori in mg/dL):
 * LDL = totale − HDL − trigliceridi/5.
 *
 * Non valida con trigliceridi ≥ 400 mg/dL: in quel caso serve il dosaggio
 * diretto e la funzione non restituisce nulla.
 */
export function calcolaLdlFriedewald(
  colesteroloTotale: number | undefined,
  hdl: number | undefined,
  trigliceridi: number | undefined,
): CalcOutcome {
  const tot = num(colesteroloTotale);
  const h = num(hdl);
  const tg = num(trigliceridi);
  if (tot == null || h == null || tg == null) {
    return { ok: false, reason: "Servono colesterolo totale, HDL e trigliceridi." };
  }
  if (tg >= 400) {
    return {
      ok: false,
      reason: "Trigliceridi ≥ 400 mg/dL: Friedewald non applicabile, serve LDL diretto.",
    };
  }
  const ldl = tot - h - tg / 5;
  if (ldl <= 0) {
    return { ok: false, reason: "Valori non coerenti fra loro." };
  }
  return {
    ok: true,
    result: {
      value: ldl,
      display: fmt(ldl, 0),
      unit: "mg/dL",
      source: "Friedewald 1972 — non valida con TG ≥ 400 mg/dL",
    },
  };
}

/**
 * Colesterolo non-HDL (mg/dL): totale − HDL. E' la misura lipidica usata
 * dalle carte a stampa SCORE2 e un obiettivo terapeutico a se'; il modello
 * SCORE2 invece riceve totale e HDL separati (vedi `computeScore2`).
 */
export function calcolaNonHdl(
  colesteroloTotale: number | undefined,
  hdl: number | undefined,
): CalcOutcome {
  const tot = num(colesteroloTotale);
  const h = num(hdl);
  if (tot == null || h == null) {
    return { ok: false, reason: "Servono colesterolo totale e HDL." };
  }
  const nonHdl = tot - h;
  if (nonHdl <= 0) return { ok: false, reason: "Valori non coerenti fra loro." };
  return {
    ok: true,
    result: {
      value: nonHdl,
      display: fmt(nonHdl, 0),
      unit: "mg/dL",
      source: "Colesterolo totale − HDL",
    },
  };
}

/**
 * Rapporto colesterolo totale / HDL.
 *
 * Fasce di uso corrente: sotto 4 e' ottimale, fra 4 e 5 e' intermedio, sopra 5
 * segnala un profilo lipidico sfavorevole. Resta un descrittore del rapporto
 * fra le due frazioni, non una stima di rischio.
 */
export function calcolaRapportoCtHdl(
  colesteroloTotale: number | undefined,
  hdl: number | undefined,
): CalcOutcome {
  const tot = num(colesteroloTotale);
  const h = num(hdl);
  if (tot == null || h == null) {
    return { ok: false, reason: "Servono colesterolo totale e HDL." };
  }
  const r = tot / h;
  const fascia = r < 4 ? "ottimale" : r <= 5 ? "borderline" : "sfavorevole";
  return {
    ok: true,
    result: {
      value: r,
      display: fmt(r, 1),
      unit: "",
      source: `CT / HDL — ${fascia} (ottimale < 4, borderline 4-5, sfavorevole > 5)`,
    },
  };
}

/**
 * Rapporto trigliceridi / HDL, in mg/dL.
 *
 * Sotto 2 accompagna una buona sensibilita' insulinica; sopra 3,5 e' associato
 * a insulino-resistenza e a particelle LDL piccole e dense. E' un marcatore
 * indiretto: le fasce valgono per valori espressi in mg/dL, non in mmol/L.
 */
export function calcolaRapportoTgHdl(
  trigliceridi: number | undefined,
  hdl: number | undefined,
): CalcOutcome {
  const tg = num(trigliceridi);
  const h = num(hdl);
  if (tg == null || h == null) {
    return { ok: false, reason: "Servono trigliceridi e HDL." };
  }
  const r = tg / h;
  const fascia =
    r < 2
      ? "buona sensibilità insulinica"
      : r <= 3.5
        ? "intermedio"
        : "suggestivo di insulino-resistenza";
  return {
    ok: true,
    result: {
      value: r,
      display: fmt(r, 1),
      unit: "",
      source: `TG / HDL in mg/dL — ${fascia} (< 2 ottimale, 2-3,5 intermedio, > 3,5 a rischio)`,
    },
  };
}

// ─── Metabolismo ─────────────────────────────────────────────────────────────

/**
 * Indice HOMA-IR: (glicemia mg/dL × insulinemia µU/mL) / 405.
 * Valido solo su prelievo a digiuno.
 */
export function calcolaHomaIr(
  glicemia: number | undefined,
  insulina: number | undefined,
): CalcOutcome {
  const g = num(glicemia);
  const i = num(insulina);
  if (g == null || i == null) {
    return { ok: false, reason: "Servono glicemia e insulinemia a digiuno." };
  }
  const homa = (g * i) / 405;
  return {
    ok: true,
    result: {
      value: homa,
      display: fmt(homa, 2),
      unit: "",
      // La fascia di lettura non sta piu' qui: e' una soglia di riferimento
      // come le altre e vive in `rangeClinici` (`lab.homa`), cosi' l'indice si
      // presenta con la stessa etichetta colorata degli altri valori invece di
      // avere una frase tutta sua dentro la formula.
      source: "Matthews 1985, solo su prelievo a digiuno",
    },
  };
}

// ─── Funzione renale ─────────────────────────────────────────────────────────

/**
 * Filtrato glomerulare stimato con CKD-EPI 2021 (senza il coefficiente etnico).
 * Creatininemia in mg/dL.
 */
export function calcolaEgfrCkdEpi(
  creatinina: number | undefined,
  eta: number | undefined,
  sesso: "M" | "F" | undefined,
): CalcOutcome {
  const scr = num(creatinina);
  const age = num(eta);
  if (scr == null || age == null || (sesso !== "M" && sesso !== "F")) {
    return { ok: false, reason: "Servono creatininemia, età e sesso del paziente." };
  }
  const k = sesso === "F" ? 0.7 : 0.9;
  const alpha = sesso === "F" ? -0.241 : -0.302;
  const ratio = scr / k;
  const egfr =
    142 *
    Math.pow(Math.min(ratio, 1), alpha) *
    Math.pow(Math.max(ratio, 1), -1.2) *
    Math.pow(0.9938, age) *
    (sesso === "F" ? 1.012 : 1);
  return {
    ok: true,
    result: {
      value: egfr,
      display: fmt(egfr, 0),
      unit: "mL/min/1,73 m²",
      source: "CKD-EPI 2021 (senza coefficiente etnico)",
    },
  };
}

/**
 * Clearance della creatinina secondo Cockcroft-Gault (mL/min).
 *
 * Sta accanto al CKD-EPI e non al suo posto, perche' rispondono a due domande
 * diverse. Il CKD-EPI stadia la malattia renale ed e' normalizzato per
 * superficie corporea; le schede tecniche degli anticoagulanti orali diretti
 * fissano invece le soglie di riduzione della dose sulla **clearance secondo
 * Cockcroft-Gault**, che il peso lo usa davvero.
 *
 * I due numeri divergono proprio dove la decisione conta: nell'anziano magro
 * il CKD-EPI e' piu' generoso, e usarlo al posto della clearance porta a
 * lasciare la dose piena a chi andrebbe ridotto.
 *
 * Creatininemia in mg/dL, peso in kg.
 */
export function calcolaClearanceCockcroftGault(
  creatinina: number | undefined,
  eta: number | undefined,
  peso: number | undefined,
  sesso: "M" | "F" | undefined,
): CalcOutcome {
  const scr = num(creatinina);
  const age = num(eta);
  const kg = num(peso);
  if (scr == null || age == null || kg == null || (sesso !== "M" && sesso !== "F")) {
    return {
      ok: false,
      reason: "Servono creatininemia, età, peso corporeo e sesso del paziente.",
    };
  }
  if (scr <= 0 || kg <= 0 || age <= 0) {
    return { ok: false, reason: "Valori non validi per la formula." };
  }
  const clcr = (((140 - age) * kg) / (72 * scr)) * (sesso === "F" ? 0.85 : 1);
  return {
    ok: true,
    result: {
      value: clcr,
      display: fmt(clcr, 0),
      unit: "mL/min",
      source:
        "Cockcroft-Gault, con il peso corporeo: e' la clearance su cui le schede tecniche dei DOAC fissano le riduzioni di dose",
    },
  };
}

/** Stadio KDIGO della malattia renale cronica in base all'eGFR. */
export function stadioKdigo(egfr: number): string {
  if (egfr >= 90) return "G1";
  if (egfr >= 60) return "G2";
  if (egfr >= 45) return "G3a";
  if (egfr >= 30) return "G3b";
  if (egfr >= 15) return "G4";
  return "G5";
}

// ─── Elettrocardiogramma ─────────────────────────────────────────────────────

/**
 * QT corretto con la formula di Bazett: QTc = QT / √(RR), con RR = 60 / FC.
 * Poco affidabile agli estremi di frequenza (< 50 o > 100 bpm): il limite
 * viene riportato nella fonte mostrata accanto al risultato.
 */
export function calcolaQtcBazett(
  qtMs: number | undefined,
  frequenzaCardiaca: number | undefined,
): CalcOutcome {
  const qt = num(qtMs);
  const fc = num(frequenzaCardiaca);
  if (qt == null || fc == null) {
    return { ok: false, reason: "Servono QT (ms) e frequenza cardiaca (bpm)." };
  }
  const rr = 60 / fc;
  const qtc = qt / Math.sqrt(rr);
  const nota =
    fc < 50 || fc > 100
      ? "Bazett — poco affidabile fuori da 50-100 bpm"
      : "Bazett (QT / √RR)";
  return {
    ok: true,
    result: { value: qtc, display: fmt(qtc, 0), unit: "ms", source: nota },
  };
}

// ─── Esami dinamici ──────────────────────────────────────────────────────────

/**
 * Frequenza cardiaca massima teorica secondo la formula classica 220 − eta'.
 *
 * E' una stima di popolazione con una dispersione ampia sul singolo soggetto:
 * serve a dire se il test e' stato massimale o submassimale, non a fissare un
 * bersaglio di allenamento.
 */
export function calcolaFcMaxTeorica(eta: number | undefined): CalcOutcome {
  const age = num(eta);
  if (age == null) return { ok: false, reason: "Serve l'età del paziente." };
  const fc = 220 - age;
  if (fc <= 0) return { ok: false, reason: "Età fuori dai limiti della formula." };
  return {
    ok: true,
    result: {
      value: fc,
      display: fmt(fc, 0),
      unit: "bpm",
      source: "220 − età — stima di popolazione, ampia variabilità individuale",
    },
  };
}

/**
 * Percentuale della frequenza massima teorica raggiunta durante il test.
 * Sotto l'85% il test si considera submassimale.
 */
export function calcolaPercentualeFcMax(
  fcRaggiunta: number | undefined,
  eta: number | undefined,
): CalcOutcome {
  const fc = num(fcRaggiunta);
  const teorica = calcolaFcMaxTeorica(eta);
  if (fc == null || !teorica.ok) {
    return { ok: false, reason: "Servono la FC massima raggiunta e l'età." };
  }
  const pct = (fc / teorica.result.value) * 100;
  return {
    ok: true,
    result: {
      value: pct,
      display: fmt(pct, 0),
      unit: "% della FC max teorica",
      source:
        pct < 85
          ? "Sotto l'85%: test submassimale"
          : "Rispetto a 220 − età",
    },
  };
}

/**
 * Calo pressorio notturno (dipping) dalle medie diurna e notturna della
 * sistolica: (diurna − notturna) / diurna × 100.
 *
 * Sotto il 10% il profilo e' non-dipper; un valore negativo indica un profilo
 * riverso. E' un descrittore del tracciato, non una diagnosi.
 */
export function calcolaCaloNotturno(
  mediaDiurnaSist: number | undefined,
  mediaNotturnaSist: number | undefined,
): CalcOutcome {
  const diurna = num(mediaDiurnaSist);
  const notturna = num(mediaNotturnaSist);
  if (diurna == null || notturna == null) {
    return { ok: false, reason: "Servono le medie sistoliche diurna e notturna." };
  }
  const pct = ((diurna - notturna) / diurna) * 100;
  const profilo =
    pct < 0
      ? "profilo riverso"
      : pct < 10
        ? "non-dipper"
        : pct <= 20
          ? "dipper"
          : "dipper estremo";
  return {
    ok: true,
    result: {
      value: pct,
      display: fmt(pct, 1),
      unit: "%",
      source: `(diurna − notturna) / diurna — ${profilo}`,
    },
  };
}

// ─── SCORE2 ──────────────────────────────────────────────────────────────────

export interface Score2Input {
  eta: number;
  sesso: "M" | "F";
  fumatore: boolean;
  /** Pressione arteriosa sistolica (mmHg). */
  pas: number;
  /** Colesterolo totale (mg/dL). */
  colesteroloTotale: number;
  /** Colesterolo HDL (mg/dL). */
  hdl: number;
  region: Score2Region;
}

/** Categoria di rischio SCORE2 per fascia d'eta' (ESC 2021). */
export function categoriaRischioScore2(
  rischioPercentuale: number,
  eta: number,
): "basso-moderato" | "alto" | "molto-alto" {
  if (eta < 50) {
    if (rischioPercentuale < 2.5) return "basso-moderato";
    if (rischioPercentuale < 7.5) return "alto";
    return "molto-alto";
  }
  if (eta < 70) {
    if (rischioPercentuale < 5) return "basso-moderato";
    if (rischioPercentuale < 10) return "alto";
    return "molto-alto";
  }
  if (rischioPercentuale < 7.5) return "basso-moderato";
  if (rischioPercentuale < 15) return "alto";
  return "molto-alto";
}

/** Etichetta leggibile della categoria di rischio SCORE2. */
export const SCORE2_CATEGORIA_LABELS: Record<
  ReturnType<typeof categoriaRischioScore2>,
  string
> = {
  "basso-moderato": "Rischio basso-moderato",
  alto: "Rischio alto",
  "molto-alto": "Rischio molto alto",
};

/**
 * Soglia della categoria per la fascia d'eta', da mostrare accanto al
 * punteggio: senza di essa un "7%" non dice al lettore in che banda cade.
 */
export function sogliaCategoriaScore2(eta: number): string {
  if (eta < 50) return "< 50 anni: alto da 2,5%, molto alto da 7,5%";
  if (eta < 70) return "50-69 anni: alto da 5%, molto alto da 10%";
  return "dai 70 anni: alto da 7,5%, molto alto da 15%";
}

/**
 * Rischio cardiovascolare a 10 anni secondo SCORE2.
 *
 * Restituisce sempre `ok: false` finche' i coefficienti non sono stati
 * validati sulla fonte (vedi `score2Coefficients.ts`): la pipeline e' completa
 * e testabile, ma il numero non viene mostrato al medico.
 */
export function calcolaScore2(input: Partial<Score2Input>): CalcOutcome {
  const { eta, sesso, fumatore, pas, colesteroloTotale, hdl, region } = input;

  if (
    eta == null ||
    (sesso !== "M" && sesso !== "F") ||
    fumatore == null ||
    pas == null ||
    colesteroloTotale == null ||
    hdl == null ||
    region == null
  ) {
    return {
      ok: false,
      reason:
        "Servono età, sesso, abitudine al fumo, PA sistolica, colesterolo totale e HDL.",
    };
  }
  // Dai 70 anni il modello giusto e' SCORE2-OP: invece di fermarsi, la
  // funzione ci passa la mano, cosi' il medico legge perche' il numero manca e
  // non solo che manca.
  if (eta >= SCORE2_OP_MIN_AGE) {
    return calcolaScore2Op({ eta, sesso, fumatore, pas, colesteroloTotale, hdl, region });
  }
  if (eta < SCORE2_MIN_AGE || eta > SCORE2_MAX_AGE) {
    return {
      ok: false,
      reason: `SCORE2 è validato fra ${SCORE2_MIN_AGE} e ${SCORE2_MAX_AGE} anni.`,
    };
  }
  if (!SCORE2_COEFFICIENTS_VALIDATED) {
    return {
      ok: false,
      reason:
        "SCORE2 non attivo: i coefficienti del modello devono ancora essere validati sulla pubblicazione ESC 2021.",
    };
  }

  return { ok: true, result: computeScore2({ eta, sesso, fumatore, pas, colesteroloTotale, hdl, region }) };
}

/**
 * Calcolo puro, senza il controllo di validazione: usato dai test per
 * verificare la pipeline contro i casi di riferimento.
 */
export function computeScore2(input: Score2Input): CalcResult {
  const { eta, sesso, fumatore, pas, colesteroloTotale, hdl, region } = input;
  const c = SCORE2_COEFFICIENTS[sesso];

  // SCORE2 lavora in mmol/L e usa **colesterolo totale e HDL come predittori
  // separati**: il non-HDL compare solo sull'asse delle carte a stampa, dove
  // serve a ridurre due assi a uno. Passare qui il non-HDL sottostima il
  // predittore lineare di circa 1,3 mmol/L moltiplicati per il coefficiente.
  const totMmol = colesteroloTotale * CHOL_MGDL_TO_MMOL;
  const hdlMmol = hdl * CHOL_MGDL_TO_MMOL;

  const cAge = (eta - 60) / 5;
  const cSbp = (pas - 120) / 20;
  const cTchol = totMmol - 6;
  const cHdl = (hdlMmol - 1.3) / 0.5;
  const smoke = fumatore ? 1 : 0;

  const x =
    c.cAge * cAge +
    c.smoking * smoke +
    c.cSbp * cSbp +
    c.cTchol * cTchol +
    c.cHdl * cHdl +
    c.smokingXAge * smoke * cAge +
    c.cSbpXAge * cSbp * cAge +
    c.cTcholXAge * cTchol * cAge +
    c.cHdlXAge * cHdl * cAge;

  const uncalibrated = 1 - Math.pow(c.baselineSurvival, Math.exp(x));
  const { scale1, scale2 } = SCORE2_RECALIBRATION[region][sesso];
  const calibrated =
    1 - Math.exp(-Math.exp(scale1 + scale2 * Math.log(-Math.log(1 - uncalibrated))));
  const pct = calibrated * 100;

  return {
    value: pct,
    display: fmt(pct, 1),
    unit: "% a 10 anni",
    source: "SCORE2 (ESC 2021), regione di rischio selezionata",
  };
}

// ─── SCORE2-OP ───────────────────────────────────────────────────────────────

/**
 * Rischio cardiovascolare a 10 anni secondo SCORE2-OP (70-89 anni).
 *
 * Come `calcolaScore2`, non restituisce nulla finche' i coefficienti non sono
 * stati riscontrati sulla pubblicazione: vedi `score2OpCoefficients.ts`. La
 * differenza rispetto a SCORE2 non e' solo l'eta' — cambiano centratura,
 * termini di interazione e sopravvivenza di base — quindi non c'e' modo di
 * "adattare" il modello dei piu' giovani a un ottantenne.
 */
export function calcolaScore2Op(input: Partial<Score2Input>): CalcOutcome {
  const { eta, sesso, fumatore, pas, colesteroloTotale, hdl, region } = input;

  if (
    eta == null ||
    (sesso !== "M" && sesso !== "F") ||
    fumatore == null ||
    pas == null ||
    colesteroloTotale == null ||
    hdl == null ||
    region == null
  ) {
    return {
      ok: false,
      reason:
        "Servono età, sesso, abitudine al fumo, PA sistolica, colesterolo totale e HDL.",
    };
  }
  if (eta < SCORE2_OP_MIN_AGE || eta > SCORE2_OP_MAX_AGE) {
    return {
      ok: false,
      reason: `SCORE2-OP è validato fra ${SCORE2_OP_MIN_AGE} e ${SCORE2_OP_MAX_AGE} anni.`,
    };
  }
  if (!SCORE2_OP_COEFFICIENTS_VALIDATED) {
    return {
      ok: false,
      reason:
        "SCORE2-OP non attivo: i coefficienti del modello per i 70-89 anni devono ancora essere inseriti e verificati sulla pubblicazione ESC 2021.",
    };
  }

  // Il calcolo va qui quando i coefficienti ci saranno.
  return { ok: false, reason: "Coefficienti SCORE2-OP non disponibili." };
}
