import { type TextAreaProps } from "@nextui-org/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { testoDaiNodi, testoInHtml } from "../utils/grassettoReferto";

/**
 * Il campo di testo del referto.
 *
 * Non e' piu' una `textarea`: e' un'area modificabile che **mostra il grassetto
 * vero** mentre si scrive. Il valore che esce resta testo semplice con i
 * marcatori `**`, quindi per chi lo salva e per chi lo stampa non cambia
 * niente; a cambiare e' solo quello che il medico vede nel campo, dove gli
 * asterischi sembravano un errore dell'applicazione (22 settembre 2026).
 *
 * Il grassetto si mette in tre modi: **Ctrl+B**, il **tasto destro** e la
 * scorciatoia di sistema, perche' dentro un'area modificabile il grassetto e'
 * quello del browser e non una nostra imitazione.
 *
 * Il tasto destro nell'app apre il menu di Windows (electron/main.js), con i
 * suggerimenti del correttore, Taglia/Copia/Incolla e "Grassetto", che arriva
 * qui come messaggio. Il menu disegnato dalla pagina, con le stesse voci di
 * base, resta per il browser e per un'app avviata col preload di prima.
 */

/** Altezza di una riga, in pixel: serve a dare al campo l'altezza minima. */
const ALTEZZA_RIGA = 26;

type Props = Omit<TextAreaProps, "ref"> & {
  /** Etichetta sopra il campo (come la usa l'editor dei modelli). */
  label?: React.ReactNode;
  /** Riga di spiegazione sotto il campo. */
  description?: React.ReactNode;
};

/** Presente solo nell'app: "Grassetto" scelto nel menu del tasto destro. */
const onGrassettoDaMenu = (
  window as unknown as {
    electronAPI?: { onGrassettoReferto?: (callback: () => void) => () => void };
  }
).electronAPI?.onGrassettoReferto;

/** Una voce del menu del tasto destro disegnato dalla pagina. */
function VoceMenu({
  etichetta,
  tasti,
  disabilitata,
  onScegli,
}: {
  etichetta: React.ReactNode;
  tasti: string;
  disabilitata?: boolean;
  onScegli: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabilitata}
      className="flex w-full items-center justify-between gap-6 px-3 py-1.5 text-left text-sm text-default-700 hover:bg-default-100 disabled:cursor-default disabled:text-default-400 disabled:hover:bg-transparent"
      // Il mouse giu' sposterebbe il fuoco fuori dal campo e con esso la
      // selezione su cui agire.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onScegli}
    >
      <span>{etichetta}</span>
      <span className="text-xs text-default-500">{tasti}</span>
    </button>
  );
}

/** Applica il grassetto alla selezione dentro l'area modificabile. */
function comandoGrassetto(): void {
  // `styleWithCSS` a false fa produrre `<b>`, non uno `<span>` con lo stile:
  // il `<b>` e' quello che `testoDaiNodi` sa ritradurre in marcatori.
  try {
    document.execCommand("styleWithCSS", false, "false");
  } catch {
    // Alcuni browser non conoscono il comando: il grassetto funziona lo stesso.
  }
  document.execCommand("bold");
}

