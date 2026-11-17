import { useEffect, useRef, useState } from "react";
import { Spinner } from "@nextui-org/react";
import type { Doctor } from "../../types/Storage";
import { DoctorService } from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { PAZIENTE_ESEMPIO, VISITA_ESEMPIO } from "../../data/esempiStampa";
import { getDocument } from "../modelliStampa/immagini";

/** Sotto la carta intestata si lascia un filo di foglio, per far capire che continua. */
const MARGINE_SOTTO_MM = 4;
/** Se il PDF non dice dove finisce l'intestazione. */
const INTESTAZIONE_PREDEFINITA_MM = 45;

/**
 * La parte alta del referto, stampata davvero da `PdfService` con
 * il modello in uso e i dati del profilo (anche quelli non ancora salvati).
 * Non è un'imitazione in HTML: è il PDF disegnato da pdf.js e tagliato dove
 * finisce la carta intestata.
 */
export default function AnteprimaIntestazione({ profilo }: { profilo: Partial<Doctor> }) {
  const tela = useRef<HTMLCanvasElement>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const [salvato, setSalvato] = useState<Doctor | null | undefined>(undefined);
  const [inCorso, setInCorso] = useState(true);
  const [pronta, setPronta] = useState(false);
  const [errore, setErrore] = useState(false);

  useEffect(() => {
    void DoctorService.getDoctor()
      .then((d) => setSalvato(d ?? null))
      .catch(() => setSalvato(null));
  }, []);

  const chiave = JSON.stringify(profilo);

  useEffect(() => {
    if (salvato === undefined) return;
    let annullato = false;
    setInCorso(true);
    // Si aspetta che si smetta di scrivere: un PDF a ogni tasto è troppo.
    const timer = window.setTimeout(async () => {
      try {
        const doctor = { ...(salvato ?? { id: "", nome: "", cognome: "", email: "" }), ...profilo } as Doctor;
        const documento = await PdfService.impaginaVisita(PAZIENTE_ESEMPIO, VISITA_ESEMPIO, { doctor }, true);
        if (annullato || !documento) return;
        const pdf = await getDocument({ data: new Uint8Array(await documento.blob.arrayBuffer()) }).promise;
        try {
          if (annullato) return;
          const pagina = await pdf.getPage(1);
          const canvas = tela.current;
          const larghezzaCss = contenitore.current?.clientWidth || 560;
          if (!canvas) return;
          const base = pagina.getViewport({ scale: 1 });
          const dpr = window.devicePixelRatio || 1;
          const viewport = pagina.getViewport({ scale: (larghezzaCss * dpr) / base.width });
          const intestazione = documento.zone.find((z) => z.zona === "intestazione" && z.pagina === 1);
          const fineMm = Math.min(
            (intestazione?.y1 ?? INTESTAZIONE_PREDEFINITA_MM) + MARGINE_SOTTO_MM,
            documento.altezza,
          );
          // Si disegna fuori schermo e si copia: ridimensionare la tela
          // visibile la svuota, e l'anteprima lampeggerebbe a ogni tasto.
          const fuori = document.createElement("canvas");
          fuori.width = Math.round(viewport.width);
          fuori.height = Math.round((fineMm / documento.altezza) * viewport.height);
          const ctxFuori = fuori.getContext("2d");
          if (!ctxFuori) return;
          ctxFuori.fillStyle = "#fff";
          ctxFuori.fillRect(0, 0, fuori.width, fuori.height);
          await pagina.render({ canvasContext: ctxFuori, viewport }).promise;
          if (annullato) return;
          canvas.width = fuori.width;
          canvas.height = fuori.height;
          canvas.getContext("2d")?.drawImage(fuori, 0, 0);
          if (!annullato) {
            setPronta(true);
            setErrore(false);
          }
        } finally {
          void pdf.destroy();
        }
      } catch (e) {
        console.error("Anteprima dell'intestazione non disponibile", e);
        if (!annullato) setErrore(true);
      } finally {
        if (!annullato) setInCorso(false);
      }
    }, 350);
    return () => {
      annullato = true;
      window.clearTimeout(timer);
    };
    // `chiave` riassume `profilo`: l'oggetto cambia a ogni render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiave, salvato]);

  return (
    <figure className="space-y-2">
      <div
        ref={contenitore}
        className="relative overflow-hidden rounded-t-md border border-b-0 border-default-200 bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]"
      >
        <canvas
          ref={tela}
          aria-label="Anteprima dell'intestazione del referto"
          className={`block h-auto w-full ${pronta ? "" : "hidden"}`}
        />
        {!pronta ? (
          <div className="flex h-32 items-center justify-center text-xs text-default-400">
            {errore ? "L'anteprima non si è caricata." : <Spinner size="sm" />}
          </div>
        ) : null}
        {pronta && inCorso ? (
          <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm">
            <Spinner size="sm" />
          </span>
        ) : null}
        {/* Il foglio continua: si sfuma il bordo basso. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-b from-transparent to-white"
        />
      </div>
      <figcaption className="text-xs text-default-500">
        La parte alta del referto, come esce dalla stampante con il modello in uso.
      </figcaption>
    </figure>
  );
}
