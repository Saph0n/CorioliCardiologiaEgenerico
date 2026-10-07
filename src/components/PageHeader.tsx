import { type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  /**
   * Solo quando dice qualcosa che il titolo non dice: un conteggio, un
   * contesto. Frasi come "Cerca e gestisci i tuoi pazienti" sono state tolte.
   */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** L'icona della pagina, nel riquadro scuro a sinistra del titolo. */
  icon: LucideIcon;
}

/**
 * Testata delle pagine, uguale a quella di Corioli Ginecologia: riquadro
 * scuro con l'icona della pagina, titolo grande in grassetto, sottotitolo.
 *
 * Il riquadro era stato tolto nella revisione del 23 settembre 2026 (era
 * l'elemento piu' scuro dello schermo e ripeteva la voce attiva del menu). Il
 * 6 ottobre 2026 Pablo lo ha voluto di nuovo, prima sulla Home ("preferisco
 * come e' su ginecologia") e poi su tutte le pagine, perche' le testate
 * fossero coerenti con quella della Home. L'icona e' obbligatoria per lo
 * stesso motivo: una pagina nuova non puo' uscire con una testata diversa.
 *
 * Lo scheletro di caricamento (`SkeletonPageHeader`) ha la stessa altezza.
 */
export function PageHeader({ title, subtitle, actions, children, icon: Icona }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="p-3 rounded-xl bg-slate-800 text-white shrink-0">
            <Icona className="hidden md:block w-8 h-8" />
            <Icona className="md:hidden w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">
              {title}
            </h1>
            {subtitle && <p className="text-base text-default-500 mt-1">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex gap-3 w-full md:w-auto">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
