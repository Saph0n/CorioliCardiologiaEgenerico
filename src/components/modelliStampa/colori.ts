/** I colori dei modelli in CSS, per miniature e pastiglie dell'editor. */

/** Le tinte della tavolozza come le stampa il PDF (vedi `COLORI` in PdfService). */
const COLORI_TAVOLOZZA: Record<string, string> = {
  nero: "#1f1f1f",
  blu: "#185fa5",
  verde: "#0f6e56",
  bordeaux: "#8c284b",
};

/** Il colore del modello in CSS: una tinta della tavolozza o il suo "#rrggbb". */
export function coloreCss(colore: string): string {
  return COLORI_TAVOLOZZA[colore] ?? (colore || COLORI_TAVOLOZZA.nero);
}

/**
 * Il fondo delle parti piene (banda dell'intestazione, sezioni su fascia
 * piena): il colore, o in bianco e nero il grigio scuro del PDF
 * (`coloreBanda` in PdfService).
 */
export function fondoPienoCss(colore: string): string {
  return colore === "nero" || !colore ? "#505050" : coloreCss(colore);
}

/** La tinta tenue del colore, come le fasce del PDF. */
export function tintaCss(colore: string): string {
  if (!colore || colore === "nero") return "#ebebeb";
  return `color-mix(in srgb, ${coloreCss(colore)} 13%, white)`;
}
