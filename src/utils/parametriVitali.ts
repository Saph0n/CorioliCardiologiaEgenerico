/**
 * Calcoli sui parametri vitali della visita: pressione arteriosa (media,
 * differenziale, classe), prova ortostatica, BMI, superficie corporea e
 * circonferenza vita.
 *
 * Funzioni pure, senza React: le usano la maschera della visita, il referto
 * PDF e la colonna "Pazienti da seguire" in dashboard, che devono dare lo
 * stesso numero per lo stesso paziente.
 *
 * Le soglie sono quelle delle linee guida citate accanto a ognuna. A
 * differenza dell'edizione di cardiologia non c'e' (ancora) un medico
 * referente che le abbia fissate: prima di cambiarle va chiesto a chi usa
 * l'app.
 */

import { validatePressioneArteriosa } from "./formValidation";

/**
 * Classi del BMI (OMS), categorie della pressione (ESC/ESH) e soglie della
 * circonferenza vita sono definite per l'adulto: sotto i 18 anni si leggono
 * sui percentili per eta' e sesso, che l'app non ha. Per un minore i valori si
 * mostrano senza giudizio e il paziente non entra fra quelli da seguire per
 * pressione o peso. Senza data di nascita si tratta come adulto.
 */
export const ETA_ADULTA = 18;

export function eAdulto(eta: number | null | undefined): boolean {
  return eta == null || eta >= ETA_ADULTA;
}

// ─── Pressione arteriosa ──────────────────────────────────────────────────

export interface Pressione {
  sistolica: number;
  diastolica: number;
}

/**
 * Posizione di una misurazione, come su Corioli Cardiologia: clinostatismo o
 * ortostatismo. Senza indicazione la prima misurazione e' in clino e la
 * seconda in orto, che e' il caso della prova ortostatica.
 */
export type PosizionePa = "clino" | "orto";

/** "120/80" → { 120, 80 }; `null` se il campo e' vuoto o non valido. */
export function parsePressione(value?: string | null): Pressione | null {
  const t = (value ?? "").trim();
  if (!t || validatePressioneArteriosa(t)) return null;
  const [s, d] = t.split("/").map((x) => parseInt(x.trim(), 10));
  return { sistolica: s, diastolica: d };
}

/**
 * "12080" diventa "120/80" uscendo dal campo: chi scrive di corsa la barra la
 * salta. Con cinque cifre la divisione e' ambigua ("12080" o "95100"): si
 * prende quella che da' una pressione valida, prima con la sistolica a tre
 * cifre. Se nessuna lo e', il testo resta com'e' e il campo segnala l'errore.
 */
export function normalizzaPressione(v: string): string {
  const t = v.trim();
  if (/^\d{4,6}$/.test(t)) {
    const tagli = t.length === 4 ? [2] : t.length === 6 ? [3] : [3, 2];
    for (const n of tagli) {
      const candidata = `${t.slice(0, n)}/${t.slice(n)}`;
      if (!validatePressioneArteriosa(candidata)) return candidata;
    }
    return t;
  }
  return t.replace(/\s*\/\s*/, "/");
}

/** Pressione arteriosa media: diastolica + un terzo della differenziale. */
export function pressioneMedia(pa: Pressione): number {
  return Math.round(pa.diastolica + (pa.sistolica - pa.diastolica) / 3);
}

/** Pressione differenziale (o pulsatoria): sistolica meno diastolica. */
export function pressioneDifferenziale(pa: Pressione): number {
  return pa.sistolica - pa.diastolica;
}

/**
 * Categoria della pressione misurata in ambulatorio secondo le linee guida
 * ESH 2023, le stesse di Corioli Cardiologia (`valutaPressione` sul branch
 * main) e della Societa' italiana dell'ipertensione: ottimale sotto 120/80,
 * normale fino a 129/84, normale-alta fino a 139/89, poi i tre gradi
 * dell'ipertensione. Basta uno dei due valori per salire di categoria. Sotto
 * 90 di sistolica, come in Cardiologia, ipotensione.
 *
 * Prima erano le categorie ESC 2024, che chiamano "elevata" gia' 120/80 (e
 * 115/72): Pablo, 8 ottobre 2026, "e' giusto che mi dica Elevata?". Per un
 * medico italiano 120/80 e' normale.
 */
export type CategoriaPa =
  | "ipotensione"
  | "ottimale"
  | "normale"
  | "normale-alta"
  | "grado-1"
  | "grado-2"
  | "grado-3";

export const ETICHETTA_CATEGORIA_PA: Record<CategoriaPa, string> = {
  ipotensione: "Ipotensione",
  ottimale: "Ottimale",
  normale: "Normale",
  "normale-alta": "Normale-alta",
  "grado-1": "Ipertensione grado 1",
  "grado-2": "Ipertensione grado 2",
  "grado-3": "Ipertensione grado 3",
};

