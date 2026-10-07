import type { CategoriaPa, ClasseBmi, RischioVita } from "../../utils/parametriVitali";

/**
 * Colori dei giudizi sui parametri, gli stessi nella maschera della visita e
 * nella scheda del paziente: verde del marchio per "nella norma", ambra per
 * "da tenere d'occhio", rosso per "oltre soglia". Classi scritte per intero:
 * Tailwind tiene solo quelle che trova nel sorgente.
 */

export const NEUTRO = "border-default-200 bg-white text-default-700";

export const COLORE_CATEGORIA_PA: Record<CategoriaPa, string> = {
  ipotensione: "border-amber-200 bg-amber-50 text-amber-800",
  ottimale: "border-brand-200 bg-brand-50 text-brand-800",
  normale: "border-brand-200 bg-brand-50 text-brand-800",
  "normale-alta": "border-amber-200 bg-amber-50 text-amber-800",
  "grado-1": "border-red-200 bg-red-50 text-red-700",
  "grado-2": "border-red-200 bg-red-50 text-red-700",
  "grado-3": "border-red-300 bg-red-100 text-red-800",
};

export const COLORE_BMI: Record<ClasseBmi, string> = {
  sottopeso: "border-amber-200 bg-amber-50 text-amber-800",
  normopeso: "border-brand-200 bg-brand-50 text-brand-800",
  sovrappeso: "border-amber-200 bg-amber-50 text-amber-800",
  "obesita-1": "border-red-200 bg-red-50 text-red-700",
  "obesita-2": "border-red-200 bg-red-50 text-red-700",
  "obesita-3": "border-red-300 bg-red-100 text-red-800",
};

export const COLORE_VITA: Record<RischioVita, string> = {
  normale: "border-brand-200 bg-brand-50 text-brand-800",
  aumentato: "border-amber-200 bg-amber-50 text-amber-800",
  "molto-aumentato": "border-red-200 bg-red-50 text-red-700",
};

export const ETICHETTA_VITA: Record<RischioVita, string> = {
  normale: "vita nella norma",
  aumentato: "vita: rischio aumentato",
  "molto-aumentato": "vita: rischio molto aumentato",
};

/** Le etichette alte 24px dei giudizi (maschera e scheda). */
export const CLASSE_ETICHETTA =
  "inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium tabular-nums";

/**
 * Tinte fisse per i parametri che da soli non hanno un giudizio (frequenza,
 * peso): azzurro e viola, lontani dal verde, dall'ambra e dal rosso che nei
 * tag accanto vogliono dire "nella norma", "da tenere d'occhio", "oltre
 * soglia".
 */
export const COLORE_FC = "border-sky-200 bg-sky-50 text-sky-800";
export const COLORE_PESO = "border-violet-200 bg-violet-50 text-violet-800";
export const COLORE_ESITO_POSITIVO = "border-amber-200 bg-amber-50 text-amber-800";
export const COLORE_ESITO_NEGATIVO = "border-brand-200 bg-brand-50 text-brand-800";
