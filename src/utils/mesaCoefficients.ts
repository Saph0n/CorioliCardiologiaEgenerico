/**
 * Coefficienti del MESA CHD Risk Score (McClelland 2015).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROVENIENZA DEI NUMERI — leggere prima di modificarli
 *
 *  McClelland RL, Jorgensen NW, Budoff M, et al. "10-Year Coronary Heart
 *  Disease Risk Prediction Using Coronary Artery Calcium and Traditional Risk
 *  Factors". J Am Coll Cardiol 2015;66:1643-1653, Tabella 2 (PMC4603537).
 *
 *  Riscontrati il 18 ottobre 2026 in tre modi:
 *   - voce per voce sulla Tabella 2 dell'articolo. Nella versione PMC le righe
 *     di colesterolo totale, HDL e terapia ipolipemizzante sono sfalsate di una
 *     riga rispetto alle etichette: l'ordine giusto si ricava dagli hazard
 *     ratio (HDL 0,99, protettivo; ipolipemizzanti 1,28 e 1,13) e coincide con
 *     quello del pacchetto CRAN `CVrisk` (`data-raw/score_coef.R`);
 *   - controllando che exp(β) dia l'hazard ratio stampato accanto, per ogni
 *     coefficiente (lo fa anche un test);
 *   - sul caso della Figura 2 (uomo ispanico di 70 anni, PAS 130 in terapia,
 *     CT 190, HDL 50, CAC 0): col CAC il calcolatore ufficiale dice 3,1%, e
 *     questi coefficienti danno 3,06%.
 *
 *  Uno scarto noto, non risolto: **senza CAC** lo stesso caso dà 8,6% con la
 *  Tabella 2, mentre lo screenshot del calcolatore online nella Figura 2 dice
 *  9,3%. Tornerebbe con una sopravvivenza di base di 0,99960 invece di
 *  0,99963, ma l'articolo stampa 0,99963 e non risulta un erratum: si tiene il
 *  valore pubblicato, come fa `CVrisk`. Il modello col CAC, che e' il motivo
 *  per cui il MESA si usa, torna.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Interruttore di sicurezza, come `SCORE2_COEFFICIENTS_VALIDATED`: rimetterlo a
 * `false` se si tocca un coefficiente senza riverificarlo.
 */
export const MESA_COEFFICIENTI_VERIFICATI = true;

/** Riferimento bibliografico mostrato accanto al risultato. */
export const MESA_FONTE = "McClelland et al., J Am Coll Cardiol 2015;66:1643-1653";

/**
 * Fascia d'eta' della coorte MESA. L'articolo e' esplicito: "the algorithm is
 * limited to this range".
 */
export const MESA_ETA_MIN = 45;
export const MESA_ETA_MAX = 84;

/**
 * I quattro gruppi della coorte MESA, come se li dichiaravano i partecipanti.
 * Per le altre etnie l'articolo dice che l'utilita' del modello non e' nota.
 */
export type EtniaMesa = "bianca" | "cinese" | "afroamericana" | "ispanica";

export const ETNIA_MESA_LABELS: Record<EtniaMesa, string> = {
  bianca: "Caucasica",
  cinese: "Cinese",
  afroamericana: "Afroamericana",
  ispanica: "Ispanica",
};

/** Etnia predefinita per un ambulatorio italiano; resta visibile e modificabile. */
export const ETNIA_MESA_PREDEFINITA: EtniaMesa = "bianca";

/**
 * Coefficienti β di un modello MESA. Le variabili entrano **non centrate**:
 * il rischio a 10 anni e' 1 − S(10)^exp(Σ β·x).
 */
export interface MesaCoefficienti {
  /** Eta' in anni. */
  eta: number;
  /** Sesso maschile (0/1); il riferimento e' femminile. */
  maschio: number;
  /** Etnie (0/1); il riferimento e' bianca non ispanica. */
  cinese: number;
  afroamericana: number;
  ispanica: number;
  diabete: number;
  /** Fumatore attuale: "ha fumato sigarette negli ultimi 30 giorni". */
  fumatore: number;
  /** Colesterolo totale in mg/dL. */
  colesteroloTotale: number;
  /** Colesterolo HDL in mg/dL. */
  hdl: number;
  terapiaIpolipemizzante: number;
  /** PA sistolica in mmHg. */
  pas: number;
  terapiaAntipertensiva: number;
  /** Infarto in un genitore, fratello o figlio, a qualunque eta'. */
  familiaritaInfarto: number;
  /** ln(Agatston + 1); solo nel modello col calcium score. */
  lnCac: number;
  /** Sopravvivenza di base a 10 anni, S(10). */
  sopravvivenzaBase: number;
}

/** Modello con i soli fattori di rischio tradizionali. */
export const MESA_SENZA_CAC: MesaCoefficienti = {
  eta: 0.0455,
  maschio: 0.7496,
  cinese: -0.5055,
  afroamericana: -0.2111,
  ispanica: -0.19,
  diabete: 0.5168,
  fumatore: 0.4732,
  colesteroloTotale: 0.0053,
  hdl: -0.014,
  terapiaIpolipemizzante: 0.2473,
  pas: 0.0085,
  terapiaAntipertensiva: 0.3381,
  familiaritaInfarto: 0.4522,
  lnCac: 0,
  sopravvivenzaBase: 0.99963,
};

/** Modello con i fattori di rischio e il calcium score. */
export const MESA_CON_CAC: MesaCoefficienti = {
  eta: 0.0172,
  maschio: 0.4079,
  cinese: -0.3475,
  afroamericana: 0.0353,
  ispanica: -0.0222,
  diabete: 0.3892,
  fumatore: 0.3717,
  colesteroloTotale: 0.0043,
  hdl: -0.0114,
  terapiaIpolipemizzante: 0.1206,
  pas: 0.0066,
  terapiaAntipertensiva: 0.2278,
  familiaritaInfarto: 0.3239,
  lnCac: 0.2743,
  sopravvivenzaBase: 0.99833,
};
