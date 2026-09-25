/**
 * Apostrofo ASCII → accento, nei testi che il medico legge a schermo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PERCHE' ESISTE
 *
 *  I modelli di referto erano scritti con l'apostrofo al posto dell'accento
 *  ("attivita' fisica"). Non serviva: Helvetica, il font standard di jsPDF,
 *  disegna le vocali accentate (vedi `san()` in `PdfService`). Con l'apostrofo
 *  "attivita'" era scritto male sia nella maschera sia nel referto stampato.
 *
 *  La conversione tocca **solo la tipografia**, mai il contenuto: per questo si
 *  puo' applicare anche a un modello che il medico ha modificato.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Apostrofi che NON sono accenti e vanno lasciati stare.
 *
 * - `po'` e' un troncamento di "poco": "pò" e' un errore, non una correzione.
 * - `E/e'` e' notazione ecocardiografica, l'apostrofo e' il "prime" della
 *   velocita' tissutale.
 * - Le elisioni (`l'`, `dell'`, `un'`) hanno una lettera subito dopo
 *   l'apostrofo, e le regole qui sotto richiedono un confine di parola.
 */
const TRONCAMENTI = new Set(["po", "mo", "be", "fa", "da", "di", "va", "sta"]);

/** Parole brevi da correggere una per una: nessuna regola generale le coglie. */
const PAROLE: Record<string, string> = {
  e: "è",
  eta: "età",
  piu: "più",
  puo: "può",
  gia: "già",
  cosi: "così",
  perche: "perché",
  poiche: "poiché",
  affinche: "affinché",
  ne: "né",
  se: "sé",
  te: "tè",
  caffe: "caffè",
  li: "lì",
  pero: "però",
  cioe: "cioè",
  cio: "ciò",
  meta: "metà",
  citta: "città",
  liberta: "libertà",
};

/** Mantiene la maiuscola iniziale della forma originale. */
function comeOriginale(originale: string, corretta: string): string {
  if (originale === originale.toUpperCase() && originale.length > 1) {
    return corretta.toUpperCase();
  }
  if (originale[0] === originale[0].toUpperCase()) {
    return corretta[0].toUpperCase() + corretta.slice(1);
  }
  return corretta;
}

/**
 * Converte gli apostrofi che stanno per un accento.
 *
 * Tre regole, in ordine: le parole in **-ità**, i futuri in **-rà** (sarà,
 * verrà, rivaluterà: in italiano una parola che finisce in "ra" seguita da
 * apostrofo a fine parola e' un futuro, non un troncamento), e l'elenco delle
 * parole brevi. Un apostrofo seguito da una lettera non viene toccato: e' una
 * elisione.
 */
export function correggiAccenti(testo: string): string {
  if (!testo || !testo.includes("'")) return testo;
  // Notazione ecocardiografica: si lascia il testo com'e'.
  if (testo.includes("E/e")) return testo;

  return testo.replace(
    /([A-Za-zÀ-ÿ]+)'(?![A-Za-zÀ-ÿ])/g,
    (intero, parola: string) => {
      const minuscola = parola.toLowerCase();
      if (TRONCAMENTI.has(minuscola)) return intero;

      const breve = PAROLE[minuscola];
      if (breve) return comeOriginale(parola, breve);

      if (minuscola.endsWith("ita")) {
        return parola.slice(0, -1) + comeOriginale(parola.slice(-1), "à");
      }
      if (minuscola.endsWith("ra")) {
        return parola.slice(0, -1) + comeOriginale(parola.slice(-1), "à");
      }
      return intero;
    },
  );
}
