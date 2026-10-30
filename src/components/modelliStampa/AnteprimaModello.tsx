import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Button, Tooltip } from "@nextui-org/react";
import { ChevronLeft, ChevronRight, Info, Loader2, TriangleAlert } from "lucide-react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { DocumentoImpaginato, ZonaStampa } from "../../services/PdfService";
import type { SezioneReferto } from "../../types/Storage";
import { getDocument } from "./immagini";

/** Le parti del modello che il pannello a destra sa modificare. */
export type ParteModello =
  | "pagina"
  | "intestazione"
  | "titolo"
  | "paziente"
  | "sezioni"
  | "firma"
  | "piede";

const PARTE_DELLA_ZONA: Record<ZonaStampa["zona"], ParteModello> = {
  intestazione: "intestazione",
  titolo: "titolo",
  paziente: "paziente",
  sezione: "sezioni",
  firma: "firma",
  piede: "piede",
};

const NOME_ZONA: Record<ZonaStampa["zona"], string> = {
  intestazione: "Carta intestata",
  titolo: "Titolo",
  paziente: "Dati del paziente",
  sezione: "Testo",
  firma: "Firma",
  piede: "Piè di pagina",
};

/**
 * Dove stanno pagine, pulsanti e suggerimento:
 * - "colonna": di fianco al foglio, uno sotto l'altro, con le scritte;
 * - "icone": di fianco al foglio, solo icone (la colonna dell'anteprima e' stretta);
 * - "sotto": sotto il foglio, su una riga (la colonna e' piu' alta che larga).
 */
export type DisposizioneComandi = "colonna" | "icone" | "sotto";

interface Props {
  documento: DocumentoImpaginato | null;
  pagina: number;
  onPagina: (pagina: number) => void;
  parteAttiva: ParteModello;
  sezioneAttiva: SezioneReferto | null;
  onScegli: (parte: ParteModello, sezione?: SezioneReferto) => void;
  /** Il titolo da mostrare sull'etichetta di una sezione del referto. */
  nomeSezione: (id: SezioneReferto) => string;
  inAggiornamento: boolean;
  /** I pulsanti dopo le pagine: schermo intero, stampa di prova. Si disegnano
   *  secondo dove stanno i comandi (vedi `DisposizioneComandi`). */
  azioni?: (disposizione: DisposizioneComandi) => ReactNode;
  /** Il suggerimento dopo i pulsanti. */
  nota?: ReactNode;
  /** Un avviso per quello che l'anteprima mostra e la stampa no. */
  avviso?: string;
  /** La barra di modifica da mostrare sul foglio accanto alla parte scelta. */
  strumenti?: (zona: ZonaStampa) => ReactNode;
}

/**
 * L'anteprima dell'editor: il PDF vero, disegnato da pdf.js, con sopra le
 * parti del foglio che si possono toccare.
 *
 * E' il PDF che uscira' dalla stampante, non una sua imitazione in HTML: le
 * zone vengono da `PdfService` (dove ha disegnato cosa) e si allineano al
 * millimetro. Si guarda una pagina alla volta, grande quanto lo spazio che la
 * pagina le da' (deve avere un'altezza: la colonna di sinistra dell'editor),
 * con pagine, comandi e suggerimento accanto o sotto, dove il foglio esce piu'
 * grande. Cosi' il pannello a destra resta sempre accanto a quello che si sta
 * cambiando.
 */
/** Larghezza della colonnina dei comandi con le scritte (w-52) e di quella con
 *  le sole icone (w-10), e spazio fra comandi e foglio (gap-3). */
const COLONNA_COMANDI_PX = 208;
const COLONNA_ICONE_PX = 40;
const SPAZIO_COMANDI_PX = 12;

