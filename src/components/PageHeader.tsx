import { type ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  /**
   * Solo quando dice qualcosa che il titolo non dice: un conteggio, un
   * contesto. Frasi come "Cerca e gestisci i tuoi pazienti" sono state tolte.
   */
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * Testata delle pagine.
 *
 * Prima portava a sinistra un riquadro scuro con l'icona della pagina: era
 * l'elemento piu' scuro dello schermo, piu' del pulsante principale, e diceva
 * di nuovo quello che dice gia' la voce attiva del menu.
 *
 * Titolo e sottotitolo sono lo stesso carattere in due tagli (`font-titolo`
 * in tailwind.config.js), a 28/36 e 16/24. Prima erano 24px stretto a mano e
 * 14px: la data sotto al saluto della Home sembrava una didascalia, e il
 * saluto usciva piu' piccolo dei numeri delle card subito sotto (30px).
 * Lo scheletro di caricamento (`SkeletonPageHeader`) ha la stessa altezza.
 */
export function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-5 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div className="min-w-0">
          <h1 className="font-titolo text-[28px] leading-9 font-semibold text-foreground">
            {title}
          </h1>
          {subtitle && <p className="text-base text-default-600 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-3 w-full md:w-auto">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
