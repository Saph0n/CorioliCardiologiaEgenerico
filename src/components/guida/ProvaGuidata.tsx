import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@nextui-org/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, MousePointerClick, PenLine } from "lucide-react";
import DoctorMascot from "../app-lock/DoctorMascot";
import Riflettore, { PromemoriaGuida } from "./Riflettore";
import { Battuta, DemoGrassetto, Nuvoletta, TastiAnimati } from "./Narratore";
import { trovaNellaPagina } from "./livelloGuida";
import {
  EVENTO_APRI_NUOVA_VISITA,
  EVENTO_REFERTO_APERTO,
  pazienteDellaVisita,
  passiGuida,
  type ContestoPasso,
} from "./passiGuida";

/** Ogni quanto si rilegge la pagina per capire se il passo e' fatto. */
const INTERVALLO_CONTROLLO_MS = 150;
/**
 * Quanto resta a schermo il "Fatto" prima del passo dopo: abbastanza per
 * vedere il risultato (il testo del modello nel campo, il grassetto), non
 * tanto da sembrare bloccata.
 */
const PAUSA_DOPO_FATTO_MS = 900;
/**
 * Per quanto il contesto deve restare perso prima di tornare indietro, o la
 * ricerca chiusa prima di riaprirla. Premendo Invio nella ricerca il pannello
 * si chiude un attimo prima che la pagina cambi (il router aggiorna la rotta
 * in una transizione di React): per quel mezzo giro la guida vedeva "ricerca
 * chiusa, ancora in dashboard" e la riapriva mentre si apriva la scheda del
 * paziente.
 */
const TOLLERANZA_PERSO_MS = 600;
/**
 * Per quanto il gufo indica con l'ala all'inizio di un passo: il tempo di
 * dirlo e farlo vedere. Poi abbassa l'ala e resta a guardare, se no l'ala in
 * movimento accanto alla manina distrae.
 */
const INDICA_PER_MS = 3500;
/** Millisecondi fra un carattere e l'altro in "Scrivilo per me". */
const MS_PER_TASTO = 45;

/** Quello che il gufo dice a passo fatto, a giro. */
const LODI = ["Perfetto!", "Esatto, così.", "Ottimo!", "Ben fatto."];

/** Le scorciatoie dell'app che aprono finestre o salvano. */
const SCORCIATOIE_APP = ["n", "k", "p", "s"];

/**
 * C'e' aperta una finestra dell'app che non c'entra con il passo (una
 * conferma, il controllo prima della stampa): la guida si mette in pausa
 * invece di oscurarla e renderla impossibile da usare.
 */
function finestraEstranea(bersagli: string[]): boolean {
  const finestre = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]'),
  ).filter((d) => !d.closest("[data-guida-ui]"));
  if (finestre.length === 0) return false;
  const elementi = bersagli.flatMap((s) => Array.from(document.querySelectorAll(s)));
  return !finestre.some((f) => elementi.some((el) => f.contains(el)));
}

/**
 * Scrive in un campo controllato da React come se lo stesse scrivendo il
 * medico, un carattere alla volta: si vede il codice fiscale comparire nel
 * campo invece di trovarlo li' all'improvviso.
 *
 * Il valore va impostato col setter nativo e annunciato con un evento
 * `input`, se no React non se ne accorge e al primo render lo cancella.
 */
async function scriviNelCampo(selettore: string, testo: string, fermo: boolean) {
  const campo = trovaNellaPagina(selettore);
  if (!(campo instanceof HTMLInputElement)) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  campo.focus();
  const scrivi = (valore: string) => {
    setter?.call(campo, valore);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  };
  if (fermo) {
    scrivi(testo);
    return;
  }
  for (let i = 1; i <= testo.length; i++) {
    scrivi(testo.slice(0, i));
    await new Promise((r) => window.setTimeout(r, MS_PER_TASTO));
  }
  campo.focus();
}

type Props = {
  /** Tasto Ctrl, o Cmd sul Mac. */
  mod: string;
  /** Fatto l'ultimo passo. */
  onCompletata: () => void;
  /** "Esci dalla guida". */
  onEsci: () => void;
  /** Il paziente di prova e' stato registrato: da cancellare alla fine. */
  onPazienteProva: (id: string) => void;
};

/**
 * La prova guidata: un passo alla volta, sull'app vera.
 *
 * Un ciclo rilegge la pagina (`ContestoPasso`) e decide: passo fatto → un
 * attimo di "Fatto" e si va avanti; contesto perso (di nuovo in dashboard
 * prima di salvare il paziente) → si torna al passo che lo ricrea; ricerca
 * chiusa con Esc → si riapre; finestra estranea aperta → pausa.
 */