export function categoriaPa(pa: Pressione): CategoriaPa {
  const grado = gradoPa(pa);
  if (grado > 0) return `grado-${grado}` as CategoriaPa;
  if (pa.sistolica >= 130 || pa.diastolica >= 85) return "normale-alta";
  if (pa.sistolica < 90) return "ipotensione";
  if (pa.sistolica >= 120 || pa.diastolica >= 80) return "normale";
  return "ottimale";
}

/**
 * Quanto e' alta una pressione da ipertensione, da 0 (sotto 140/90) a 3, con
 * i gradi ESH 2023: 1 fino a 159/99, 2 fino a 179/109, 3 da 180/110. Serve a
 * ordinare i pazienti da seguire; nel referto non si stampa.
 */
export function gradoPa(pa: Pressione): 0 | 1 | 2 | 3 {
  if (pa.sistolica >= 180 || pa.diastolica >= 110) return 3;
  if (pa.sistolica >= 160 || pa.diastolica >= 100) return 2;
  if (pa.sistolica >= 140 || pa.diastolica >= 90) return 1;
  return 0;
}

// ─── Prova ortostatica ────────────────────────────────────────────────────

/**
 * I campi della visita con le due misurazioni della pressione: la prima
 * (`pressioneArteriosa`, `frequenzaCardiaca`) e la seconda, facoltativa. Si
 * passa la visita cosi' com'e'.
 */
export interface CampiPressione {
  pressioneArteriosa?: string;
  posizionePa?: PosizionePa | "";
  frequenzaCardiaca?: string;
  pressioneArteriosa2?: string;
  posizionePa2?: PosizionePa | "";
  frequenzaCardiaca2?: string;
}

/** La posizione di ciascuna misurazione, con i valori di default. */
export function posizioni(v: CampiPressione): { prima: PosizionePa; seconda: PosizionePa } {
  return { prima: v.posizionePa || "clino", seconda: v.posizionePa2 || "orto" };
}

/** Se la seconda misurazione e' compilata. */
export function haSecondaMisura(v?: CampiPressione | null): boolean {
  return Boolean(
    v && ((v.pressioneArteriosa2 ?? "").trim() || (v.frequenzaCardiaca2 ?? "").trim()),
  );
}

export interface EsitoOrtostatismo {
  clino: { pa: Pressione; fc: number | null };
  orto: { pa: Pressione; fc: number | null };
  /** Quanto scende in piedi (0 se non scende). */
  caloSistolico: number;
  caloDiastolico: number;
  /** In piedi meno sdraiato: negativo vuol dire che scende. */
  deltaSistolica: number;
  deltaDiastolica: number;
  /** Variazione della FC in piedi, o `null` se manca una delle due. */
  deltaFc: number | null;
  /**
   * Calo sistolico di almeno 20 mmHg o diastolico di almeno 10 entro 3
   * minuti dall'alzata (consenso AAS/EFAS 2011, Freeman et al.).
   */
  ipotensioneOrtostatica: boolean;
  /**
   * Aumento della frequenza di almeno 30 bpm (40 fra 12 e 19 anni) senza
   * ipotensione ortostatica: e' il criterio emodinamico della tachicardia
   * posturale. La diagnosi chiede anche i sintomi, che qui non si vedono:
   * l'app lo segnala come reperto e non come diagnosi.
   */
  tachicardiaOrtostatica: boolean;
  /**
   * Aumento della FC diviso il calo sistolico, solo con un calo sistolico di
   * almeno 20 mmHg: sotto 0,5 orienta verso una forma neurogena
   * (Norcliffe-Kaufmann 2018). Con un calo piccolo (ipotensione data dalla
   * sola diastolica) il rapporto si gonfia e direbbe il contrario.
   */
  rapportoFcPas: number | null;
  /**
   * Misura in clino da 140/90 in su: in chi e' iperteso da sdraiato il
   * consenso 2011 indica come piu' appropriato un calo sistolico di 30.
   */
  ipertensioneInClino: boolean;
}

/** Frequenza cardiaca in bpm; `null` se vuota o fuori dai limiti del campo. */
export function parseFrequenza(value?: string | null): number | null {
  const t = (value ?? "").trim();
  if (!/^\d{2,3}$/.test(t)) return null;
  const n = parseInt(t, 10);
  return n >= 20 && n <= 250 ? n : null;
}

/**
 * La prova ortostatica: una misurazione in clino e una in orto, tutte e due
 * con una pressione valida. `null` se manca la seconda o se sono nella stessa
 * posizione (due misure in clino non sono una prova ortostatica).
 */
