import { ArrowRight, Activity, Scale, HeartPulse } from "lucide-react";
import type { MotivoDaSeguire, Segnalazione, VoceDaSeguire } from "../../utils/pazientiDaSeguire";

/**
 * Colori per livello, uno solo per riga come nella colonna "Pazienti a
 * rischio" di Corioli Cardiologia: rosso, ambra, ardesia. Le classi sono
 * scritte per intero perche' Tailwind tiene solo quelle che trova nel
 * sorgente.
 */
export const COLORI_LIVELLO: Record<
  1 | 2 | 3,
  { avatar: string; testo: string; etichetta: string; pallino: string }
> = {
  3: {
    avatar: "bg-red-100 text-red-800",
    testo: "text-red-700",
    etichetta: "bg-red-50 text-red-700 border-red-200",
    pallino: "bg-red-600",
  },
  2: {
    avatar: "bg-amber-50 text-amber-800",
    testo: "text-amber-700",
    etichetta: "bg-amber-50 text-amber-800 border-amber-200",
    pallino: "bg-amber-500",
  },
  1: {
    avatar: "bg-slate-100 text-slate-700",
    testo: "text-slate-700",
    etichetta: "bg-slate-50 text-slate-700 border-slate-200",
    pallino: "bg-slate-400",
  },
};

const ICONA_MOTIVO: Record<MotivoDaSeguire, typeof Activity> = {
  pressione: HeartPulse,
  peso: Scale,
  ortostatismo: Activity,
};

/** "2026-03-12" → "12/03/2026". */
export function formattaData(iso?: string): string {
  if (!iso) return "—";
  const [a, m, g] = iso.slice(0, 10).split("-");
  return a && m && g ? `${g}/${m}/${a}` : iso;
}

/** Una segnalazione come etichetta: icona, valore, colore del suo livello. */
export function EtichettaSegnalazione({ s }: { s: Segnalazione }) {
  const Icona = ICONA_MOTIVO[s.motivo];
  return (
    <span
      title={`${s.valore}: ${s.dettaglio} (visita del ${formattaData(s.data)})`}
      className={`inline-flex h-5 shrink-0 items-center gap-1 rounded-md border px-1.5 text-xs font-medium tabular-nums ${COLORI_LIVELLO[s.livello].etichetta}`}
    >
      <Icona size={12} aria-hidden />
      {s.valore}
    </span>
  );
}

/**
 * Una riga della colonna "Pazienti da seguire" in dashboard: avatar tinto del
 * livello piu' alto, nome, a destra il motivo principale; sotto le etichette
 * di tutti i motivi, con il valore che li fa entrare in elenco.
 */
export function RigaPazienteDaSeguire({
  voce,
  nome,
  iniziali,
  onApri,
}: {
  voce: VoceDaSeguire;
  nome: string;
  iniziali: string;
  onApri: () => void;
}) {
  const colori = COLORI_LIVELLO[voce.livello];
  const principale = voce.segnalazioni[0];

  return (
    <div
      className="flex items-center gap-3 p-4 hover:bg-gray-50 transition-colors cursor-pointer group"
      onClick={onApri}
    >
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${colori.avatar}`}
      >
        {iniziali}
      </span>
      <div className="min-w-0 flex-1">
        {/* Il nome ha la precedenza: almeno meta' riga, poi si accorcia il
            motivo. Prima, a finestra stretta, restava "MORE..." accanto a
            "obesita' III, vita oltre soglia" intero. */}
        <div className="flex items-center gap-2">
          <p className="min-w-[50%] flex-1 truncate text-sm font-medium text-gray-900 group-hover:text-brand-600 transition-colors">
            {nome}
          </p>
          <span
            title={principale.dettaglio}
            className={`min-w-0 truncate text-xs font-semibold ${colori.testo}`}
          >
            {principale.dettaglio}
          </span>
        </div>
        {/* Alta 20px come la seconda riga delle altre due colonne: le righe
            delle tre colonne restano allineate. Le etichette che non ci
            stanno vanno a capo, nella riga nascosta, invece di restare
            tagliate a meta'. */}
        <div className="flex h-5 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-2 overflow-hidden">
          {voce.segnalazioni.map((s) => (
            <EtichettaSegnalazione key={s.motivo} s={s} />
          ))}
        </div>
      </div>
      <ArrowRight
        size={14}
        className="shrink-0 text-gray-300 group-hover:text-brand-600 transition-colors"
      />
    </div>
  );
}
