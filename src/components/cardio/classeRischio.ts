import { CATEGORIA_RISCHIO_LABELS } from "../../utils/rischioCv";
import type { VoceRischio } from "../../utils/pazientiARischio";

/**
 * Colore e nome breve della classe di rischio, condivisi dalla riga della
 * colonna in dashboard e dalla tabella della pagina "Pazienti a rischio": lo
 * stesso elenco deve leggersi con gli stessi colori nei due posti.
 */

export interface ColoriClasse {
  /** Il pallino accanto alla classe, nella tabella. */
  pallino: string;
  /** Fondo e iniziali dell'avatar della riga. */
  avatar: string;
  /** I segmenti dell'LDL oltre l'obiettivo. */
  oltre: string;
  /**
   * I segmenti fino all'obiettivo, quando l'LDL lo supera: lo stesso colore
   * in trasparenza, che tiene la tinta. Il 200 della scala di Tailwind no:
   * l'ambra chiara tira al giallo.
   */
  entro: string;
  /** Lo scostamento scritto. */
  testo: string;
}

/**
 * Un colore per classe, e uno solo per riga: avatar, segmenti oltre
 * l'obiettivo e scostamento. Prima la striscia della classe era rosa, la barra
 * e il numero sempre arancioni, e la riga diceva la stessa cosa in due colori.
 * Rosso e ambra sono quelli della colonna delle gravidanze in ginecologia.
 */
export const COLORI_CLASSE: Record<VoceRischio["categoria"], ColoriClasse> = {
  "molto-alto-ricorrente": {
    pallino: "bg-red-600",
    avatar: "bg-red-100 text-red-800",
    oltre: "bg-red-600",
    entro: "bg-red-600/30",
    testo: "text-red-700",
  },
  "molto-alto": {
    pallino: "bg-red-500",
    avatar: "bg-red-50 text-red-700",
    oltre: "bg-red-500",
    entro: "bg-red-500/30",
    testo: "text-red-600",
  },
  alto: {
    pallino: "bg-amber-500",
    avatar: "bg-amber-50 text-amber-800",
    oltre: "bg-amber-500",
    entro: "bg-amber-500/35",
    testo: "text-amber-700",
  },
  moderato: {
    pallino: "bg-slate-400",
    avatar: "bg-slate-100 text-slate-600",
    oltre: "bg-slate-500",
    entro: "bg-slate-500/30",
    testo: "text-slate-700",
  },
  basso: {
    pallino: "bg-slate-400",
    avatar: "bg-slate-100 text-slate-600",
    oltre: "bg-slate-500",
    entro: "bg-slate-500/30",
    testo: "text-slate-700",
  },
};

/** La classe in due parole, senza il "Rischio " davanti. */
export function classeBreve(categoria: VoceRischio["categoria"]): string {
  return CATEGORIA_RISCHIO_LABELS[categoria]
    .replace("Rischio ", "")
    .replace("Molto alto con evento ricorrente entro 2 anni", "molto alto, recidiva");
}
