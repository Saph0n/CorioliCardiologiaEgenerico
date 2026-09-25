import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import AppNavbar from "./AppNavbar";
import { CheckPatientModalProvider } from "../contexts/CheckPatientModalContext";
import { UnsavedChangesProvider } from "../contexts/UnsavedChangesContext";

type DesktopShellProps = {
  children: React.ReactNode;
  navbar?: React.ReactNode;
};

/** Larghezza unica per navbar e contenuto — evita salti tra le pagine */
const SHELL_CLASS = "mx-auto w-full max-w-7xl px-6";

/**
 * Nella maschera della visita la navbar non c'e': al suo posto la pagina ha
 * una barra propria con il paziente e le azioni (`AddVisit`). La navbar
 * galleggiante occupava circa 100px in alto, a 1280x720 (un Full HD al 150%)
 * copriva il primo campo del referto, e mentre si scriveva nessuna delle sue
 * voci serviva: il nome del paziente invece usciva di schermo.
 */
function isMascheraVisita(pathname: string): boolean {
  return pathname.startsWith("/add-visit") || pathname.startsWith("/edit-visit");
}

export default function DesktopShell({ children, navbar }: DesktopShellProps) {
  const { pathname } = useLocation();
  const senzaNavbar = isMascheraVisita(pathname);

  // Ogni pagina si apre dall'alto. Il router non lo fa da solo: dopo aver
  // salvato una visita lunga la scheda del paziente si apriva gia' scorsa in
  // fondo, con la navbar sopra il contenuto.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <UnsavedChangesProvider>
      <CheckPatientModalProvider>
        {/* Lo sfondo sta su uno strato fisso dietro la pagina e non sulla
            pagina stessa: uno sfondo `fixed` su un elemento lungo si ridipinge
            a ogni scatto di rotella, uno strato fisso no. Fascia della navbar e
            riga del titolo usano la stessa classe (vedi `.sfondo-corioli`).
            `isolate` tiene lo strato sopra lo sfondo pieno del body: senza,
            lo `-z-10` finiva sotto e la sfumatura si vedeva solo nella riga
            del titolo e nella fascia della navbar, che si staccavano dal
            grigio della pagina come una striscia a parte. */}
        <div className="relative isolate min-h-finestra">
          <div aria-hidden="true" className="sfondo-corioli pointer-events-none fixed inset-0 -z-10" />
          {!senzaNavbar && (
            // Fascia larga quanto la finestra, piena fino sotto la pillola e
            // sfumata solo dopo: il contenuto che scorre sparisce prima di
            // arrivarle accanto. Ha lo sfondo della pagina, fermo rispetto
            // alla finestra, quindi non si vede dove finisce.
            <header className="sfondo-corioli sticky top-barra z-50 pt-2">
              <div className={SHELL_CLASS}>{navbar ?? <AppNavbar />}</div>
              <div
                aria-hidden="true"
                className="sfondo-corioli pointer-events-none absolute inset-x-0 top-full h-4 [mask-image:linear-gradient(to_bottom,black,transparent)]"
              />
            </header>
          )}

          <main className={`${senzaNavbar ? "pb-8" : "py-8"} ${SHELL_CLASS}`}>{children}</main>
        </div>
      </CheckPatientModalProvider>
    </UnsavedChangesProvider>
  );
}
