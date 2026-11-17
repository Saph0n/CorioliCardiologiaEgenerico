import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

/** Un gruppo della sezione Account Corioli: titoletto, una riga di spiegazione, le righe. */
export function GruppoAccount({
  titolo,
  spiegazione,
  children,
}: {
  titolo: string;
  spiegazione?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-default-400">{titolo}</h3>
      {spiegazione ? <p className="mt-1 text-xs leading-relaxed text-default-500">{spiegazione}</p> : null}
      <div className="mt-1 divide-y divide-default-100">{children}</div>
    </div>
  );
}

/** Una riga: icona, cosa è, a cosa serve, e a destra le azioni. */
export function RigaAccount({
  icon: Icon,
  titolo,
  descrizione,
  azioni,
  children,
}: {
  icon: LucideIcon;
  titolo: ReactNode;
  descrizione?: ReactNode;
  azioni?: ReactNode;
  /** Sotto la riga, a tutta larghezza (per esempio l'elenco dei computer). */
  children?: ReactNode;
}) {
  return (
    <div className="py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-default-100 text-default-600"
        >
          <Icon size={18} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 basis-52">
          <div className="text-sm font-medium text-foreground">{titolo}</div>
          {descrizione ? (
            <div className="mt-0.5 text-xs leading-relaxed text-default-500">{descrizione}</div>
          ) : null}
        </div>
        {azioni ? <div className="flex flex-wrap items-center gap-2">{azioni}</div> : null}
      </div>
      {children ? <div className="mt-3 pl-[3.25rem]">{children}</div> : null}
    </div>
  );
}
