import type { Visit } from "../types/Storage";

type DatiVisita = NonNullable<Visit["visita"]>;

/** Gli esami strumentali che la dashboard mostra come etichette. */
export type EsameStrumentale =
  | "ecg"
  | "ecocardiogramma"
  | "tcCoronarica"
  | "testErgometrico"
  | "holterEcg"
  | "holterPressorio"
  | "dopplerTsa";

/**
 * Nell'ordine in cui compaiono nella visita, con il nome corto che sta in
 * un'etichetta della dashboard ("Visite recenti").
 *
 * Fuori il laboratorio, che c'e' quasi sempre e non e' uno studio, e le due
 * valutazioni (scompenso, fibrillazione atriale), che sono punteggi e non
 * esami.
 */
const ESAMI: ReadonlyArray<EsameStrumentale> = [
  "ecg",
  "ecocardiogramma",
  "tcCoronarica",
  "testErgometrico",
  "holterEcg",
  "holterPressorio",
  "dopplerTsa",
];

export const NOME_ESAME: Record<EsameStrumentale, string> = {
  ecg: "ECG",
  ecocardiogramma: "Eco",
  tcCoronarica: "TC cor.",
  testErgometrico: "Ergometria",
  holterEcg: "Holter",
  holterPressorio: "Holter PA",
  dopplerTsa: "TSA",
};

/**
 * Un esame conta come fatto se il medico ci ha scritto almeno un valore o il
 * referto: lo stesso criterio con cui la maschera apre il modulo gia' aperto,
 * e con cui il salvataggio scarta i blocchi vuoti.
 */
function compilato(blocco: unknown): boolean {
  if (!blocco || typeof blocco !== "object") return false;
  return Object.values(blocco as Record<string, unknown>).some(
    (v) => v !== undefined && v !== null && (typeof v !== "string" || v.trim() !== ""),
  );
}

/**
 * Gli esami strumentali fatti in una o piu' visite (la dashboard raggruppa le
 * visite dello stesso paziente nello stesso giorno), senza doppioni e
 * nell'ordine della visita.
 */
export function esamiDelleVisite(
  visite: ReadonlyArray<Pick<Visit, "visita">>,
): EsameStrumentale[] {
  return ESAMI.filter((chiave) =>
    visite.some((v) => compilato(v.visita?.[chiave as keyof DatiVisita])),
  );
}