export function RefertoTextarea({
  value,
  minRows = 2,
  classNames,
  className,
  onValueChange,
  onKeyDown,
  placeholder,
  label,
  description,
  isDisabled,
  ...props
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  /**
   * L'ultimo testo che il campo ha prodotto da solo.
   *
   * Serve a non riscrivergli dentro il contenuto mentre si digita: rimettere
   * l'HTML a ogni tasto riporterebbe il cursore in cima. Si riscrive solo
   * quando il valore arriva da fuori — un modello applicato, la copia della
   * visita precedente, il caricamento di una visita in archivio.
   */
  const ultimoTestoInterno = useRef<string | null>(null);
  /** Menu del tasto destro disegnato dalla pagina; `selezione`: c'e' testo selezionato. */
  const [menu, setMenu] = useState<{ x: number; y: number; selezione: boolean } | null>(null);
  const [vuoto, setVuoto] = useState(!value);

  const testoCorrente = typeof value === "string" ? value : "";

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (ultimoTestoInterno.current === testoCorrente) return;
    el.innerHTML = testoInHtml(testoCorrente);
    ultimoTestoInterno.current = testoCorrente;
    setVuoto(!testoCorrente);
  }, [testoCorrente]);

  const propaga = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const testo = testoDaiNodi(el.childNodes);
    ultimoTestoInterno.current = testo;
    setVuoto(!testo);
    onValueChange?.(testo);
  }, [onValueChange]);

  // Il messaggio arriva a tutti i campi del referto della pagina: agisce solo
  // quello col cursore dentro. `propaga` passa da un ref per non staccare e
  // riattaccare l'ascolto a ogni tasto premuto.
  const propagaRef = useRef(propaga);
  propagaRef.current = propaga;
  useEffect(() => {
    if (!onGrassettoDaMenu) return;
    return onGrassettoDaMenu(() => {
      const el = editorRef.current;
      if (!el || !el.contains(document.activeElement)) return;
      comandoGrassetto();
      propagaRef.current();
    });
  }, []);

  /** Chiude il menu del tasto destro al primo clic o Esc fuori di esso. */
  useEffect(() => {
    if (!menu) return;
    const chiudi = () => setMenu(null);
    const suEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", chiudi);
    window.addEventListener("keydown", suEsc);
    return () => {
      window.removeEventListener("pointerdown", chiudi);
      window.removeEventListener("keydown", suEsc);
    };
  }, [menu]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e as unknown as React.KeyboardEvent<HTMLInputElement>);
    if (e.defaultPrevented) return;
    if (e.key.toLowerCase() !== "b" || e.altKey) return;
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    comandoGrassetto();
    propaga();
  };

  /**
   * Incollare porta dentro testo, non la grafica di dove si copiava.
   *
   * Una tabella incollata da un altro gestionale arriverebbe con i suoi font e
   * i suoi colori, che il referto non sa stampare: si salverebbe una
   * formattazione destinata a sparire.
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const testo = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, testo);
  };

  const mergedClass = (slot: "base" | "input" | "inputWrapper") =>
    [classNames?.[slot]].filter(Boolean).join(" ");

  return (
    <div
      className={["group w-full min-w-0 relative", className, mergedClass("base")]
        .filter(Boolean)
        .join(" ")}
    >
      {label && (
        <label className="block text-sm text-default-600 mb-1.5">{label}</label>
      )}
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label={typeof label === "string" ? label : props["aria-label"]}
        contentEditable={!isDisabled}
        suppressContentEditableWarning
        spellCheck
        onInput={propaga}
        onBlur={propaga}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onContextMenu={(e) => {
          if (isDisabled || onGrassettoDaMenu) return;
          e.preventDefault();
          const sel = window.getSelection();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            selezione: Boolean(
              sel && !sel.isCollapsed && editorRef.current?.contains(sel.anchorNode),
            ),
          });
        }}
        data-placeholder={placeholder}
        title={props.title}
        style={{ minHeight: minRows * ALTEZZA_RIGA }}
        className={[
          "referto-editor w-full rounded-medium border-2 border-default-200 bg-white",
          "px-3 py-2 text-base leading-relaxed text-foreground",
          "transition-colors hover:border-default-400 focus:border-primary focus:outline-none",
          isDisabled ? "opacity-60 cursor-not-allowed" : "",
          mergedClass("inputWrapper"),
          mergedClass("input"),
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {/* Il segnaposto non puo' stare nel campo: sarebbe testo da cancellare. */}
      {vuoto && placeholder && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3 text-base leading-relaxed text-default-500"
          style={{ top: label ? 30 : 8 }}
        >
          {placeholder}
        </span>
      )}
      {description && (
        <p className="mt-1 text-xs text-default-500">{description}</p>
      )}
      {menu && (
        <div
          role="menu"
          className="fixed z-50 min-w-[190px] rounded-lg border border-default-200 bg-white py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <VoceMenu
            etichetta="Taglia"
            tasti="Ctrl+X"
            disabilitata={!menu.selezione}
            onScegli={() => {
              document.execCommand("cut");
              propaga();
              setMenu(null);
            }}
          />
          <VoceMenu
            etichetta="Copia"
            tasti="Ctrl+C"
            disabilitata={!menu.selezione}
            onScegli={() => {
              document.execCommand("copy");
              setMenu(null);
            }}
          />
          <VoceMenu
            etichetta="Incolla"
            tasti="Ctrl+V"
            onScegli={() => {
              setMenu(null);
              // Come Ctrl+V (`handlePaste`): entra solo il testo. Se leggere
              // gli appunti non e' permesso, resta la tastiera.
              void navigator.clipboard
                .readText()
                .then((testo) => {
                  editorRef.current?.focus();
                  document.execCommand("insertText", false, testo);
                })
                .catch(() => {});
            }}
          />
          <div className="my-1 border-t border-default-100" />
          <VoceMenu
            etichetta={<span className="font-semibold">Grassetto</span>}
            tasti="Ctrl+B"
            onScegli={() => {
              comandoGrassetto();
              propaga();
              setMenu(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
