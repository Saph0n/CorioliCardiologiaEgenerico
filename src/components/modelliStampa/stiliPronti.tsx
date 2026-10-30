import { Contrast, Palette } from "lucide-react";
import { NOMI_VARIANTE, type Variante } from "../../utils/modelliStampa";

/**
 * Pezzi in comune fra l'editor dei modelli e la scelta dello stile alla prima
 * configurazione: la scelta fra colori e bianco e nero, uguale nei due posti.
 *
 * Qui c'era anche la miniatura di uno stile, per la griglia della scheda
 * Aspetto: tolta il 29 ottobre 2026 insieme alla griglia, perche' i modelli
 * pronti si scelgono in un posto solo e l'anteprima vera sta accanto.
 */

/** A colori o in bianco e nero: due pulsanti grandi, uno acceso. */
export function SceltaVariante({
  valore,
  onScegli,
  grande = false,
}: {
  valore: Variante;
  onScegli: (v: Variante) => void;
  grande?: boolean;
}) {
  const voci: { valore: Variante; icona: typeof Palette }[] = [
    { valore: "colore", icona: Palette },
    { valore: "biancoNero", icona: Contrast },
  ];
  return (
    <div className="inline-flex rounded-xl bg-default-100 p-1" role="radiogroup" aria-label="Colori">
      {voci.map((v) => {
        const scelto = v.valore === valore;
        const Icona = v.icona;
        return (
          <button
            key={v.valore}
            type="button"
            role="radio"
            aria-checked={scelto}
            onClick={() => onScegli(v.valore)}
            className={[
              "inline-flex items-center gap-2 rounded-lg font-semibold transition-colors",
              grande ? "min-h-[48px] px-5 text-base" : "min-h-[44px] px-4 text-[15px]",
              scelto ? "bg-white text-gray-900 shadow-sm" : "text-default-600 hover:text-gray-900",
            ].join(" ")}
          >
            <Icona size={18} className={scelto && v.valore === "colore" ? "text-brand-600" : undefined} />
            {NOMI_VARIANTE[v.valore].replace(/^./, (c) => c.toUpperCase())}
          </button>
        );
      })}
    </div>
  );
}
