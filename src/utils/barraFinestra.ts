import { useEffect } from "react";

/**
 * Colori dei pulsanti riduci/ingrandisci/chiudi di Windows, che stanno sulla
 * riga del titolo disegnata da ogni schermata (vedi `BarraFinestra`): devono
 * essere quelli dello sfondo sotto di loro, se no fanno riquadro.
 */
type ColoriBarraFinestra = { sfondo: string; simboli: string };

export const COLORI_BARRA_APP: ColoriBarraFinestra = { sfondo: "#ffffff", simboli: "#475569" };
/** Il primo colore di `.corioli-auth-bg` (index.css), lo sfondo del PIN. */
export const COLORI_BARRA_ACCESSO: ColoriBarraFinestra = { sfondo: "#eaf6f2", simboli: "#475569" };
/** L'angolo in alto a destra della sfumatura della pagina di blocco. */
export const COLORI_BARRA_BLOCCO: ColoriBarraFinestra = { sfondo: "#1e293b", simboli: "#cbd5e1" };

type TitleBarApi = {
  setTitleBarColors?: (colors: { color: string; symbolColor: string }) => void;
};

/** `null`: la schermata lascia i colori a chi la contiene. */
export function useColoriBarraFinestra(colori: ColoriBarraFinestra | null) {
  const sfondo = colori?.sfondo;
  const simboli = colori?.simboli;
  useEffect(() => {
    if (!sfondo || !simboli) return;
    (window as unknown as { electronAPI?: TitleBarApi }).electronAPI?.setTitleBarColors?.({
      color: sfondo,
      symbolColor: simboli,
    });
  }, [sfondo, simboli]);
}
