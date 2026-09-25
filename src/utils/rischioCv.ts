/**
 * Classe di rischio cardiovascolare e obiettivi lipidici corrispondenti.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  CHI DECIDE LA CLASSE
 *
 *  La classe **non viene calcolata dall'app**: la attribuisce il medico in base
 *  all'anamnesi dei fattori di rischio, ed e' una scelta clinica che tiene
 *  conto di cose che il gestionale non conosce (eventi pregressi, familiarita',
 *  danno d'organo, comorbidita').
 *
 *  Una volta che il medico l'ha dichiarata, questo modulo si limita a cercare
 *  nella tabella delle linee guida l'obiettivo che le corrisponde. E' una
 *  consultazione, non una raccomandazione terapeutica: l'app dice "per la
 *  classe che hai indicato le linee guida pongono questo obiettivo", mai cosa
 *  prescrivere per raggiungerlo.
 *
 *  Fonte: ESC/EAS 2019 sulle dislipidemie, confermate dall'aggiornamento 2025.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { FattoriRischioCvData } from "../types/Storage";

/** Classi di rischio previste dalle linee guida, in ordine crescente. */
export type CategoriaRischioCv =
  | "basso"
  | "moderato"
  | "alto"
  | "molto-alto"
  | "molto-alto-ricorrente";

export const CATEGORIE_RISCHIO_CV: CategoriaRischioCv[] = [
  "basso",
  "moderato",
  "alto",
  "molto-alto",
  "molto-alto-ricorrente",
];

export const CATEGORIA_RISCHIO_LABELS: Record<CategoriaRischioCv, string> = {
  basso: "Rischio basso",
  moderato: "Rischio moderato",
  alto: "Rischio alto",
  "molto-alto": "Rischio molto alto",
  "molto-alto-ricorrente": "Molto alto con evento ricorrente entro 2 anni",
};

/**
 * Fattori di rischio cardiovascolare dichiarati dal medico nella visita.
 *
 * Stanno qui e non nella maschera perche' li usano in due: la maschera per
 * disegnare le caselle, il referto per stampare quelli spuntati accanto alla
 * classe di rischio. Sono le premesse da cui la classe discende, e un referto
 * che dichiara "rischio molto alto" senza mostrarle chiede di essere creduto
 * sulla parola.
 *
 * Il fumo non e' in questo elenco pur stando nello stesso pannello della
 * maschera: e' il campo "Fumatore" della visita, tenuto a tre stati perche'
 * alimenta SCORE2, dove "non rilevato" e "no" non coincidono. Una casella qui
 * dentro ne avrebbe due e perderebbe la differenza.
 */
export const FATTORI_RISCHIO_CV: {
  chiave: keyof FattoriRischioCvData;
  label: string;
}[] = [
  { chiave: "ipertensione", label: "Ipertensione arteriosa" },
  { chiave: "dislipidemia", label: "Dislipidemia" },
  { chiave: "diabete", label: "Diabete o prediabete" },
  { chiave: "familiaritaCad", label: "Familiarità per CAD precoce" },
  { chiave: "obesita", label: "Obesità" },
  { chiave: "sedentarieta", label: "Sedentarietà" },
  { chiave: "eventoCvPregresso", label: "Pregresso evento cardiovascolare" },
];

/** Obiettivo lipidico: soglia in mg/dL, con l'equivalente in mmol/L. */
export interface TargetLipidico {
  mgdl: number;
  mmol: number;
  /** `true` quando le linee guida lo danno come opzione da considerare. */
  opzionale?: boolean;
}

/**
 * Obiettivo di colesterolo LDL per classe di rischio.
 *
 * L'ultima riga e' presentata dalle linee guida come opzione considerabile e
 * non come raccomandazione piena: viene marcata perche' l'interfaccia lo dica.
 */
export const TARGET_LDL: Record<CategoriaRischioCv, TargetLipidico> = {
  basso: { mgdl: 116, mmol: 3.0 },
  moderato: { mgdl: 100, mmol: 2.6 },
  alto: { mgdl: 70, mmol: 1.8 },
  "molto-alto": { mgdl: 55, mmol: 1.4 },
  "molto-alto-ricorrente": { mgdl: 40, mmol: 1.0, opzionale: true },
};

/**
 * Obiettivo di apolipoproteina B per classe di rischio.
 *
 * Le linee guida non danno un obiettivo di ApoB per il rischio basso: la voce
 * manca di proposito e l'interfaccia deve dirlo invece di inventare un numero.
 */
export const TARGET_APOB: Partial<Record<CategoriaRischioCv, TargetLipidico>> = {
  moderato: { mgdl: 100, mmol: 0 },
  alto: { mgdl: 80, mmol: 0 },
  "molto-alto": { mgdl: 65, mmol: 0 },
  "molto-alto-ricorrente": { mgdl: 55, mmol: 0, opzionale: true },
};

/** Esito del confronto fra un valore misurato e l'obiettivo della sua classe. */
export interface EsitoTarget {
  /** Soglia di riferimento in mg/dL. */
  target: number;
  /** `true` se il valore misurato e' entro l'obiettivo. */
  aTarget: boolean;
  /** Quanto manca (positivo) o quanto avanza (negativo), in mg/dL. */
  scostamento: number;
  /** Frase pronta per l'interfaccia. */
  testo: string;
  /** L'obiettivo e' dato dalle linee guida come opzione da considerare. */
  opzionale: boolean;
}

function formatta(n: number): string {
  return Math.round(n).toString();
}

/**
 * Confronta un valore lipidico con l'obiettivo della classe dichiarata.
 * Restituisce `null` quando manca il valore, la classe, o quando per quella
 * classe le linee guida non fissano un obiettivo.
 */
export function confrontaConTarget(
  valore: number | undefined,
  categoria: CategoriaRischioCv | undefined,
  tabella: Partial<Record<CategoriaRischioCv, TargetLipidico>>,
): EsitoTarget | null {
  if (valore == null || !Number.isFinite(valore) || valore <= 0) return null;
  if (!categoria) return null;
  const target = tabella[categoria];
  if (!target) return null;

  const scostamento = valore - target.mgdl;
  const aTarget = scostamento <= 0;
  return {
    target: target.mgdl,
    aTarget,
    scostamento,
    opzionale: Boolean(target.opzionale),
    testo: aTarget
      ? `A obiettivo (< ${target.mgdl} mg/dL)`
      : `${formatta(scostamento)} mg/dL sopra l'obiettivo di ${target.mgdl} mg/dL`,
  };
}

/** Obiettivo LDL per la classe indicata. */
export function targetLdl(
  categoria: CategoriaRischioCv | undefined,
): TargetLipidico | null {
  return categoria ? TARGET_LDL[categoria] : null;
}

/** Obiettivo ApoB per la classe indicata, se le linee guida ne fissano uno. */
export function targetApoB(
  categoria: CategoriaRischioCv | undefined,
): TargetLipidico | null {
  return categoria ? (TARGET_APOB[categoria] ?? null) : null;
}

/** Descrizione dell'obiettivo LDL, con entrambe le unita'. */
export function descriviTargetLdl(categoria: CategoriaRischioCv): string {
  const t = TARGET_LDL[categoria];
  const base = `< ${t.mgdl} mg/dL (< ${String(t.mmol).replace(".", ",")} mmol/L)`;
  return t.opzionale ? `${base} — opzione considerabile` : base;
}
