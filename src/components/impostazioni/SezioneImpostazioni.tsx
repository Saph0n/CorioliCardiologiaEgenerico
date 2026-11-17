import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

interface SezioneImpostazioniProps {
  /** Ancora della sezione, usata dall'indice e da `?sezione=` nell'URL. */
  id: string;
  icon: LucideIcon;
  titolo: string;
  /** Una riga: a cosa serve la sezione e, se ci sono dati, dove restano. */
  descrizione?: ReactNode;
  /** A destra della testata: stato (chip) e azioni della sezione. */
  extra?: ReactNode;
  /** `data-guida` della testata, per la guida di primo avvio. */
  guida?: string;
  corpoClassName?: string;
  children: ReactNode;
}

/**
 * Una sezione delle Impostazioni: stessa testata (icona, titolo, spiegazione)
 * e stessa card per tutte, così la pagina si legge come un documento solo.
 */
export function SezioneImpostazioni({
  id,
  icon: Icon,
  titolo,
  descrizione,
  extra,
  guida,
  corpoClassName = "flex flex-col gap-5 px-6 py-5",
  children,
}: SezioneImpostazioniProps) {
  const titoloId = `${id}-titolo`;
  return (
    <section
      id={id}
      aria-labelledby={titoloId}
      className="scroll-mt-32 overflow-hidden rounded-2xl border border-default-200 bg-white shadow-sm"
    >
      <header
        data-guida={guida}
        className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-default-100 px-6 py-5"
      >
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100"
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-60">
          <h2 id={titoloId} className="text-lg font-semibold leading-tight text-foreground">
            {titolo}
          </h2>
          {descrizione ? (
            <p className="mt-1 text-sm leading-relaxed text-default-500">{descrizione}</p>
          ) : null}
        </div>
        {extra ? <div className="flex flex-wrap items-center gap-2">{extra}</div> : null}
      </header>
      <div className={corpoClassName}>{children}</div>
    </section>
  );
}