export default function ProvaGuidata({ mod, onCompletata, onEsci, onPazienteProva }: Props) {
  const passi = useMemo(() => passiGuida(mod), [mod]);
  const idTitolo = useId();
  const location = useLocation();
  const [indice, setIndice] = useState(0);
  const [fatto, setFatto] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [pausa, setPausa] = useState(false);
  const [cenno, setCenno] = useState(0);
  const [parla, setParla] = useState(false);
  const [indica, setIndica] = useState(true);
  const [scrivendo, setScrivendo] = useState(false);
  const fermo = useReducedMotion() ?? false;

  const posizioneRef = useRef({ percorso: location.pathname, ricerca: location.search });
  posizioneRef.current = { percorso: location.pathname, ricerca: location.search };
  const eventiRef = useRef<Set<string>>(new Set());
  const inChiusuraRef = useRef(false);
  const pazienteRegistratoRef = useRef(false);
  const timerPassoRef = useRef<number | undefined>(undefined);
  const persoDalRef = useRef<number | null>(null);
  const ricercaApertaRef = useRef(false);
  const ricercaChiusaDalRef = useRef<number | null>(null);

  // Uscendo dalla guida durante il "Fatto" il passo dopo non deve partire.
  useEffect(() => () => window.clearTimeout(timerPassoRef.current), []);

  const passo = passi[indice];

  // A ogni passo il gufo indica per un po', poi abbassa l'ala.
  useEffect(() => {
    setIndica(true);
    const t = window.setTimeout(() => setIndica(false), INDICA_PER_MS);
    return () => window.clearTimeout(t);
  }, [indice]);

  const vaiAlPasso = useCallback(
    (prossimo: number) => {
      eventiRef.current = new Set();
      inChiusuraRef.current = false;
      persoDalRef.current = null;
      ricercaApertaRef.current = false;
      ricercaChiusaDalRef.current = null;
      setFatto(false);
      setPronto(false);
      setCenno((n) => n + 1);
      if (prossimo >= passi.length) onCompletata();
      else setIndice(prossimo);
    },
    [passi.length, onCompletata],
  );

  // Eventi che la pagina lancia per la guida (il referto aperto in PDF).
  useEffect(() => {
    const registra = (e: Event) => eventiRef.current.add(e.type);
    window.addEventListener(EVENTO_REFERTO_APERTO, registra);
    return () => window.removeEventListener(EVENTO_REFERTO_APERTO, registra);
  }, []);

  // Il ciclo di controllo.
  useEffect(() => {
    const contesto = (): ContestoPasso => ({
      ...posizioneRef.current,
      esiste: (s) => trovaNellaPagina(s) !== null,
      testo: (s) => trovaNellaPagina(s)?.textContent ?? "",
      valore: (s) => {
        const el = trovaNellaPagina(s);
        return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : "";
      },
      eventi: eventiRef.current,
    });

    const controlla = () => {
      if (inChiusuraRef.current) return;
      const c = contesto();

      // Il paziente di prova nasce quando si apre la sua visita: da qui la
      // guida sa quale cancellare alla fine.
      if (!pazienteRegistratoRef.current && passo.id === "salva-paziente") {
        const id = pazienteDellaVisita(c);
        if (id) {
          pazienteRegistratoRef.current = true;
          onPazienteProva(id);
        }
      }

      if (passo.fatto?.(c)) {
        inChiusuraRef.current = true;
        setPausa(false);
        setFatto(true);
        const attesa = passo.tipo === "attesa" ? 0 : PAUSA_DOPO_FATTO_MS;
        timerPassoRef.current = window.setTimeout(() => vaiAlPasso(indice + 1), attesa);
        return;
      }

      const ritorno = passo.perso?.(c);
      if (ritorno) {
        const adesso = Date.now();
        persoDalRef.current ??= adesso;
        const i = passi.findIndex((p) => p.id === ritorno);
        if (i >= 0 && i !== indice && adesso - persoDalRef.current >= TOLLERANZA_PERSO_MS) {
          vaiAlPasso(i);
          return;
        }
      } else {
        persoDalRef.current = null;
      }

      // La ricerca del passo la apre la guida: subito all'inizio, dopo la
      // tolleranza se si chiude (Esc, o Invio che cambia pagina).
      if (passo.apriRicerca?.(c)) {
        const adesso = Date.now();
        ricercaChiusaDalRef.current ??= adesso;
        if (
          !ricercaApertaRef.current ||
          adesso - ricercaChiusaDalRef.current >= TOLLERANZA_PERSO_MS
        ) {
          ricercaApertaRef.current = true;
          ricercaChiusaDalRef.current = null;
          window.dispatchEvent(new CustomEvent(EVENTO_APRI_NUOVA_VISITA));
        }
      } else {
        ricercaChiusaDalRef.current = null;
      }

      setPausa(passo.tipo !== "attesa" && finestraEstranea(passo.bersagli));
      setPronto(passo.pronto ? passo.pronto(c) : false);
    };

    const timer = window.setInterval(controlla, INTERVALLO_CONTROLLO_MS);
    return () => window.clearInterval(timer);
  }, [passo, indice, passi, vaiAlPasso, onPazienteProva]);

  // Scorciatoie: passano solo quelle che il passo chiede di provare. Le altre
  // aprirebbero finestre fuori copione. In pausa e nelle attese passa tutto:
  // si sta lavorando in una finestra dell'app.
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        if (passo.tipo === "guarda" && !pausa && e.key === "ArrowRight") {
          e.preventDefault();
          vaiAlPasso(indice + 1);
        }
        return;
      }
      const tasto = e.key.toLowerCase();
      if (!SCORCIATOIE_APP.includes(tasto)) return;
      if (pausa || passo.tipo === "attesa") return;
      if (passo.consentiti?.includes(tasto)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", suTasto, true);
    return () => window.removeEventListener("keydown", suTasto, true);
  }, [passo, pausa, indice, vaiAlPasso]);

  const numeroNelCapitolo = passi.filter((p) => p.capitolo === passo.capitolo);
  const posizioneNelCapitolo = numeroNelCapitolo.indexOf(passo) + 1;

  const esci = (
    <button type="button" className="guida-link" onClick={onEsci}>
      Esci dalla guida
    </button>
  );

  if (passo.tipo === "attesa" || pausa) {
    return (
      <PromemoriaGuida>
        <div className="shrink-0">
          <DoctorMascot size={60} parla={parla} svolazza={cenno} sguardo={{ x: 0.6, y: -0.5 }} />
        </div>
        <Nuvoletta className="min-w-0 flex-1">
          <p className="guida-passo">{pausa ? "Guida in pausa" : passo.capitolo}</p>
          <p className="text-[15px] font-semibold leading-snug text-foreground">
            <Battuta
              testo={pausa ? "Finisci qui, poi riprendiamo." : passo.titolo}
              onParla={setParla}
            />
          </p>
          {!pausa && <p className="text-[14px] text-default-600">{passo.testo}</p>}
          <div className="mt-1 text-right">{esci}</div>
        </Nuvoletta>
      </PromemoriaGuida>
    );
  }

  const prova = passo.tipo === "prova";
  const lode = LODI[indice % LODI.length];

  return (
    <Riflettore
      bersagli={passo.bersagli}
      chiave={passo.id}
      interattivo={prova}
      idTitolo={idTitolo}
      punta={fatto ? undefined : passo.punta}
    >
      {(info) => (
        <>
          <div className="guida-narratore">
            {/* Il gufo resta lo stesso fra un passo e l'altro: svolazza quando
                la guida si sposta, guarda il punto di cui parla, indica con
                l'ala all'inizio e festeggia quando il passo e' fatto. */}
            <div className="guida-narratore-gufo">
              <DoctorMascot
                size={84}
                parla={parla}
                svolazza={cenno}
                sguardo={fatto ? null : info.direzione}
                indica={!fatto && indica ? info.lato : null}
                happy={fatto}
                festeggia={fatto}
              />
            </div>
            <Nuvoletta className="min-w-0 flex-1">
              <motion.div
                key={passo.id}
                initial={fermo ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <p className="guida-passo">
                  {passo.capitolo} · {posizioneNelCapitolo} di {numeroNelCapitolo.length}
                </p>
                <h2 id={idTitolo} className="guida-fumetto-titolo">
                  {passo.titolo}
                </h2>
                <p className="guida-fumetto-testo">
                  <Battuta testo={fatto ? lode : passo.testo} onParla={setParla} />
                </p>
                {passo.demo === "grassetto" && !fatto ? (
                  <DemoGrassetto mod={mod} />
                ) : passo.tasti && !fatto ? (
                  <p className="mt-3 flex items-center gap-2 text-[14px] text-default-600">
                    Scorciatoia <TastiAnimati tasti={passo.tasti} />
                  </p>
                ) : null}
              </motion.div>
            </Nuvoletta>
          </div>
          {passo.scrivi && !fatto && (
            <div className="guida-scrivi">
              <span className="guida-scrivi-valore">{passo.scrivi.testo}</span>
              <Button
                variant="bordered"
                className="guida-btn-secondario border-default-300 bg-white"
                startContent={<PenLine size={16} />}
                isDisabled={scrivendo}
                onPress={() => {
                  const { selettore, testo } = passo.scrivi!;
                  setScrivendo(true);
                  void scriviNelCampo(selettore, testo, fermo).finally(() => setScrivendo(false));
                }}
              >
                {scrivendo ? "Sto scrivendo…" : "Scrivilo per me"}
              </Button>
            </div>
          )}
          <div className="guida-barra" aria-hidden>
            <div
              className="guida-barra-piena"
              style={{ width: `${((indice + (fatto ? 1 : 0)) / passi.length) * 100}%` }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            {esci}
            {fatto ? (
              <motion.span
                className="guida-fatto"
                role="status"
                initial={fermo ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
              >
                <Check size={18} /> Fatto
              </motion.span>
            ) : prova && !passo.pronto ? (
              <span className="guida-tocca-a-te">
                <MousePointerClick size={18} /> Tocca a te
              </span>
            ) : (
              <Button
                color="primary"
                className="guida-btn-primario"
                onPress={() => vaiAlPasso(indice + 1)}
                isDisabled={prova && !pronto}
                endContent={<ArrowRight size={16} />}
                autoFocus={!prova}
              >
                {indice < passi.length - 1 ? "Avanti" : "Fine"}
              </Button>
            )}
          </div>
        </>
      )}
    </Riflettore>
  );
}
