import { useEffect, useRef, useState } from "react";
import { Button } from "@nextui-org/react";
import { ArrowLeft, ArrowRight, Loader2, Maximize2, X } from "lucide-react";
import { DoctorService, ModelliStampaService } from "../../services/OfflineServices";
import { PdfService } from "../../services/PdfService";
import { PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, VISITA_ESEMPIO } from "../../data/esempiStampa";
import {
  STILI_PRONTI,
  modelloInUso,
  modelloPronto,
  prontoDi,
  usaStileProntoOvunque,
  type StilePronto,
  type Variante,
} from "../../utils/modelliStampa";
import type { Doctor, DocumentoStampa } from "../../types/Storage";
import { coloreCss } from "./colori";
import { getDocument } from "./immagini";
import { SceltaVariante } from "./stiliPronti";

interface Props {
  onIndietro: () => void;
  /** La scelta e' gia' salvata (o non si e' potuta salvare e il medico va avanti lo stesso). */
  onContinua: () => void;
  /** A ogni scelta: la mascotte fa un cenno. */
  onScelta?: () => void;
}

/** Larghezza dell'anteprima in pixel CSS. */
const LARGHEZZA = 400;
/**
 * Il foglio si disegna al doppio: nell'anteprima si rimpicciolisce, e
 * ingrandito si legge. Il testo di un A4 largo 400 pixel non si legge.
 */
const LARGHEZZA_DISEGNO = 800;
/** Si vede la parte alta del foglio, dove lo stile si riconosce: intestazione, titolo, paziente, prime sezioni. */
const ALTEZZA = 360;

/**
 * Lo stile pronto proposto a chi parte da zero: Corioli in bianco e nero, il
 * PDF di sempre (Pablo, 22 ottobre 2026). Gli altri sono a un clic.
 */
const PROPOSTO = { stile: "corioli", variante: "biancoNero" as Variante };

/**
 * Prima configurazione, dopo i dati del medico: come vuole i suoi documenti.
 *
 * L'anteprima e' il PDF vero, con il nome appena scritto in intestazione: chi
 * sceglie deve vedere il suo referto, non un disegno. Lo stile vale per
 * referto, ricetta, certificato e richiesta (vedi `usaStileProntoOvunque`) e
 * si cambia quando si vuole dall'editor dei modelli.
 */
