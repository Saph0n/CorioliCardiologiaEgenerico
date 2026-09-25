import { useEffect, useState } from "react";

type ApiFinestra = {
  riduci: () => void;
  ingrandisci: () => void;
  chiudi: () => void;
  ingrandita: () => Promise<boolean>;
  onIngrandita: (callback: (ingrandita: boolean) => void) => () => void;
};

/** Esposta dal preload solo su Windows. */
const API = (window as unknown as { electronAPI?: { finestra?: ApiFinestra } }).electronAPI
  ?.finestra;

/**
 * Se la pagina deve lasciare spazio alla barra: `main.tsx` mette la classe
 * `con-barra-finestra` su <html> prima del primo disegno (vedi index.css).
 */
export const BARRA_FINESTRA_ATTIVA = Boolean(API);

/**
 * Glifi di Windows (Segoe Fluent Icons su Windows 11, Segoe MDL2 Assets su
 * Windows 10): stessi segni dei pulsanti di sistema.
 */
const GLIFO = {
  riduci: String.fromCharCode(0xe921),
  ingrandisci: String.fromCharCode(0xe922),
  ripristina: String.fromCharCode(0xe923),
  chiudi: String.fromCharCode(0xe8bb),
};

const PULSANTE =
  "flex h-full w-[46px] items-center justify-center font-['Segoe_Fluent_Icons','Segoe_MDL2_Assets'] text-[10px] transition-colors duration-100 [-webkit-app-region:no-drag] [app-region:no-drag]";

/**
 * Barra del titolo della finestra. Su Windows quella di sistema e' nascosta
 * (`titleBarStyle: "hidden"` in electron/main.js) e i pulsanti riduci,
 * ingrandisci e chiudi li disegna questa barra. Si trascina per spostare la
 * finestra, doppio clic per ingrandirla, clic destro per il menu di sistema.
 *
 * Sta sopra a tutto, modal compresi, come la barra di sistema che sostituisce.
 * Fuori da Electron e su macOS non c'e'.
 */
export default function BarraFinestra() {
  const [ingrandita, setIngrandita] = useState(false);
  const [attiva, setAttiva] = useState(() => document.hasFocus());

  useEffect(() => {
    if (!API) return;
    void API.ingrandita().then(setIngrandita).catch(() => {});
    const smetti = API.onIngrandita(setIngrandita);
    // Finestra in secondo piano: segni piu' chiari, come fa Windows. Il fuoco
    // dentro un iframe (anteprima del PDF) toglie il fuoco alla pagina ma non
    // alla finestra, e `hasFocus()` lo sa.
    const aggiorna = () => window.setTimeout(() => setAttiva(document.hasFocus()), 0);
    window.addEventListener("focus", aggiorna);
    window.addEventListener("blur", aggiorna);
    return () => {
      smetti();
      window.removeEventListener("focus", aggiorna);
      window.removeEventListener("blur", aggiorna);
    };
  }, []);

  if (!API) return null;

  const colore = attiva ? "text-slate-600" : "text-slate-400";

  return (
    // Lo sfondo della pagina (`.sfondo-corioli`, fermo rispetto alla
    // finestra): la riga del titolo continua il verde del logo senza stacchi.
    <div className="sfondo-corioli fixed inset-x-0 top-0 z-[10000] flex h-barra select-none items-center [-webkit-app-region:drag] [app-region:drag]">
      <img
        src={`${import.meta.env.BASE_URL}corioli-icon.png`}
        alt=""
        draggable={false}
        className="ml-2.5 h-5 w-5 shrink-0"
      />
      {/* Il nome accanto al logo, come nelle finestre di Windows (chiesto il
          25 settembre 2026). A 14px e non ai 12 di sistema, per la stessa
          ragione per cui il logo e' passato da 16 a 20px. Fa parte della zona
          da trascinare, come il resto della barra. */}
      <span
        className={`ml-2 min-w-0 truncate text-sm ${attiva ? "text-slate-700" : "text-slate-400"}`}
      >
        Corioli Cardiologia
      </span>
      <div className="ml-auto flex h-full shrink-0">
        <button
          type="button"
          tabIndex={-1}
          title="Riduci a icona"
          aria-label="Riduci a icona"
          onClick={API.riduci}
          className={`${PULSANTE} ${colore} hover:bg-black/[0.06] hover:text-slate-900 active:bg-black/[0.1]`}
        >
          {GLIFO.riduci}
        </button>
        <button
          type="button"
          tabIndex={-1}
          title={ingrandita ? "Ripristina" : "Ingrandisci"}
          aria-label={ingrandita ? "Ripristina" : "Ingrandisci"}
          onClick={API.ingrandisci}
          className={`${PULSANTE} ${colore} hover:bg-black/[0.06] hover:text-slate-900 active:bg-black/[0.1]`}
        >
          {ingrandita ? GLIFO.ripristina : GLIFO.ingrandisci}
        </button>
        <button
          type="button"
          tabIndex={-1}
          title="Chiudi"
          aria-label="Chiudi"
          onClick={API.chiudi}
          className={`${PULSANTE} ${colore} hover:bg-[#c42b1c] hover:text-white active:bg-[#c42b1c]/90 active:text-white/90`}
        >
          {GLIFO.chiudi}
        </button>
      </div>
    </div>
  );
}
