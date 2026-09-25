import { COLORI_CLASSE } from "./classeRischio";
import { segmentiLdl, type VoceRischio } from "../../utils/pazientiARischio";

/** Segmenti spenti: il filetto delle card. */
const SPENTO = "bg-slate-200";
/** Fino all'obiettivo senza superarlo: il verde del marchio. */
const A_OBIETTIVO = "bg-brand-400";

/**
 * L'LDL di un paziente contro il suo obiettivo, a segmenti come le settimane
 * della colonna delle gravidanze in ginecologia.
 *
 * La tacca e' l'obiettivo e sta sempre a meta' (vedi `segmentiLdl`): in colonna
 * le tacche si allineano e fanno una riga sola, e cio' che la passa e' quanto
 * resta da togliere. Oltre la tacca il colore e' quello della classe, prima
 * della tacca la stessa tinta chiara; chi e' a obiettivo si ferma prima, in
 * verde. Senza esami resta spento: non si sa, e non deve sembrare zero.
 */
export function IndicatoreLdl({
  voce,
  segmenti = 20,
  className = "",
}: {
  voce: VoceRischio;
  /**
   * Pari: meta' prima della tacca, meta' dopo. Venti in una colonna della
   * dashboard fanno trattini da 12px; con quaranta erano pallini da 5.
   */
  segmenti?: number;
  className?: string;
}) {
  const pieni = segmentiLdl(voce, segmenti);
  const meta = Math.floor(segmenti / 2);
  const colori = COLORI_CLASSE[voce.categoria];
  const fuori = pieni != null && pieni.oltre > 0;

  const primaDellaTacca = (i: number) =>
    pieni && i < pieni.entro ? (fuori ? colori.entro : A_OBIETTIVO) : SPENTO;
  const dopoLaTacca = (i: number) => (pieni && i < pieni.oltre ? colori.oltre : SPENTO);

  const descrizione =
    voce.ldl == null
      ? `LDL non dosato, obiettivo sotto ${voce.obiettivo} mg/dL`
      : `LDL ${voce.fonteLdl === "stimato" ? "stimato " : ""}${Math.round(voce.ldl)} mg/dL, obiettivo sotto ${voce.obiettivo}` +
        (fuori ? `: ${Math.round(voce.scostamento!)} sopra` : ": a obiettivo");

  const meta1 = Array.from({ length: meta }, (_, i) => i);

  return (
    <div
      role="img"
      aria-label={descrizione}
      title={descrizione}
      className={`flex items-center ${className}`}
    >
      <div className="flex flex-1 gap-[3px]">
        {meta1.map((i) => (
          <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${primaDellaTacca(i)}`} />
        ))}
      </div>
      <span aria-hidden className="mx-1 h-3 w-0.5 shrink-0 rounded-full bg-slate-500" />
      <div className="flex flex-1 gap-[3px]">
        {meta1.map((i) => (
          <span key={i} className={`h-1.5 min-w-0 flex-1 rounded-full ${dopoLaTacca(i)}`} />
        ))}
      </div>
    </div>
  );
}
