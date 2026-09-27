import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { ATTRIBUTI_LIVELLO_GUIDA, trovaNellaPagina } from "./livelloGuida";

/** Aria fra l'elemento illuminato e il bordo del riflettore. */
const MARGINE_RIFLETTORE = 10;
/** Distanza fra il riflettore e il fumetto. */
const STACCO_FUMETTO = 16;
/** Distanza minima del fumetto dai bordi della finestra. */
const BORDO_FINESTRA = 16;
/** Col gufo accanto alla nuvoletta il fumetto e' piu' largo del testo solo. */
const LARGHEZZA_FUMETTO = 460;
/** Dove sta il gufo nel fumetto, dal suo angolo in alto a sinistra. */
const CENTRO_GUFO = { x: 56, y: 60 };
/**
 * Quanto aspettare che l'elemento compaia: fra un passo e l'altro spesso si
 * cambia pagina, e la pagina nuova mostra lo scheletro finche' i dati non sono
 * pronti. Dopo, il fumetto si mette al centro senza riflettore invece di
 * restare appeso.
 */
const ATTESA_BERSAGLIO_MS = 3000;
/**
 * Spazio da lasciare sopra l'elemento quando la pagina scorre per fare posto
 * al fumetto: sotto la navbar o la barra della visita, che restano in cima.
 */
const SPAZIO_TESTATA = 96;

type Rettangolo = { left: number; top: number; width: number; height: number };

/**
 * Rettangolo che contiene tutti gli elementi visibili dei selettori, in
 * coordinate della finestra. Piu' elementi insieme servono per le voci del
 * menu, per un campo col suo menu a tendina aperto, per due sezioni vicine.
 */