export function AnteprimaModello({
  documento,
  pagina,
  onPagina,
  parteAttiva,
  sezioneAttiva,
  onScegli,
  nomeSezione,
  inAggiornamento,
  azioni,
  nota,
  avviso,
  strumenti,
}: Props) {
  const contenitore = useRef<HTMLDivElement>(null);
  const comandi = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [scala, setScala] = useState(2.6);
  const [disposizione, setDisposizione] = useState<DisposizioneComandi>("colonna");
  // L'altezza dei comandi quando stanno sotto: si misura ogni volta che ci
  // stanno, finche' non ci sono stati si stima.
  const altezzaSotto = useRef(96);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [sopra, setSopra] = useState<number | null>(null);
  // "Aggiorno l'anteprima" solo se ci vuole davvero: comparendo a ogni tasto
  // per un decimo di secondo lampeggiava sul foglio.
  const [lento, setLento] = useState(false);
  useEffect(() => {
    if (!inAggiornamento) {
      setLento(false);
      return;
    }
    const t = window.setTimeout(() => setLento(true), 450);
    return () => window.clearTimeout(t);
  }, [inAggiornamento]);

  const larghezzaMm = documento?.larghezza ?? 210;
  const altezzaMm = documento?.altezza ?? 297;
  const pagine = documento?.pagine ?? 1;
  const conComandi = pagine > 1 || Boolean(azioni) || Boolean(nota) || Boolean(avviso);

  // Millimetri -> pixel: il foglio intero deve stare nello spazio, se no il
  // fondo non si vedrebbe mai. Prima si ricavava dall'altezza della finestra
  // meno quello che si pensava ci fosse sopra e sotto, con una misura minima
  // che su un portatile da 768 righe tagliava il foglio; ora si misura lo
  // spazio vero. Largo quanto lo spazio e da scorrere era piu' leggibile, ma il
  // medico lo vuole vedere tutto: per guardare da vicino c'e' lo schermo intero.
  // I comandi sotto il foglio gli tolgono righe, e il foglio verticale, che si
  // adatta all'altezza, usciva piccolo; ai lati invece di solito avanza
  // spazio. Si fanno i conti nei tre modi e si sceglie quello col foglio piu'
  // grande: sugli schermi larghi una colonnina con le scritte, sul portatile
  // (colonna dell'anteprima stretta) solo icone, sotto se la colonna e' piu'
  // alta che larga. Le scritte si tengono finche' costano poco al foglio.
  useLayoutEffect(() => {
    const el = contenitore.current;
    if (!el) return;
    const barra = comandi.current;
    const misura = () => {
      const larga = el.clientWidth;
      const alta = el.clientHeight;
      if (!conComandi) {
        const s = Math.min(larga / larghezzaMm, alta / altezzaMm);
        if (s > 0) setScala(Math.min(s, 4.2));
        return;
      }
      if (disposizione === "sotto" && barra) altezzaSotto.current = barra.offsetHeight;
      const diFianco = (colonnaPx: number) =>
        Math.min((larga - colonnaPx - SPAZIO_COMANDI_PX) / larghezzaMm, alta / altezzaMm);
      const scale: Record<DisposizioneComandi, number> = {
        colonna: diFianco(COLONNA_COMANDI_PX),
        icone: diFianco(COLONNA_ICONE_PX),
        sotto: Math.min(
          larga / larghezzaMm,
          (alta - altezzaSotto.current - SPAZIO_COMANDI_PX) / altezzaMm,
        ),
      };
      const migliore = Math.max(scale.icone, scale.sotto);
      const scelta: DisposizioneComandi =
        scale.colonna >= migliore * 0.97 ? "colonna" : scale.icone >= scale.sotto ? "icone" : "sotto";
      setDisposizione(scelta);
      if (scale[scelta] > 0) setScala(Math.min(scale[scelta], 4.2));
    };
    misura();
    const osservatore = new ResizeObserver(misura);
    osservatore.observe(el);
    if (barra) osservatore.observe(barra);
    return () => osservatore.disconnect();
  }, [larghezzaMm, altezzaMm, conComandi, disposizione]);

  // Un PDF nuovo a ogni modifica del modello: si carica, e il vecchio si chiude.
  useEffect(() => {
    if (!documento) return;
    let annullato = false;
    let caricato: PDFDocumentProxy | null = null;
    void (async () => {
      try {
        const dati = new Uint8Array(await documento.blob.arrayBuffer());
        caricato = await getDocument({ data: dati }).promise;
        if (annullato) {
          void caricato.destroy();
          return;
        }
        setErrore(null);
        setPdf(caricato);
      } catch (e) {
        console.error("Anteprima del modello non disponibile", e);
        if (!annullato) setErrore("L'anteprima non si è caricata. Riprova a cambiare un'impostazione.");
      }
    })();
    return () => {
      annullato = true;
    };
  }, [documento]);

  useEffect(() => () => void pdf?.destroy(), [pdf]);

  // Si disegna fuori schermo e si copia: il foglio vecchio resta visibile
  // finche' il nuovo non e' pronto, e l'anteprima non lampeggia a ogni tasto.
  useEffect(() => {
    if (!pdf || !tela.current) return;
    let annullato = false;
    const n = Math.min(Math.max(pagina, 1), pdf.numPages);
    void (async () => {
      try {
        const pag = await pdf.getPage(n);
        const dpr = window.devicePixelRatio || 1;
        const pxPerPunto = (scala * 25.4) / 72;
        const viewport = pag.getViewport({ scale: pxPerPunto * dpr });
        const fuori = document.createElement("canvas");
        fuori.width = Math.round(viewport.width);
        fuori.height = Math.round(viewport.height);
        const ctx = fuori.getContext("2d");
        if (!ctx) return;
        await pag.render({ canvasContext: ctx, viewport }).promise;
        if (annullato || !tela.current) return;
        const visibile = tela.current;
        visibile.width = fuori.width;
        visibile.height = fuori.height;
        visibile.getContext("2d")?.drawImage(fuori, 0, 0);
      } catch (e) {
        if (!annullato) console.error("Pagina dell'anteprima non disegnata", e);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [pdf, pagina, scala]);

  const zone = (documento?.zone ?? []).filter((z) => z.pagina === pagina);
  const ml = documento?.ml ?? 18;
  const mr = documento?.mr ?? 192;

  const attiva = (z: ZonaStampa) =>
    PARTE_DELLA_ZONA[z.zona] === parteAttiva &&
    (z.zona !== "sezione" || !z.sezione || !sezioneAttiva || z.sezione === sezioneAttiva);

  const etichetta = (z: ZonaStampa) =>
    z.zona === "sezione" && z.sezione ? nomeSezione(z.sezione) : NOME_ZONA[z.zona];

  // La parte scelta, su questa pagina, che ha la barra di modifica: per le
  // sezioni del referto solo quella toccata, non tutte.
  const zonaScelta = zone.find((z) => attiva(z) && (!z.sezione || z.sezione === sezioneAttiva));
  const barra = zonaScelta && strumenti ? strumenti(zonaScelta) : null;
  const altezzaFoglio = altezzaMm * scala;
  // Sotto la parte, o sopra se e' in fondo al foglio.
  const barraSotto = zonaScelta ? zonaScelta.y1 * scala + 90 < altezzaFoglio : true;
  const sotto = disposizione === "sotto";
  const icone = disposizione === "icone";

  return (
    // Foglio e comandi centrati insieme: i comandi restano attaccati al
    // foglio, dove si sta guardando.
    <div
      ref={contenitore}
      className={[
        "flex h-full min-h-0 w-full min-w-0 gap-3",
        sotto && conComandi ? "flex-col items-center" : "items-start justify-center",
      ].join(" ")}
    >
      <div
        className="relative shrink-0 bg-white shadow-[0_2px_14px_rgba(15,23,42,0.16)] ring-1 ring-default-200"
        style={{ width: larghezzaMm * scala, height: altezzaMm * scala }}
      >
        <canvas
          ref={tela}
          className="absolute inset-0 h-full w-full"
          aria-label="Anteprima del documento stampato"
        />
        {zone.map((z, i) => {
          const accesa = attiva(z);
          const evidenziata = sopra === i;
          return (
            <button
              key={`${z.zona}-${z.sezione ?? ""}-${i}`}
              type="button"
              onClick={() => onScegli(PARTE_DELLA_ZONA[z.zona], z.sezione)}
              onMouseEnter={() => setSopra(i)}
              onMouseLeave={() => setSopra((s) => (s === i ? null : s))}
              onFocus={() => setSopra(i)}
              onBlur={() => setSopra((s) => (s === i ? null : s))}
              aria-label={`Modifica: ${etichetta(z)}`}
              className={[
                "absolute rounded-md outline-none transition-colors",
                accesa
                  ? "border-2 border-brand-600 bg-brand-500/[0.07]"
                  : evidenziata
                    ? "border-2 border-dashed border-brand-500 bg-brand-500/[0.05]"
                    : "border-2 border-transparent",
              ].join(" ")}
              style={{
                left: (ml - 3) * scala,
                width: (mr - ml + 6) * scala,
                top: z.y0 * scala,
                height: (z.y1 - z.y0) * scala,
              }}
            >
              {(accesa || evidenziata) && (
                <span
                  className={[
                    // In cima al foglio l'etichetta sta dentro la zona: fuori
                    // finirebbe tagliata dal bordo dello spazio del foglio.
                    "pointer-events-none absolute left-2 rounded-md px-2 py-0.5 text-[13px] font-semibold text-white shadow-sm",
                    z.y0 * scala < 18 ? "top-1.5" : "-top-3.5",
                    accesa ? "bg-brand-700" : "bg-brand-600",
                  ].join(" ")}
                >
                  {etichetta(z)}
                </span>
              )}
            </button>
          );
        })}
        {zonaScelta && barra && (
          <div
            className="absolute z-30 rounded-xl bg-white p-2 shadow-[0_6px_24px_rgba(15,23,42,0.18)] ring-1 ring-default-200"
            style={{
              left: (ml - 3) * scala,
              maxWidth: (mr - ml + 6) * scala,
              ...(barraSotto
                ? { top: zonaScelta.y1 * scala + 6 }
                : { bottom: altezzaFoglio - zonaScelta.y0 * scala + 6 }),
            }}
          >
            {barra}
          </div>
        )}
        {lento && (
          <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-2 rounded-lg bg-white/95 px-3 py-1.5 text-sm text-default-600 shadow-sm ring-1 ring-default-200">
            <Loader2 size={16} className="animate-spin" />
            Aggiorno l&apos;anteprima
          </div>
        )}
        {errore && (
          <div className="absolute inset-x-6 top-1/3 rounded-lg bg-danger-50 p-4 text-center text-sm text-danger-700 ring-1 ring-danger-200">
            {errore}
          </div>
        )}
      </div>
      {/* Pagine, pulsanti e suggerimento: accanto al foglio in alto, in una
          colonnina (con le scritte o solo icone), o sotto su una riga larga
          quanto il riquadro (se non basta, pagine e pulsanti su una e il
          suggerimento sotto). */}
      {conComandi && (
        <div
          ref={comandi}
          className={
            sotto
              ? "flex w-full shrink-0 flex-wrap items-center justify-center gap-x-6 gap-y-2"
              : [
                  "corioli-scroll flex max-h-full shrink-0 flex-col overflow-y-auto",
                  icone ? "w-10 items-center gap-2" : "w-52 gap-3",
                ].join(" ")
          }
        >
          {pagine > 1 && (
            <div
              className={
                icone
                  ? "flex flex-col items-center gap-1"
                  : sotto
                    ? "flex items-center gap-2"
                    : "flex items-center justify-between gap-1"
              }
            >
              <Button
                isIconOnly
                variant="flat"
                className="bg-white shadow-sm"
                aria-label="Pagina precedente"
                isDisabled={pagina <= 1}
                onPress={() => onPagina(pagina - 1)}
              >
                <ChevronLeft size={20} />
              </Button>
              <p
                className={
                  icone
                    ? "text-center text-xs font-medium text-default-700"
                    : sotto
                      ? "min-w-[8.5rem] text-center text-base font-medium text-default-700"
                      : "text-center text-sm font-medium text-default-700"
                }
                aria-label={`Pagina ${pagina} di ${pagine}`}
              >
                {icone ? `${pagina}/${pagine}` : `Pagina ${pagina} di ${pagine}`}
              </p>
              <Button
                isIconOnly
                variant="flat"
                className="bg-white shadow-sm"
                aria-label="Pagina successiva"
                isDisabled={pagina >= pagine}
                onPress={() => onPagina(pagina + 1)}
              >
                <ChevronRight size={20} />
              </Button>
            </div>
          )}
          {azioni?.(disposizione)}
          {icone ? (
            // Nella colonnina stretta suggerimento e avviso sono icone: il testo
            // compare passandoci sopra.
            <>
              {nota && (
                <Tooltip placement="right" content={<div className="max-w-xs py-1">{nota}</div>}>
                  <span
                    tabIndex={0}
                    aria-label="Suggerimento"
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-brand-600 outline-none hover:bg-white"
                  >
                    <Info size={20} />
                  </span>
                </Tooltip>
              )}
              {avviso && (
                <Tooltip placement="right" content={<p className="max-w-xs py-1 text-sm">{avviso}</p>}>
                  <span
                    tabIndex={0}
                    aria-label={avviso}
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700 outline-none ring-1 ring-amber-200"
                  >
                    <TriangleAlert size={18} />
                  </span>
                </Tooltip>
              )}
            </>
          ) : (
            <>
              {nota}
              {avviso && (
                <p
                  className={[
                    "rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 ring-1 ring-amber-200",
                    sotto ? "basis-full text-center" : "",
                  ].join(" ")}
                >
                  {avviso}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