export default function SceltaStileIniziale({ onIndietro, onContinua, onScelta }: Props) {
  const [stile, setStile] = useState<StilePronto>(
    () => STILI_PRONTI.find((s) => s.id === PROPOSTO.stile) ?? STILI_PRONTI[0],
  );
  const [variante, setVariante] = useState<Variante>(PROPOSTO.variante);
  const [documento, setDocumento] = useState<DocumentoStampa>("referto");
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [caricato, setCaricato] = useState(false);
  const [immagine, setImmagine] = useState<string | null>(null);
  const [inDisegno, setInDisegno] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [ingrandita, setIngrandita] = useState(false);
  const disegnate = useRef(new Map<string, string>());
  const richiesta = useRef(0);

  // Chi torna indietro dal PIN ritrova la scelta che aveva fatto.
  useEffect(() => {
    void (async () => {
      try {
        const [d, archivio] = await Promise.all([
          DoctorService.getDoctor(),
          ModelliStampaService.getArchivio(),
        ]);
        setDoctor(d);
        const gia = archivio.inUso.referto ? prontoDi(modelloInUso(archivio, "referto")) : undefined;
        if (gia) {
          setStile(gia.stile);
          setVariante(gia.variante);
        }
      } catch {
        // Senza profilo l'intestazione resta vuota: si sceglie lo stesso.
      } finally {
        setCaricato(true);
      }
    })();
  }, []);

  useEffect(() => {
    // Prima il profilo: la ricetta lo vuole, e l'anteprima disegnata senza
    // resterebbe in memoria senza intestazione.
    if (!caricato) return;
    const chiave = `${stile.id}-${variante}-${documento}`;
    const pronta = disegnate.current.get(chiave);
    if (pronta) {
      setImmagine(pronta);
      setInDisegno(false);
      return;
    }
    const numero = ++richiesta.current;
    setInDisegno(true);
    void (async () => {
      try {
        const url = await disegna(stile, variante, documento, doctor);
        disegnate.current.set(chiave, url);
        if (numero === richiesta.current) setImmagine(url);
      } catch (e) {
        console.error("Anteprima dello stile non disegnata", e);
      } finally {
        if (numero === richiesta.current) setInDisegno(false);
      }
    })();
  }, [stile, variante, documento, doctor, caricato]);

  useEffect(() => {
    if (!ingrandita) return;
    const tasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIngrandita(false);
    };
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [ingrandita]);

  const scegli = (s: StilePronto, v: Variante) => {
    if (s.id === stile.id && v === variante) return;
    setStile(s);
    setVariante(v);
    setErrore(null);
    onScelta?.();
  };

  const continua = async () => {
    // Una seconda pressione dopo un errore va avanti lo stesso: lo stile non
    // vale un blocco della configurazione, si sceglie anche dopo.
    if (errore) {
      onContinua();
      return;
    }
    setSalvataggio(true);
    try {
      const archivio = await ModelliStampaService.getArchivio();
      await ModelliStampaService.salvaArchivio(usaStileProntoOvunque(archivio, stile, variante));
      onContinua();
    } catch (e) {
      console.error("Stile dei documenti non salvato", e);
      setErrore(
        "La scelta non si è salvata. Puoi andare avanti lo stesso e farla dopo, in Impostazioni → Modelli di stampa.",
      );
    } finally {
      setSalvataggio(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_400px]">
        <div className="space-y-3">
          <SceltaVariante grande valore={variante} onScegli={(v) => scegli(stile, v)} />
          <div className="space-y-2" role="radiogroup" aria-label="Stile dei documenti">
            {STILI_PRONTI.map((s) => {
              const scelto = s.id === stile.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={scelto}
                  onClick={() => scegli(s, variante)}
                  className={[
                    "flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors",
                    scelto
                      ? "border-2 border-brand-600 bg-brand-50"
                      : "border-2 border-default-200 bg-white hover:border-default-400",
                  ].join(" ")}
                >
                  <span
                    className="mt-1 block h-4 w-4 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ background: coloreCss(s[variante].colore) }}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className={["block text-base font-semibold", scelto ? "text-brand-800" : "text-gray-900"].join(" ")}>
                      {s.nome}
                    </span>
                    <span className="block text-sm leading-snug text-default-600">{s.pregio}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <div
            className="relative mx-auto overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-default-200"
            style={{ width: LARGHEZZA, maxWidth: "100%", height: ALTEZZA }}
          >
            {immagine && (
              <button
                type="button"
                className="block w-full cursor-zoom-in"
                onClick={() => setIngrandita(true)}
                aria-label="Ingrandisci l'anteprima"
              >
                <img
                  src={immagine}
                  alt={`Anteprima: ${stile.nome}`}
                  className="block w-full"
                  style={{ opacity: inDisegno ? 0.55 : 1, transition: "opacity 120ms" }}
                />
              </button>
            )}
            {/* Il foglio continua: lo dice la sfumatura in fondo. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" />
            {inDisegno && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 size={28} className="animate-spin text-default-500" aria-label="Preparo l'anteprima" />
              </div>
            )}
            {immagine && !inDisegno && (
              <Button
                className="absolute bottom-3 right-3 bg-white/95 shadow-sm"
                variant="flat"
                startContent={<Maximize2 size={18} />}
                onPress={() => setIngrandita(true)}
              >
                Ingrandisci
              </Button>
            )}
          </div>
          <div className="flex items-center justify-center gap-2" role="radiogroup" aria-label="Documento da guardare">
            {(["referto", "ricetta"] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={documento === d}
                onClick={() => setDocumento(d)}
                className={[
                  "min-h-[44px] rounded-full px-5 text-[15px] font-medium transition-colors",
                  documento === d
                    ? "bg-slate-800 text-white"
                    : "bg-default-100 text-default-700 hover:bg-default-200",
                ].join(" ")}
              >
                {d === "referto" ? "Referto" : "Ricetta"}
              </button>
            ))}
          </div>
          <p className="text-center text-sm text-default-500">
            Paziente di prova, intestazione tua. Lo stesso stile vale per ricette, certificati e richieste.
          </p>
        </div>
      </div>

      {/* Il foglio intero, grande abbastanza da leggerlo. */}
      {ingrandita && immagine && (
        <div
          className="fixed inset-x-0 bottom-0 top-barra z-[70] flex flex-col items-center justify-center gap-4 bg-black/60 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Anteprima di ${stile.nome}`}
          onClick={() => setIngrandita(false)}
        >
          <img
            src={immagine}
            alt={`Anteprima: ${stile.nome}`}
            className="max-h-[calc(100%-5rem)] w-auto max-w-full rounded-lg bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <Button size="lg" startContent={<X size={18} />} onPress={() => setIngrandita(false)}>
            Chiudi
          </Button>
        </div>
      )}

      {errore && (
        <p className="text-sm text-danger" role="alert">
          {errore}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          variant="light"
          className="onboarding-back-btn sm:w-48"
          isDisabled={salvataggio}
          onPress={onIndietro}
          startContent={<ArrowLeft size={16} />}
        >
          Indietro
        </Button>
        <Button
          color="primary"
          className="onboarding-cta-btn flex-1"
          isLoading={salvataggio}
          onPress={() => void continua()}
          endContent={!salvataggio ? <ArrowRight size={18} /> : null}
        >
          {errore ? "Continua lo stesso" : `Continua con «${stile.nome}»`}
        </Button>
      </div>
    </div>
  );
}

/** Il documento di prova con lo stile, disegnato da pdf.js in un'immagine. */
async function disegna(
  stile: StilePronto,
  variante: Variante,
  documento: DocumentoStampa,
  doctor: Doctor | null,
): Promise<string> {
  const modello = modelloPronto(stile, variante, documento);
  const impaginato = documento === "referto"
    ? await PdfService.impaginaVisita(PAZIENTE_ESEMPIO, VISITA_ESEMPIO, { modello })
    : await PdfService.impaginaRicetta(PAZIENTE_ESEMPIO, RICETTA_ESEMPIO, doctor, modello);
  if (!impaginato) throw new Error("Documento di prova non impaginato");
  const pdf = await getDocument({ data: new Uint8Array(await impaginato.blob.arrayBuffer()) }).promise;
  try {
    const pagina = await pdf.getPage(1);
    const dpr = window.devicePixelRatio || 1;
    const scala = (LARGHEZZA_DISEGNO * dpr) / pagina.getViewport({ scale: 1 }).width;
    const viewport = pagina.getViewport({ scale: scala });
    const tela = document.createElement("canvas");
    tela.width = Math.round(viewport.width);
    tela.height = Math.round(viewport.height);
    const ctx = tela.getContext("2d");
    if (!ctx) throw new Error("Tela non disponibile");
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    return tela.toDataURL("image/png");
  } finally {
    void pdf.destroy();
  }
}