function misuraBersagli(selettori: string[]): Rettangolo | "nascosto" | null {
  const elementi = selettori.flatMap((s) =>
    Array.from(document.querySelectorAll<HTMLElement>(s)).filter(
      (el) => !el.closest("[data-guida-ui]"),
    ),
  );
  const rettangoli = elementi
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  // Nella pagina ma senza misura: le voci della navbar sotto i 768px stanno
  // nel menu a scomparsa. Inutile aspettarle.
  if (rettangoli.length === 0) return elementi.length > 0 ? "nascosto" : null;
  const left = Math.min(...rettangoli.map((r) => r.left));
  const top = Math.min(...rettangoli.map((r) => r.top));
  const right = Math.max(...rettangoli.map((r) => r.right));
  const bottom = Math.max(...rettangoli.map((r) => r.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

/** L'elemento, o un suo contenitore, resta fermo mentre la pagina scorre. */
function staFermo(el: HTMLElement): boolean {
  for (let nodo: HTMLElement | null = el; nodo && nodo !== document.body; nodo = nodo.parentElement) {
    const posizione = getComputedStyle(nodo).position;
    if (posizione === "sticky" || posizione === "fixed") return true;
  }
  return false;
}

function uguali(a: Rettangolo | null, b: Rettangolo | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

type Props = {
  /** Selettori degli elementi da illuminare. */
  bersagli: string[];
  /** Chiave del passo: al cambio si riparte da capo (attesa, scorrimento). */
  chiave: string;
  /** L'elemento illuminato si usa davvero (passi "prova"). */
  interattivo: boolean;
  /** Id del titolo del fumetto, per `aria-labelledby`. */
  idTitolo: string;
  /**
   * Dove mostrare la manina che tocca: il primo selettore che trova un
   * elemento. Solo nei passi in cui c'e' da premere qualcosa.
   */
  punta?: string[];
  /** Contenuto del fumetto; con una funzione riceve dove sta il bersaglio. */
  children: ReactNode | ((info: InfoRiflettore) => ReactNode);
};

/** Dove sta il bersaglio rispetto al gufo del fumetto. */
export type InfoRiflettore = {
  /** Da -1 a 1 su ciascun asse: dove deve guardare il gufo. */
  direzione: { x: number; y: number } | null;
  /** Da che parte indicare con l'ala. */
  lato: "sinistra" | "destra" | null;
};

type Punto = { x: number; y: number };

/**
 * La manina che va sul pulsante e lo tocca, con un'onda dove tocca. Gira in
 * tondo finche' il medico non lo fa lui; con "meno movimento" resta ferma sul
 * pulsante.
 *
 * Il dito e' la punta del disegno (11, 2,5 su 32): la manina si sposta di
 * tanto perche' tocchi proprio il centro dell'elemento.
 */
function Manina({ punto }: { punto: Punto }) {
  const fermo = useReducedMotion() ?? false;
  const giro = { duration: 2.6, repeat: Infinity, ease: "easeInOut" as const };
  return (
    <div className="guida-manina-punto" style={{ left: punto.x, top: punto.y }} aria-hidden>
      <motion.span
        className="guida-manina-onda"
        animate={fermo ? { opacity: 0 } : { opacity: [0, 0, 0.9, 0, 0], scale: [0.4, 0.4, 0.7, 3, 3] }}
        transition={fermo ? undefined : { ...giro, times: [0, 0.5, 0.52, 0.9, 1] }}
      />
      <motion.svg
        className="guida-manina"
        width="40"
        height="40"
        viewBox="0 0 32 32"
        style={{ left: -13.75, top: -3.1 }}
        animate={
          fermo
            ? { x: 0, y: 0, opacity: 1, scale: 1 }
            : {
                x: [54, 54, 0, 0, 0, 0, 54],
                y: [62, 62, 0, 0, 0, 0, 62],
                opacity: [0, 1, 1, 1, 1, 0, 0],
                scale: [1, 1, 1, 0.84, 1, 1, 1],
              }
        }
        transition={fermo ? undefined : { ...giro, times: [0, 0.1, 0.42, 0.5, 0.58, 0.82, 1] }}
      >
        <path
          d="M11 2.5c1.4 0 2.5 1.1 2.5 2.5v8.2c.5-.4 1.2-.7 1.9-.7 1.2 0 2.2.7 2.6 1.7.5-.5 1.2-.8 2-.8 1.3 0 2.4.9 2.7 2.1.4-.2.9-.4 1.4-.4 1.5 0 2.7 1.2 2.7 2.7V23c0 4.4-3.6 8-8 8h-3.3c-2.4 0-4.6-1.1-6.1-2.9l-4.9-6c-.9-1.1-.8-2.7.3-3.6 1.1-.9 2.6-.8 3.6.2l1.6 1.8V5c0-1.4 1.1-2.5 2.5-2.5z"
          fill="#ffffff"
          stroke="#163A33"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </motion.svg>
    </div>
  );
}

/**
 * Oscura la finestra e lascia in luce uno o piu' elementi veri della pagina,
 * con il fumetto della guida accanto.
 *
 * La misura si rifa' a ogni fotogramma invece che su resize e scroll: le
 * pagine si assestano mentre arrivano i dati, i menu si aprono, la pagina
 * scorre, e nessun evento lo dice tutto. Sono pochi elementi, e il ciclo vive
 * solo finche' la guida e' aperta.
 *
 * I clic fuori dal riquadro li fermano quattro pannelli attorno al buco: nei
 * passi "prova" il buco resta libero e l'elemento si usa, in quelli "guarda"
 * lo copre un quinto pannello. La rotella invece passa, e la pagina scorre.
 */
export default function Riflettore({
  bersagli,
  chiave,
  interattivo,
  idTitolo,
  punta,
  children,
}: Props) {
  const contenitoreRef = useRef<HTMLDivElement>(null);
  const fumettoRef = useRef<HTMLDivElement>(null);
  const [rettangolo, setRettangolo] = useState<Rettangolo | null>(null);
  const [scaduto, setScaduto] = useState(false);
  const [altezzaFumetto, setAltezzaFumetto] = useState(220);
  const [finestra, setFinestra] = useState({ w: window.innerWidth, h: window.innerHeight });
  const selettori = bersagli.join("|");
  const selettoriMano = (punta ?? []).join("|");
  const [mano, setMano] = useState<Punto | null>(null);

  // Misura continua dei bersagli, e scorrimento della pagina se stanno fuori.
  useEffect(() => {
    setRettangolo(null);
    setScaduto(false);
    setMano(null);
    const elenco = selettori.split("|");
    const elencoMano = selettoriMano ? selettoriMano.split("|") : [];
    let fotogramma = 0;
    let ultimo: Rettangolo | null = null;
    let ultimaMano: Punto | null = null;
    let scorso = false;
    const inizio = performance.now();

    const ciclo = () => {
      const misura = misuraBersagli(elenco);
      const r = misura === "nascosto" ? null : misura;
      const alto = contenitoreRef.current?.getBoundingClientRect().top ?? 0;

      // La manina va sul centro del primo elemento che c'e' (nel passo del
      // modello: la voce del menu se il menu e' aperto, se no il pulsante).
      let puntoMano: Punto | null = null;
      for (const sel of elencoMano) {
        const el = trovaNellaPagina(sel);
        const rm = el?.getBoundingClientRect();
        if (rm && rm.width > 0 && rm.height > 0) {
          puntoMano = { x: rm.left + rm.width / 2, y: rm.top + rm.height / 2 - alto };
          break;
        }
      }
      const manoCambiata =
        (puntoMano === null) !== (ultimaMano === null) ||
        (puntoMano !== null &&
          ultimaMano !== null &&
          (Math.abs(puntoMano.x - ultimaMano.x) > 0.5 || Math.abs(puntoMano.y - ultimaMano.y) > 0.5));
      if (manoCambiata) {
        ultimaMano = puntoMano;
        setMano(puntoMano);
      }
      const relativo = r ? { ...r, top: r.top - alto } : null;
      if (r && !scorso) {
        scorso = true;
        // Una volta per passo. Se il fumetto non ci sta ne' sopra ne' sotto
        // l'elemento (un campo del referto pieno di testo), la pagina scorre
        // quanto basta a portare l'elemento in alto e fargli posto sotto:
        // se no il fumetto finiva sopra le righe da selezionare.
        const areaH = window.innerHeight - alto;
        const cima = r.top - alto;
        const ingombro = (fumettoRef.current?.offsetHeight ?? 220) + STACCO_FUMETTO + MARGINE_RIFLETTORE;
        const staSotto = cima + r.height + ingombro <= areaH - BORDO_FINESTRA;
        const staSopra = cima - ingombro >= BORDO_FINESTRA;
        const primo = trovaNellaPagina(elenco[0]);
        const fuori =
          (r.top < alto + 90 || r.top + r.height > window.innerHeight - 40) &&
          !(primo && staFermo(primo));
        if (primo && staFermo(primo)) {
          // Navbar, barra della visita: stanno ferme mentre la pagina scorre,
          // e "portarle in vista" riportava la pagina in cima.
        } else if (!staSotto && !staSopra && r.height + SPAZIO_TESTATA <= areaH * 0.6) {
          // Anche se il fumetto non ci sta tutto sotto: con l'elemento in
          // alto finisce al massimo sulle ultime righe, non su quelle da usare.
          window.scrollBy({ top: cima - SPAZIO_TESTATA, behavior: "smooth" });
        } else if (fuori) {
          primo?.scrollIntoView({ block: "center", behavior: "smooth" });
        }
      }
      if (!uguali(relativo, ultimo)) {
        ultimo = relativo;
        setRettangolo(relativo);
      }
      if (misura === "nascosto" || (!r && performance.now() - inizio > ATTESA_BERSAGLIO_MS)) {
        setScaduto(true);
      }
    };
    const aOgniFotogramma = () => {
      ciclo();
      fotogramma = requestAnimationFrame(aOgniFotogramma);
    };
    fotogramma = requestAnimationFrame(aOgniFotogramma);
    // Di riserva: con la finestra coperta o una pagina in secondo piano il
    // browser sospende i fotogrammi, e il riflettore restava fermo al passo
    // prima finche' non si tornava sull'app.
    const riserva = window.setInterval(ciclo, 250);
    return () => {
      cancelAnimationFrame(fotogramma);
      window.clearInterval(riserva);
    };
  }, [selettori, selettoriMano, chiave]);

  useEffect(() => {
    const suResize = () => setFinestra({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", suResize);
    return () => window.removeEventListener("resize", suResize);
  }, []);

  useLayoutEffect(() => {
    const el = fumettoRef.current;
    if (!el) return;
    const osservatore = new ResizeObserver(() => setAltezzaFumetto(el.offsetHeight));
    osservatore.observe(el);
    setAltezzaFumetto(el.offsetHeight);
    return () => osservatore.disconnect();
  }, []);

  const alto = contenitoreRef.current?.getBoundingClientRect().top ?? 0;
  const areaW = finestra.w;
  const areaH = finestra.h - alto;
  const larghezza = Math.min(LARGHEZZA_FUMETTO, areaW - 2 * BORDO_FINESTRA);

  const buco = rettangolo
    ? {
        left: rettangolo.left - MARGINE_RIFLETTORE,
        top: rettangolo.top - MARGINE_RIFLETTORE,
        width: rettangolo.width + 2 * MARGINE_RIFLETTORE,
        height: rettangolo.height + 2 * MARGINE_RIFLETTORE,
      }
    : null;

  // Il fumetto va sotto il riflettore se c'e' posto, poi sopra, poi di
  // fianco; centrato sull'elemento finche' i bordi della finestra lo
  // permettono. Senza posto da nessuna parte finisce in basso, sopra
  // l'elemento, piuttosto che fuori.
  const limita = (valore: number, min: number, max: number) =>
    Math.min(Math.max(valore, min), Math.max(min, max));
  let posizione: { left: number; top: number };
  if (buco) {
    const sotto = buco.top + buco.height + STACCO_FUMETTO;
    const sopra = buco.top - STACCO_FUMETTO - altezzaFumetto;
    const aSinistra = buco.left - STACCO_FUMETTO - larghezza;
    const aDestra = buco.left + buco.width + STACCO_FUMETTO;
    const centroX = limita(
      buco.left + buco.width / 2 - larghezza / 2,
      BORDO_FINESTRA,
      areaW - BORDO_FINESTRA - larghezza,
    );
    const centroY = limita(
      buco.top + buco.height / 2 - altezzaFumetto / 2,
      BORDO_FINESTRA,
      areaH - BORDO_FINESTRA - altezzaFumetto,
    );
    if (sotto + altezzaFumetto <= areaH - BORDO_FINESTRA) {
      posizione = { left: centroX, top: sotto };
    } else if (sopra >= BORDO_FINESTRA) {
      posizione = { left: centroX, top: sopra };
    } else if (aSinistra >= BORDO_FINESTRA) {
      posizione = { left: aSinistra, top: centroY };
    } else if (aDestra + larghezza <= areaW - BORDO_FINESTRA) {
      posizione = { left: aDestra, top: centroY };
    } else {
      posizione = {
        left: centroX,
        top: Math.max(areaH - BORDO_FINESTRA - altezzaFumetto, BORDO_FINESTRA),
      };
    }
  } else {
    posizione = {
      left: (areaW - larghezza) / 2,
      top: Math.max((areaH - altezzaFumetto) / 2, BORDO_FINESTRA),
    };
  }

  // Finche' l'elemento non si trova (e non e' scaduta l'attesa) il fumetto
  // resta nascosto: comparire al centro e saltare accanto all'elemento un
  // attimo dopo sembra un errore.
  const inAttesa = !buco && !scaduto;

  // Dove guarda e indica il gufo: verso la manina se c'e', se no verso il
  // centro del riquadro.
  const obiettivo: Punto | null = mano ?? (buco ? { x: buco.left + buco.width / 2, y: buco.top + buco.height / 2 } : null);
  let info: InfoRiflettore = { direzione: null, lato: null };
  if (obiettivo) {
    const dx = obiettivo.x - (posizione.left + CENTRO_GUFO.x);
    const dy = obiettivo.y - (posizione.top + CENTRO_GUFO.y);
    const scala = Math.max(Math.abs(dx), Math.abs(dy), 1);
    info = {
      direzione: { x: dx / scala, y: dy / scala },
      lato: dx < -40 ? "sinistra" : "destra",
    };
  }

  // I pannelli che fermano i clic attorno al buco (o su tutto, senza buco).
  const pannelli: Rettangolo[] = buco
    ? [
        { left: 0, top: 0, width: areaW, height: Math.max(buco.top, 0) },
        {
          left: 0,
          top: buco.top + buco.height,
          width: areaW,
          height: Math.max(areaH - buco.top - buco.height, 0),
        },
        { left: 0, top: buco.top, width: Math.max(buco.left, 0), height: buco.height },
        {
          left: buco.left + buco.width,
          top: buco.top,
          width: Math.max(areaW - buco.left - buco.width, 0),
          height: buco.height,
        },
        ...(interattivo ? [] : [buco]),
      ]
    : [{ left: 0, top: 0, width: areaW, height: areaH }];

  return createPortal(
    <div
      ref={contenitoreRef}
      className="guida-riflettore-area"
      role="dialog"
      aria-modal="false"
      aria-labelledby={idTitolo}
      {...ATTRIBUTI_LIVELLO_GUIDA}
    >
      {pannelli.map((p, i) => (
        <div
          key={i}
          aria-hidden
          className="guida-riflettore-blocco"
          style={{ left: p.left, top: p.top, width: p.width, height: p.height }}
        />
      ))}
      {buco ? (
        <motion.div
          aria-hidden
          className={`guida-riflettore-buco ${interattivo ? "guida-riflettore-buco--prova" : ""}`}
          initial={false}
          animate={buco}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
        />
      ) : (
        <div aria-hidden className="guida-riflettore-velo" />
      )}
      <motion.div
        ref={fumettoRef}
        className="guida-fumetto"
        style={{ width: larghezza, visibility: inAttesa ? "hidden" : "visible" }}
        initial={false}
        animate={posizione}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
      >
        {typeof children === "function" ? children(info) : children}
      </motion.div>
      {mano && !inAttesa ? <Manina punto={mano} /> : null}
    </div>,
    document.body,
  );
}

/**
 * Promemoria della guida in basso a sinistra, senza oscurare niente: mentre si
 * lavora in una finestra dell'app (l'editor dei modelli, una conferma) la
 * guida si fa da parte e ricorda che cosa si aspetta.
 */
export function PromemoriaGuida({ children }: { children: ReactNode }) {
  return createPortal(
    <div className="guida-promemoria" role="status" {...ATTRIBUTI_LIVELLO_GUIDA}>
      {children}
    </div>,
    document.body,
  );
}
