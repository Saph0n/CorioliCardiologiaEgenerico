import { Activity, Bike, Gauge, Heart, ScanLine, Watch, Waves, type LucideIcon } from "lucide-react";
import { NOME_ESAME, type EsameStrumentale } from "../../utils/esamiVisita";

/**
 * Icona e colore di ogni esame strumentale, per famiglia: elettrici (ECG,
 * Holter) indaco, ultrasuoni (eco, Doppler TSA) azzurro, pressione viola,
 * sforzo ciano, TC fucsia.
 *
 * Niente rosso ne' ambra: nella stessa riga della dashboard c'e' la colonna
 * dei pazienti a rischio, dove quei due colori dicono la gravita' della classe
 * (`COLORI_CLASSE`). Un ECG rosso accanto si leggerebbe come un allarme.
 * Niente verde: e' il colore del marchio, riservato ai pulsanti principali.
 *
 * Le classi sono scritte per intero perche' Tailwind le trovi nel sorgente.
 */
const STILE: Record<EsameStrumentale, { icona: LucideIcon; classi: string }> = {
  ecg: { icona: Activity, classi: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  holterEcg: { icona: Watch, classi: "bg-indigo-50 text-indigo-700 ring-indigo-200" },
  ecocardiogramma: { icona: Heart, classi: "bg-sky-50 text-sky-700 ring-sky-200" },
  dopplerTsa: { icona: Waves, classi: "bg-sky-50 text-sky-700 ring-sky-200" },
  holterPressorio: { icona: Gauge, classi: "bg-violet-50 text-violet-700 ring-violet-200" },
  testErgometrico: { icona: Bike, classi: "bg-cyan-50 text-cyan-700 ring-cyan-200" },
  tcCoronarica: { icona: ScanLine, classi: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200" },
};

/**
 * Alta 20px: sta nella seconda riga di "Visite recenti", prima della data, e
 * quella riga e' alta 20px in tutte e due le colonne della dashboard. Il testo
 * resta a 12px.
 */
const BASE =
  "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

/** Etichetta di un esame strumentale fatto nella visita. */
export function EtichettaEsame({ esame }: { esame: EsameStrumentale }) {
  const { icona: Icona, classi } = STILE[esame];
  return (
    <span className={`${BASE} ${classi}`}>
      <Icona size={12} strokeWidth={2.25} aria-hidden />
      {NOME_ESAME[esame]}
    </span>
  );
}

/** "+2" quando gli esami non stanno tutti nella riga. */
export function EtichettaAltriEsami({ quanti }: { quanti: number }) {
  return (
    <span className={`${BASE} bg-slate-100 text-slate-600 ring-slate-200`}>
      +{quanti}
    </span>
  );
}