export function valutaOrtostatismo(
  v: CampiPressione | undefined | null,
  eta?: number | null,
): EsitoOrtostatismo | null {
  if (!v || !haSecondaMisura(v)) return null;
  const { prima, seconda } = posizioni(v);
  if (prima === seconda) return null;

  const misure = [
    { pa: parsePressione(v.pressioneArteriosa), fc: parseFrequenza(v.frequenzaCardiaca) },
    { pa: parsePressione(v.pressioneArteriosa2), fc: parseFrequenza(v.frequenzaCardiaca2) },
  ];
  const [clino, orto] = prima === "clino" ? misure : [misure[1], misure[0]];
  if (!clino.pa || !orto.pa) return null;

  const deltaSistolica = orto.pa.sistolica - clino.pa.sistolica;
  const deltaDiastolica = orto.pa.diastolica - clino.pa.diastolica;
  const deltaFc = clino.fc != null && orto.fc != null ? orto.fc - clino.fc : null;
  const caloSistolico = Math.max(0, -deltaSistolica);
  const caloDiastolico = Math.max(0, -deltaDiastolica);

  const ipotensioneOrtostatica = caloSistolico >= 20 || caloDiastolico >= 10;
  const sogliaFc = eta != null && eta >= 12 && eta <= 19 ? 40 : 30;
  const tachicardiaOrtostatica =
    !ipotensioneOrtostatica && deltaFc != null && deltaFc >= sogliaFc;
  const rapportoFcPas =
    ipotensioneOrtostatica && caloSistolico >= 20 && deltaFc != null
      ? Math.round((deltaFc / caloSistolico) * 100) / 100
      : null;

  return {
    clino: { pa: clino.pa, fc: clino.fc },
    orto: { pa: orto.pa, fc: orto.fc },
    caloSistolico,
    caloDiastolico,
    deltaSistolica,
    deltaDiastolica,
    deltaFc,
    ipotensioneOrtostatica,
    tachicardiaOrtostatica,
    rapportoFcPas,
    ipertensioneInClino: clino.pa.sistolica >= 140 || clino.pa.diastolica >= 90,
  };
}

// ─── Peso e misure corporee ───────────────────────────────────────────────

/**
 * BMI a un decimale. In centimetri e non in metri: 1,6 * 1,6 in virgola mobile
 * fa 2,5600000000000005, e 80 kg uscivano 31,2 invece di 31,25 → 31,3.
 */
export function calcolaBmi(pesoKg: number, altezzaCm: number): number | null {
  if (!(pesoKg > 0) || !(altezzaCm > 0)) return null;
  return Math.round((pesoKg * 100000) / (altezzaCm * altezzaCm)) / 10;
}

export type ClasseBmi =
  | "sottopeso"
  | "normopeso"
  | "sovrappeso"
  | "obesita-1"
  | "obesita-2"
  | "obesita-3";

/** Classi dell'OMS per l'adulto. */
export const ETICHETTA_CLASSE_BMI: Record<ClasseBmi, string> = {
  sottopeso: "Sottopeso",
  normopeso: "Normopeso",
  sovrappeso: "Sovrappeso",
  "obesita-1": "Obesità I",
  "obesita-2": "Obesità II",
  "obesita-3": "Obesità III",
};

export function classeBmi(bmi: number): ClasseBmi {
  if (bmi < 18.5) return "sottopeso";
  if (bmi < 25) return "normopeso";
  if (bmi < 30) return "sovrappeso";
  if (bmi < 35) return "obesita-1";
  if (bmi < 40) return "obesita-2";
  return "obesita-3";
}

/** 0 sotto 30, poi 1-3 come la classe di obesita'. */
export function gradoObesita(bmi: number): 0 | 1 | 2 | 3 {
  if (bmi >= 40) return 3;
  if (bmi >= 35) return 2;
  if (bmi >= 30) return 1;
  return 0;
}

/** Superficie corporea in m² con la formula di Mosteller. */
export function superficieCorporea(pesoKg: number, altezzaCm: number): number | null {
  if (!(pesoKg > 0) || !(altezzaCm > 0)) return null;
  return Math.round(Math.sqrt((pesoKg * altezzaCm) / 3600) * 100) / 100;
}

export type RischioVita = "normale" | "aumentato" | "molto-aumentato";

/**
 * Circonferenza vita secondo l'OMS (2008, popolazione europea): rischio
 * aumentato da 94 cm nell'uomo e 80 nella donna, molto aumentato da 102 e 88.
 * Senza sesso non si giudica: le soglie sono diverse.
 */
export function rischioCirconferenzaVita(
  cm: number,
  sesso?: "M" | "F" | null,
): RischioVita | null {
  if (!(cm > 0) || (sesso !== "M" && sesso !== "F")) return null;
  const [aumentato, moltoAumentato] = sesso === "M" ? [94, 102] : [80, 88];
  if (cm >= moltoAumentato) return "molto-aumentato";
  if (cm >= aumentato) return "aumentato";
  return "normale";
}

/** Rapporto vita/altezza: da 0,5 il grasso addominale e' in eccesso (NICE 2022). */
export function rapportoVitaAltezza(vitaCm: number, altezzaCm: number): number | null {
  if (!(vitaCm > 0) || !(altezzaCm > 0)) return null;
  return Math.round((vitaCm / altezzaCm) * 100) / 100;
}

/** Numero con la virgola decimale, come nel referto. */
export function conVirgola(n: number, decimali = 1): string {
  return n.toFixed(decimali).replace(".", ",");
}
